import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";

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

function escapeHtml(s) {
  return (s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function renderHtml(rows) {
  const items = rows
    .map((r) => {
      const brand = r.raw_contents?.sources?.brands?.name ?? "Unknown brand";
      const url = r.raw_contents?.url ?? "#";
      const tags = [...(r.ingredients ?? []), ...(r.campaign_type ?? []), ...(r.promotion_type ?? [])];
      return `
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid #e5e5e5;">
            <div style="font-size:12px;color:#888;margin-bottom:4px;">
              <strong>${escapeHtml(brand)}</strong>
              ${r.confidence != null ? ` · 신뢰도 ${Math.round(r.confidence * 100)}%` : ""}
            </div>
            <div style="font-size:15px;color:#111;margin-bottom:4px;">${escapeHtml(r.trend_signal)}</div>
            ${r.evidence ? `<div style="font-size:13px;color:#555;font-style:italic;margin-bottom:4px;">“${escapeHtml(r.evidence)}”</div>` : ""}
            ${tags.length ? `<div style="font-size:12px;color:#b45309;">${tags.map(escapeHtml).join(" · ")}</div>` : ""}
            <a href="${url}" style="font-size:12px;color:#666;">원문 보기 →</a>
          </td>
        </tr>`;
    })
    .join("");

  return `<html><body style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
    <h2 style="color:#111;">Food Opportunity Radar — 오늘의 인사이트</h2>
    <p style="color:#888;font-size:13px;">새로 발견된 신호 ${rows.length}건</p>
    <table style="width:100%;border-collapse:collapse;">${items}</table>
    <p style="margin-top:20px;"><a href="https://food-opportunity-radar-3fzc.vercel.app" style="font-size:13px;color:#666;">전체 대시보드 보기 →</a></p>
  </body></html>`;
}

async function main() {
  const { data, error } = await supabase
    .from("content_insights")
    .select(
      `id, trend_signal, evidence, ingredients, campaign_type, promotion_type, confidence,
       raw_contents ( url, sources ( brands ( name ) ) )`
    )
    .eq("has_signal", true)
    .is("emailed_at", null)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`failed to load insights: ${error.message}`);

  if (!data || data.length === 0) {
    console.log("No new insights to email. Skipping send.");
    return;
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: process.env.EMAIL_FROM, pass: process.env.EMAIL_APP_PASSWORD },
  });

  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: process.env.EMAIL_TO,
    subject: `[Food Opportunity Radar] 새 인사이트 ${data.length}건 — ${new Date().toLocaleDateString("ko-KR")}`,
    html: renderHtml(data),
  });

  const { error: updateError } = await supabase
    .from("content_insights")
    .update({ emailed_at: new Date().toISOString() })
    .in(
      "id",
      data.map((r) => r.id)
    );
  if (updateError) throw new Error(`sent email but failed to mark as emailed: ${updateError.message}`);

  console.log(`Sent digest with ${data.length} insight(s) to ${process.env.EMAIL_TO}.`);
}

main();
