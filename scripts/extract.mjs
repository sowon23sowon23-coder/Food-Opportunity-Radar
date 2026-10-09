import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const i = line.indexOf("=");
    if (i === -1 || line.trim().startsWith("#")) continue;
    const key = line.slice(0, i).trim();
    const value = line.slice(i + 1).trim();
    if (key && !(key in process.env)) process.env[key] = value;
  }
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";
const GEMINI_KEY = process.env.GEMINI_API_KEY;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    has_signal: {
      type: "boolean",
      description: "true only if this content describes something concrete and new (a product, flavor, ingredient, campaign, promotion, partnership, or store opening). false for generic nav/boilerplate/homepage text or posts with nothing new.",
    },
    brands: { type: "array", items: { type: "string" } },
    ingredients: { type: "array", items: { type: "string" } },
    products: { type: "array", items: { type: "string" } },
    flavors: { type: "array", items: { type: "string" } },
    consumer_needs: { type: "array", items: { type: "string" } },
    campaign_type: { type: "array", items: { type: "string" } },
    promotion_type: { type: "array", items: { type: "string" } },
    trend_signal: { type: "string", description: "One sentence describing what changed or what's new. Empty string if has_signal is false." },
    evidence: { type: "string", description: "The exact sentence(s) from the source text that support trend_signal. Empty string if has_signal is false." },
    confidence: { type: "number", description: "0 to 1" },
    yogurtland_fit: {
      type: "string",
      enum: ["explore", "validate", "test", "hold", "reject", "n/a"],
      description: "Draft applicability of this signal to Yogurtland (a US self-serve frozen yogurt chain), for a human to review — not a final decision. explore: worth researching further. validate: worth checking customer/SNS reaction first. test: concrete enough to pilot in a few stores. hold: noted but not a priority now. reject: doesn't fit Yogurtland's brand/operations. Use 'n/a' when has_signal is false.",
    },
    yogurtland_idea: {
      type: "string",
      description: "One concrete, concise suggestion for how Yogurtland could act on this (a flavor/topping idea, content angle, or promotion format) — grounded only in what the signal actually describes. Empty string if has_signal is false.",
    },
    yogurtland_reasoning: {
      type: "string",
      description: "One or two sentences on why this fit level was chosen — brand/customer/operational fit. Never invent market size, sales, or probability-of-success numbers. Empty string if has_signal is false.",
    },
  },
  required: [
    "has_signal",
    "brands",
    "ingredients",
    "products",
    "flavors",
    "consumer_needs",
    "campaign_type",
    "promotion_type",
    "trend_signal",
    "evidence",
    "confidence",
    "yogurtland_fit",
    "yogurtland_idea",
    "yogurtland_reasoning",
  ],
};

const SYSTEM_PROMPT = `You extract structured F&B marketing trend signals from collected content (a brand website snapshot, press release, news article, YouTube video description, or Instagram post caption) for a frozen yogurt competitor-monitoring dashboard.

Only report a signal if the text describes something concrete and specific — a new flavor, ingredient, product, marketing campaign, promotion, brand partnership, or store opening. Generic navigation menus, boilerplate "welcome to our site" text, or unchanged evergreen copy should get has_signal: false and empty arrays/strings.

For an INSTAGRAM POST, only the caption text is available — you cannot see the image or video. Base everything strictly on the caption: do not guess what the image shows, and do not infer flavors, dates, locations, or prices the caption doesn't state. Hashtags and emoji alone (e.g. "#froyo 🍦") are not a signal. evidence must quote the caption.

You will sometimes receive a PREVIOUS VERSION and a CURRENT VERSION of the same page instead of a single piece of content. When both are given: only report what is new or changed in the CURRENT VERSION. Ignore anything (flavors, promotions, partnerships, etc.) that was already present in the PREVIOUS VERSION — it has already been reported. If nothing in the CURRENT VERSION is new compared to the PREVIOUS VERSION, set has_signal to false even if the page still describes real promotions.

Never invent information not present in the text. evidence must be a direct quote or close paraphrase of the CURRENT VERSION, not a guess.

When has_signal is true, also draft a Yogurtland applicability assessment (yogurtland_fit, yogurtland_idea, yogurtland_reasoning). Yogurtland is a US self-serve frozen yogurt chain (customize-your-own cup, pay by weight, wide topping bar) — judge fit against that specific format, not frozen desserts in general. This is a first-pass draft for a human marketer to review and override, not a final decision. Never invent market size, sales figures, or success probabilities — reasoning must stay qualitative.`;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function callGemini(text) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ parts: [{ text: text.slice(0, 11000) }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
        },
      }),
    }
  );

  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `HTTP ${res.status}`);

  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!raw) throw new Error("no content in Gemini response");
  return JSON.parse(raw);
}

async function extractOne(text, retries = 4) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await callGemini(text);
    } catch (err) {
      const retryable = /high demand|overloaded|503|429/i.test(err.message);
      if (!retryable || attempt === retries) throw err;
      const backoff = attempt * 15000;
      console.log(`  retry ${attempt}/${retries - 1} after ${backoff / 1000}s — ${err.message}`);
      await sleep(backoff);
    }
  }
}

async function main() {
  if (!GEMINI_KEY) throw new Error("GEMINI_API_KEY not set");

  const { data: processed, error: e1 } = await supabase.from("content_insights").select("raw_content_id");
  if (e1) throw new Error(`failed to load processed ids: ${e1.message}`);
  const processedIds = new Set((processed ?? []).map((r) => r.raw_content_id));

  const { data: contents, error: e2 } = await supabase
    .from("raw_contents")
    .select("id, title, url, content_text, content_type, source_id, published_at, fetched_at")
    .order("fetched_at", { ascending: false });
  if (e2) throw new Error(`failed to load raw_contents: ${e2.message}`);

  const pending = (contents ?? []).filter((c) => !processedIds.has(c.id) && (c.content_text ?? "").trim().length > 20);

  console.log(`Extracting insights from ${pending.length} new content row(s)...\n`);

  let signalCount = 0;
  let failed = 0;

  for (const row of pending) {
    try {
      let text = `${row.title ?? ""}\n\n${row.content_text ?? ""}`;

      // Label Instagram captions so the model treats them as caption-only
      // evidence; the permalink stays on raw_contents.url for the dashboard.
      if (row.content_type === "instagram_post") {
        text = `INSTAGRAM POST (${row.title ?? ""}, posted ${row.published_at ?? "unknown date"})\nPermalink: ${row.url}\n\nCAPTION:\n${row.content_text ?? ""}`;
      }

      // html_snapshot sources (homepages, press pages) re-describe everything
      // still on the page every time, not just what's new. Diff against the
      // previous snapshot of the same source so we only report real changes.
      if (row.content_type === "html_snapshot") {
        const { data: previous } = await supabase
          .from("raw_contents")
          .select("content_text")
          .eq("source_id", row.source_id)
          .eq("content_type", "html_snapshot")
          .lt("fetched_at", row.fetched_at)
          .order("fetched_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (previous?.content_text) {
          const prevSnippet = previous.content_text.slice(0, 4000);
          const currSnippet = (row.content_text ?? "").slice(0, 6000);
          text = `PREVIOUS VERSION:\n${prevSnippet}\n\nCURRENT VERSION:\n${row.title ?? ""}\n\n${currSnippet}`;
        }
      }

      const result = await extractOne(text);

      const { error } = await supabase.from("content_insights").insert({
        raw_content_id: row.id,
        has_signal: result.has_signal,
        brands: result.brands ?? [],
        ingredients: result.ingredients ?? [],
        products: result.products ?? [],
        flavors: result.flavors ?? [],
        consumer_needs: result.consumer_needs ?? [],
        campaign_type: result.campaign_type ?? [],
        promotion_type: result.promotion_type ?? [],
        trend_signal: result.trend_signal || null,
        evidence: result.evidence || null,
        confidence: result.confidence ?? null,
        yogurtland_fit: result.yogurtland_fit === "n/a" ? null : result.yogurtland_fit,
        yogurtland_idea: result.yogurtland_idea || null,
        yogurtland_reasoning: result.yogurtland_reasoning || null,
        model: GEMINI_MODEL,
      });
      if (error) throw new Error(error.message);

      if (result.has_signal) signalCount++;
      console.log(`OK   ${row.title?.slice(0, 60) ?? row.id} — signal: ${result.has_signal}`);
    } catch (err) {
      failed++;
      console.log(`FAIL ${row.title?.slice(0, 60) ?? row.id} — ${err.message}`);
    }
    // Free tier rate limit safety margin.
    await sleep(12000);
  }

  console.log(`\nDone. ${signalCount} signal(s) found, ${failed} failed, out of ${pending.length} processed.`);
}

main();
