import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import * as cheerio from "cheerio";
import { createClient } from "@supabase/supabase-js";

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

async function main() {
  const { data: sources, error } = await supabase.from("sources").select("*").eq("is_active", true);
  if (error) throw new Error(`failed to load sources: ${error.message}`);

  console.log(`Collecting from ${sources.length} active sources...\n`);

  let totalInserted = 0;
  let failed = 0;
  const now = () => new Date().toISOString();

  for (const source of sources) {
    try {
      const result =
        source.collection_method === "youtube_api" ? await collectYoutube(source) : await collectHtml(source);
      totalInserted += result.inserted;
      console.log(`OK   ${source.url} — ${result.reason} (+${result.inserted})`);
      await supabase
        .from("sources")
        .update({ last_checked_at: now(), last_success_at: now(), last_error: null })
        .eq("id", source.id);
    } catch (err) {
      failed++;
      console.log(`FAIL ${source.url} — ${err.message}`);
      await supabase.from("sources").update({ last_checked_at: now(), last_error: err.message }).eq("id", source.id);
    }
  }

  console.log(`\nDone. ${totalInserted} new content row(s), ${failed} source(s) failed.`);
}

main();
