"use client";

import { useMemo, useState } from "react";

export type InsightItem = {
  id: string;
  trend_signal: string | null;
  evidence: string | null;
  brands: string[];
  ingredients: string[];
  campaign_type: string[];
  promotion_type: string[];
  confidence: number | null;
  created_at: string;
  yogurtland_fit: "explore" | "validate" | "test" | "hold" | "reject" | null;
  yogurtland_idea: string | null;
  yogurtland_reasoning: string | null;
  brandName: string;
  sourceUrl: string | null;
};

const STAGES = [
  { key: "test", label: "Test", desc: "소규모 테스트 후보" },
  { key: "validate", label: "Validate", desc: "반응 검증 필요" },
  { key: "explore", label: "Explore", desc: "추가 조사 필요" },
  { key: "hold", label: "Hold", desc: "현재는 보류" },
  { key: "reject", label: "Reject", desc: "브랜드/운영과 부적합" },
] as const;

const STAGE_STYLE: Record<string, string> = {
  test: "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800",
  validate: "bg-violet-100 text-violet-800 border-violet-300 dark:bg-violet-950 dark:text-violet-300 dark:border-violet-800",
  explore: "bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800",
  hold: "bg-zinc-100 text-zinc-600 border-zinc-300 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700",
  reject: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-400 dark:border-rose-900",
};

function StageBadge({ stage }: { stage: string | null }) {
  if (!stage) return null;
  const label = STAGES.find((s) => s.key === stage)?.label ?? stage;
  return (
    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STAGE_STYLE[stage] ?? ""}`}>
      {label}
    </span>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" });
}

export default function InsightsBoard({ insights }: { insights: InsightItem[] }) {
  const [activeStage, setActiveStage] = useState<string | "all">("all");

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: insights.length };
    for (const stage of STAGES) c[stage.key] = 0;
    for (const item of insights) {
      if (item.yogurtland_fit) c[item.yogurtland_fit] = (c[item.yogurtland_fit] ?? 0) + 1;
    }
    return c;
  }, [insights]);

  const filtered = activeStage === "all" ? insights : insights.filter((i) => i.yogurtland_fit === activeStage);

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setActiveStage("all")}
          className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
            activeStage === "all"
              ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
              : "border-zinc-300 text-zinc-600 hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-400"
          }`}
        >
          전체 {counts.all}
        </button>
        {STAGES.map((stage) => (
          <button
            key={stage.key}
            onClick={() => setActiveStage(stage.key)}
            title={stage.desc}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              activeStage === stage.key
                ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                : "border-zinc-300 text-zinc-600 hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-400"
            }`}
          >
            {stage.label} {counts[stage.key] ?? 0}
          </button>
        ))}
      </div>

      <ul className="mt-5 flex flex-col gap-4">
        {filtered.map((item) => (
          <li
            key={item.id}
            className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
          >
            <div className="flex flex-wrap items-center gap-2">
              <StageBadge stage={item.yogurtland_fit} />
              <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                {item.brandName}
              </span>
              <span className="text-xs text-zinc-400 dark:text-zinc-500">{formatDate(item.created_at)}</span>
              {item.confidence !== null && (
                <span className="text-xs text-zinc-400 dark:text-zinc-500">신뢰도 {Math.round(item.confidence * 100)}%</span>
              )}
            </div>

            {item.yogurtland_idea && (
              <div className="mt-3 rounded-lg bg-amber-50 p-3 dark:bg-amber-950/30">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                  요거트랜드 적용 아이디어
                </p>
                <p className="mt-1 font-medium text-zinc-900 dark:text-zinc-50">{item.yogurtland_idea}</p>
                {item.yogurtland_reasoning && (
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{item.yogurtland_reasoning}</p>
                )}
              </div>
            )}

            <div className="mt-3 border-t border-dashed border-zinc-200 pt-3 dark:border-zinc-800">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                경쟁사 동향
              </p>
              <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">{item.trend_signal}</p>
              {item.evidence && (
                <p className="mt-1 text-xs italic text-zinc-500 dark:text-zinc-500">&ldquo;{item.evidence}&rdquo;</p>
              )}
            </div>

            {(item.ingredients.length > 0 || item.campaign_type.length > 0 || item.promotion_type.length > 0) && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {[...item.ingredients, ...item.campaign_type, ...item.promotion_type].map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {item.sourceUrl && (
              <a
                href={item.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-block text-xs font-medium text-zinc-500 hover:text-zinc-900 hover:underline dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                원문 보기 →
              </a>
            )}
          </li>
        ))}

        {filtered.length === 0 && (
          <li className="rounded-xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
            이 단계에 해당하는 인사이트가 없습니다.
          </li>
        )}
      </ul>
    </div>
  );
}
