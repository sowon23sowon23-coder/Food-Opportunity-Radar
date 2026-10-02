import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { google } from "googleapis";

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
const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const KEY_PATH = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE || "google-service-account.json";

const HEADER = [
  "수집일",
  "브랜드",
  "인사이트",
  "근거",
  "재료",
  "캠페인 유형",
  "프로모션 유형",
  "신뢰도",
  "원문 링크",
];

async function main() {
  if (!SHEET_ID) throw new Error("GOOGLE_SHEET_ID not set");
  const credentials = JSON.parse(readFileSync(KEY_PATH, "utf8"));

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const sheets = google.sheets({ version: "v4", auth });

  const { data, error } = await supabase
    .from("content_insights")
    .select(
      `created_at, trend_signal, evidence, ingredients, campaign_type, promotion_type, confidence,
       raw_contents ( url, sources ( brands ( name ) ) )`
    )
    .eq("has_signal", true)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`failed to load insights: ${error.message}`);

  const rows = (data ?? []).map((r) => [
    new Date(r.created_at).toLocaleDateString("ko-KR"),
    r.raw_contents?.sources?.brands?.name ?? "",
    r.trend_signal ?? "",
    r.evidence ?? "",
    (r.ingredients ?? []).join(", "),
    (r.campaign_type ?? []).join(", "),
    (r.promotion_type ?? []).join(", "),
    r.confidence ?? "",
    r.raw_contents?.url ?? "",
  ]);

  await sheets.spreadsheets.values.clear({ spreadsheetId: SHEET_ID, range: "A:Z" });
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: "A1",
    valueInputOption: "RAW",
    requestBody: { values: [HEADER, ...rows] },
  });

  console.log(`Synced ${rows.length} insight row(s) to the sheet.`);
}

main();
