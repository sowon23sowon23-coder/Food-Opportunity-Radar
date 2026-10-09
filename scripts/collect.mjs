import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import * as cheerio from "cheerio";
import { createClient } from "@supabase/supabase-js";
import Parser from "rss-parser";
import { collectInstagramAccount, readConfig as readInstagramConfig, toRawContentRow, redact } from "./instagram.mjs";

const rssParser = new Parser();

// General F&B trade press covers everything; only keep articles that are
// relevant to our tracked brands or the wider frozen dessert / sweet-treat
// category. Trade headlines rarely say "froyo", so adjacent categories,
// toppings, and LTO/flavor news are included too — extract.mjs decides
// whether an article is an actual signal.
const RELEVANCE_KEYWORDS = [
  // tracked brands
  "menchie",
  "pinkberry",
  "sweetfrog",
  "sweet frog",
  "tcby",
  "16 handles",
  "red mango",
  "yogurtland",
  "yo-chi",
  "yochi",
  "go greek",
  // category
  "frozen yogurt",
  "froyo",
  "fro-yo",
  "yogurt",
  "soft serve",
  "soft-serve",
  "ice cream",
  "gelato",
  "frozen dessert",
  "frozen treat",
  "dessert",
  "sundae",
  "acai",
  "açaí",
  "boba",
  "bubble tea",
  "topping",
  // menu / marketing news
  "flavor",
  "limited-time",
  "limited time",
  "lto",
];

// Match whole words (plus plural/possessive/-ed endings) so short keywords
// don't hit inside other words ("lto" in "Salton", "boba" in "Kaboba").
// Lookarounds instead of \b because \b doesn't treat "í" in "açaí" as a letter.
const RELEVANCE_RE = new RegExp(
  `(?<![\\p{L}\\d])(?:${RELEVANCE_KEYWORDS.map((kw) => kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?:s|es|ed|'s|’s)?(?![\\p{L}\\d])`,
  "iu"
);

function isRelevant(text) {
  return RELEVANCE_RE.test(text);
}

// Local dev convenience: load .env.local if present. In CI, real env vars
// are already injected by the workflow, so this is a no-op there.
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const i = line.indexOf("=");
    if (i === -1 || line.trim().startsWith("#")) continue;
    const key = line.slice(0, i).trim();
    const value = line.slice(i + 1).trim();
    if (key && !(key in process.env)) process.env[key] = value;
  }
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function hash(text) {
  return createHash("sha256").update(text).digest("hex");
}

async function collectHtml(source) {
  const res = await fetch(source.url, {
    headers: { "User-Agent": "FoodOpportunityRadarBot/0.1 (+personal research project)" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);
  $("script, style, noscript, svg").remove();
  const text = $("body").text().replace(/\s+/g, " ").trim().slice(0, 20000);
  const contentHash = hash(text);

  const { data: last } = await supabase
    .from("raw_contents")
    .select("content_hash")
    .eq("source_id", source.id)
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (last && last.content_hash === contentHash) {
    return { inserted: 0, reason: "unchanged" };
  }

  // Industry-wide sources (no single owning brand) cover far more than F&B —
  // only store a snapshot if our brands/category actually appear on it.
  if (!source.brand_id && !isRelevant(text)) {
    return { inserted: 0, reason: "changed but not relevant" };
  }

  const { error } = await supabase.from("raw_contents").insert({
    source_id: source.id,
    content_type: "html_snapshot",
    title: $("title").first().text().trim() || null,
    url: source.url,
    content_text: text,
    content_hash: contentHash,
  });
  if (error) throw new Error(error.message);
  return { inserted: 1, reason: "changed" };
}

async function collectYoutube(source) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error("YOUTUBE_API_KEY not set");

  const channelRes = await fetch(
    `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${source.identifier}&key=${key}`
  );
  const channelData = await channelRes.json();
  if (channelData.error) throw new Error(channelData.error.message);
  const uploadsPlaylist = channelData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsPlaylist) throw new Error("no uploads playlist found");

  const itemsRes = await fetch(
    `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${uploadsPlaylist}&maxResults=5&key=${key}`
  );
  const itemsData = await itemsRes.json();
  if (itemsData.error) throw new Error(itemsData.error.message);

  let inserted = 0;
  for (const item of itemsData.items ?? []) {
    const videoId = item.snippet.resourceId.videoId;
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const text = `${item.snippet.title}\n\n${item.snippet.description ?? ""}`.trim();

    const { error } = await supabase.from("raw_contents").insert({
      source_id: source.id,
      content_type: "youtube_video",
      title: item.snippet.title,
      url,
      content_text: text.slice(0, 20000),
      content_hash: hash(text),
      published_at: item.snippet.publishedAt,
    });
    // Unique index on url makes re-inserting an already-seen video a no-op.
    if (error && error.code !== "23505") throw new Error(error.message);
    if (!error) inserted++;
  }
  return { inserted, reason: inserted > 0 ? "new videos" : "no new videos" };
}

async function collectRss(source) {
  const feed = await rssParser.parseURL(source.url);
  const items = (feed.items ?? []).slice(0, 30);

  let inserted = 0;
  let skipped = 0;
  for (const item of items) {
    const title = item.title ?? "";
    const snippet = item.contentSnippet ?? item.content ?? "";
    if (!isRelevant(`${title} ${snippet}`)) {
      skipped++;
      continue;
    }

    const url = item.link;
    if (!url) continue;
    const text = `${title}\n\n${snippet}`.trim();

    const { error } = await supabase.from("raw_contents").insert({
      source_id: source.id,
      content_type: "rss_article",
      title,
      url,
      content_text: text.slice(0, 20000),
      content_hash: hash(text),
      published_at: item.isoDate ?? null,
    });
    // Unique index on url makes re-inserting an already-seen article a no-op.
    if (error && error.code !== "23505") throw new Error(error.message);
    if (!error) inserted++;
  }
  return { inserted, reason: `${inserted} relevant, ${skipped} filtered out` };
}

const instagramTotals = { accounts: 0, fetched: 0, inserted: 0, duplicates: 0, failedAccounts: [] };

async function collectInstagram(source) {
  // Throws a "config" error (counted as a failed source) if the Meta secrets aren't set.
  const config = readInstagramConfig();
  const username = source.identifier;

  const { data: known, error } = await supabase
    .from("raw_contents")
    .select("external_id")
    .eq("source_id", source.id)
    .eq("content_type", "instagram_post")
    .order("published_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(`failed to load known posts: ${error.message}`);

  const stats = await collectInstagramAccount({
    username,
    config,
    knownIds: new Set((known ?? []).map((r) => r.external_id)),
    insertPost: async (post) => {
      const { error } = await supabase.from("raw_contents").insert(toRawContentRow(source.id, post, hash));
      // Unique index on external_id: a post stored by an earlier run is a no-op.
      if (error?.code === "23505") return "duplicate";
      if (error) throw new Error(error.message);
      return "inserted";
    },
    log: (msg) => console.log(msg),
  });

  instagramTotals.fetched += stats.fetched;
  instagramTotals.inserted += stats.inserted;
  instagramTotals.duplicates += stats.duplicates;
  return {
    inserted: stats.inserted,
    reason: `@${username}: ${stats.fetched} fetched, ${stats.inserted} new, ${stats.duplicates} already stored; stopped at ${stats.stoppedAt}`,
  };
}

async function main() {
  // --only=instagram runs just the Instagram sources (manual runs / testing).
  const only = process.argv.find((a) => a.startsWith("--only="))?.slice("--only=".length);
  let query = supabase.from("sources").select("*").eq("is_active", true);
  if (only === "instagram") query = query.eq("collection_method", "instagram_graph");
  const { data: sources, error } = await query;
  if (error) throw new Error(`failed to load sources: ${error.message}`);

  console.log(`Collecting from ${sources.length} active sources...\n`);

  let totalInserted = 0;
  let failed = 0;
  const now = () => new Date().toISOString();

  for (const source of sources) {
    const isInstagram = source.collection_method === "instagram_graph";
    if (isInstagram) instagramTotals.accounts++;
    try {
      const result =
        source.collection_method === "youtube_api"
          ? await collectYoutube(source)
          : source.collection_method === "rss"
            ? await collectRss(source)
            : isInstagram
              ? await collectInstagram(source)
              : await collectHtml(source);
      totalInserted += result.inserted;
      console.log(`OK   ${source.url} — ${result.reason} (+${result.inserted})`);
      await supabase
        .from("sources")
        .update({ last_checked_at: now(), last_success_at: now(), last_error: null })
        .eq("id", source.id);
    } catch (err) {
      failed++;
      const kind = err.kind ? `[${err.kind}] ` : "";
      const message = kind + redact(err.message, process.env.META_ACCESS_TOKEN);
      if (isInstagram) instagramTotals.failedAccounts.push(`@${source.identifier} ${message}`);
      console.log(`FAIL ${source.url} — ${message}`);
      await supabase.from("sources").update({ last_checked_at: now(), last_error: message }).eq("id", source.id);
    }
  }

  if (instagramTotals.accounts > 0) {
    const t = instagramTotals;
    console.log(
      `\nInstagram: ${t.accounts} account(s), ${t.fetched} fetched, ${t.inserted} new, ${t.duplicates} already stored, ${t.failedAccounts.length} failed`
    );
    for (const f of t.failedAccounts) console.log(`  failed: ${f}`);
  }
  console.log(`\nDone. ${totalInserted} new content row(s), ${failed} source(s) failed.`);
}

main();
