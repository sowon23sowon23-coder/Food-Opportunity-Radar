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

const SCHEMA = {
  type: "object",
  properties: {
    yogurtland_fit: { type: "string", enum: ["explore", "validate", "test", "hold", "reject"] },
    yogurtland_idea: { type: "string" },
    yogurtland_reasoning: { type: "string" },
  },
  required: ["yogurtland_fit", "yogurtland_idea", "yogurtland_reasoning"],
};

const PROMPT = `Yogurtland is a US self-serve frozen yogurt chain (customize-your-own cup, pay by weight, wide topping bar). Given a competitor trend signal below, draft a first-pass Yogurtland applicability assessment for a human marketer to review and override — not a final decision.

yogurtland_fit: explore (worth researching further) | validate (check customer/SNS reaction first) | test (concrete enough to pilot in a few stores) | hold (noted, not a priority now) | reject (doesn't fit Yogurtland's brand/operations).
yogurtland_idea: one concrete, concise suggestion for how Yogurtland could act on this.
yogurtland_reasoning: one or two sentences, qualitative only — never invent market size, sales figures, or success probabilities.`;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function assess(signal, evidence) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: PROMPT }] },
        contents: [{ parts: [{ text: `Signal: ${signal}\nEvidence: ${evidence ?? ""}` }] }],
        generationConfig: { responseMimeType: "application/json", responseSchema: SCHEMA },
      }),
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `HTTP ${res.status}`);
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!raw) throw new Error("no content in Gemini response");
  return JSON.parse(raw);
}

async function main() {
  const { data: rows, error } = await supabase
    .from("content_insights")
    .select("id, trend_signal, evidence")
    .eq("has_signal", true)
    .is("yogurtland_fit", null);
  if (error) throw new Error(error.message);

  console.log(`Backfilling ${rows.length} row(s)...\n`);
  for (const row of rows) {
    try {
      const result = await assess(row.trend_signal, row.evidence);
      const { error: updateError } = await supabase
        .from("content_insights")
        .update({
          yogurtland_fit: result.yogurtland_fit,
          yogurtland_idea: result.yogurtland_idea,
          yogurtland_reasoning: result.yogurtland_reasoning,
        })
        .eq("id", row.id);
      if (updateError) throw new Error(updateError.message);
      console.log(`OK   ${row.trend_signal?.slice(0, 60)} -> ${result.yogurtland_fit}`);
    } catch (err) {
      console.log(`FAIL ${row.trend_signal?.slice(0, 60)} — ${err.message}`);
    }
    await sleep(12000);
  }
  console.log("\nDone.");
}

main();
