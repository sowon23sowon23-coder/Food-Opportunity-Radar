// Read-only collection health panel: per-source last success/error and how
// many collected items are still waiting for AI analysis. Server component.

export type SourceHealth = "error" | "stale" | "ok" | "unchecked" | "inactive";

export type SourceStatusItem = {
  id: string;
  name: string;
  typeLabel: string;
  url: string;
  health: SourceHealth;
  lastSuccessAt: string | null;
  lastError: string | null;
  pending: number;
};

const HEALTH_LABEL: Record<SourceHealth, string> = {
  error: "오류",
  stale: "지연",
  ok: "정상",
  unchecked: "미확인",
  inactive: "꺼짐",
};

const HEALTH_STYLE: Record<SourceHealth, string> = {
  error: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-400 dark:border-rose-900",
  stale: "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-900",
  ok: "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900",
  unchecked: "bg-zinc-100 text-zinc-600 border-zinc-300 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700",
  inactive: "bg-zinc-100 text-zinc-500 border-zinc-200 dark:bg-zinc-900 dark:text-zinc-500 dark:border-zinc-800",
};

const HEALTH_ORDER: SourceHealth[] = ["error", "stale", "unchecked", "ok", "inactive"];

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SourceStatus({
  items,
  lastRunAt,
  pendingTotal,
}: {
  items: SourceStatusItem[];
  lastRunAt: string | null;
  pendingTotal: number;
}) {
  const counts = Object.fromEntries(HEALTH_ORDER.map((h) => [h, items.filter((i) => i.health === h).length])) as Record<
    SourceHealth,
    number
  >;
  const sorted = [...items].sort(
    (a, b) => HEALTH_ORDER.indexOf(a.health) - HEALTH_ORDER.indexOf(b.health) || a.name.localeCompare(b.name)
  );
  const needsAttention = counts.error + counts.stale > 0;

  return (
    <details className="mt-10 group" open={needsAttention}>
      <summary className="cursor-pointer list-none text-lg font-semibold text-black marker:content-none dark:text-zinc-50">
        <span className="inline-flex items-center gap-1.5">
          수집 상태
          <span className="text-xs font-normal text-zinc-400 group-open:hidden">(펼치기)</span>
        </span>
      </summary>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
        <span>마지막 수집: {lastRunAt ? formatDateTime(lastRunAt) : "—"}</span>
        <span className="text-zinc-300 dark:text-zinc-700">·</span>
        {HEALTH_ORDER.filter((h) => counts[h] > 0).map((h) => (
          <span key={h} className={`rounded-full border px-2 py-0.5 text-xs font-medium ${HEALTH_STYLE[h]}`}>
            {HEALTH_LABEL[h]} {counts[h]}
          </span>
        ))}
        <span className="text-zinc-300 dark:text-zinc-700">·</span>
        <span>
          AI 분석 대기 <strong className="text-zinc-900 dark:text-zinc-100">{pendingTotal}</strong>건
        </span>
      </div>
      <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
        지연: 마지막 성공이 36시간 넘게 지남 · 분석 대기 건은 매일 실행 때 AI 하루 한도 안에서 이어서 처리돼요
      </p>

      <ul className="mt-3 divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-950">
        {sorted.map((s) => (
          <li key={s.id} className="px-4 py-2.5">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${HEALTH_STYLE[s.health]}`}>
                {HEALTH_LABEL[s.health]}
              </span>
              <a
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-black hover:underline dark:text-zinc-50"
              >
                {s.name}
              </a>
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                {s.typeLabel}
              </span>
              <span className="ml-auto text-xs text-zinc-500 dark:text-zinc-400">
                {s.pending > 0 && <span className="mr-2">분석 대기 {s.pending}</span>}
                마지막 성공 {s.lastSuccessAt ? formatDateTime(s.lastSuccessAt) : "—"}
              </span>
            </div>
            {s.lastError && s.health === "error" && (
              <p className="mt-1 line-clamp-2 text-xs text-rose-600 dark:text-rose-400">{s.lastError}</p>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}
