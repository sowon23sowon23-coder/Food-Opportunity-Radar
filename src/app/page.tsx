import { supabaseAdmin } from "@/lib/supabase-admin";
import InsightsBoard, { type InsightItem } from "@/components/InsightsBoard";

// Always fetch fresh data from Supabase; don't bake a build-time snapshot.
export const dynamic = "force-dynamic";

type RawContentRow = {
  id: string;
  title: string | null;
  url: string;
  content_type: "html_snapshot" | "youtube_video" | "rss_article" | "instagram_post";
  content_text: string | null;
  published_at: string | null;
  fetched_at: string;
  sources: {
    source_type: string;
    url: string;
    brands: { name: string } | null;
  } | null;
};

type InsightRow = {
  id: string;
  trend_signal: string | null;
  evidence: string | null;
  brands: string[];
  ingredients: string[];
  products: string[];
  flavors: string[];
  campaign_type: string[];
  promotion_type: string[];
  confidence: number | null;
  created_at: string;
  yogurtland_fit: InsightItem["yogurtland_fit"];
  yogurtland_idea: string | null;
  yogurtland_reasoning: string | null;
  raw_contents: {
    title: string | null;
    url: string;
    sources: { brands: { name: string } | null } | null;
  } | null;
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{value}</p>
    </div>
  );
}

export default async function Home() {
  const [{ data: rawData, error: rawError }, { data: insightData, error: insightError }, { count: brandCount }] =
    await Promise.all([
      supabaseAdmin
        .from("raw_contents")
        .select(
          `id, title, url, content_type, content_text, published_at, fetched_at,
           sources ( source_type, url, brands ( name ) )`
        )
        .order("fetched_at", { ascending: false })
        .returns<RawContentRow[]>(),
      supabaseAdmin
        .from("content_insights")
        .select(
          `id, trend_signal, evidence, brands, ingredients, products, flavors, campaign_type, promotion_type,
           confidence, created_at, yogurtland_fit, yogurtland_idea, yogurtland_reasoning,
           raw_contents ( title, url, sources ( brands ( name ) ) )`
        )
        .eq("has_signal", true)
        .order("created_at", { ascending: false })
        .returns<InsightRow[]>(),
      supabaseAdmin.from("brands").select("id", { count: "exact", head: true }),
    ]);

  const rows = rawData ?? [];
  const insights: InsightItem[] = (insightData ?? []).map((r) => ({
    id: r.id,
    trend_signal: r.trend_signal,
    evidence: r.evidence,
    brands: r.brands,
    ingredients: r.ingredients,
    campaign_type: r.campaign_type,
    promotion_type: r.promotion_type,
    confidence: r.confidence,
    created_at: r.created_at,
    yogurtland_fit: r.yogurtland_fit,
    yogurtland_idea: r.yogurtland_idea,
    yogurtland_reasoning: r.yogurtland_reasoning,
    brandName: r.raw_contents?.sources?.brands?.name ?? r.brands?.[0] ?? "F&B 뉴스",
    sourceUrl: r.raw_contents?.url ?? null,
  }));

  const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const newThisWeek = insights.filter((i) => new Date(i.created_at).getTime() >= oneWeekAgo).length;
  const testCandidates = insights.filter((i) => i.yogurtland_fit === "test").length;

  return (
    <div className="min-h-screen bg-zinc-50 px-6 py-10 font-sans dark:bg-black sm:px-12">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">Food Opportunity Radar</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          경쟁사 공개 채널을 매일 관찰해 요거트랜드 적용 아이디어로 정리합니다
        </p>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="추적 브랜드" value={brandCount ?? "—"} />
          <StatCard label="전체 인사이트" value={insights.length} />
          <StatCard label="이번 주 신규" value={newThisWeek} />
          <StatCard label="Test 후보" value={testCandidates} />
        </div>

        <section className="mt-10">
          <h2 className="text-lg font-semibold text-black dark:text-zinc-50">요거트랜드 적용 포인트</h2>
          {insightError && (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">
              인사이트를 불러오지 못했습니다: {insightError.message}
            </p>
          )}
          <InsightsBoard insights={insights} />
          {insights.length === 0 && !insightError && (
            <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
              아직 발견된 인사이트가 없습니다. <code>npm run extract</code>를 실행해보세요.
            </p>
          )}
        </section>

        <details className="mt-10 group">
          <summary className="cursor-pointer list-none text-lg font-semibold text-black marker:content-none dark:text-zinc-50">
            <span className="inline-flex items-center gap-1.5">
              수집된 원본 콘텐츠
              <span className="text-xs font-normal text-zinc-400 group-open:hidden">(펼치기)</span>
            </span>
          </summary>

          {rawError && (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">
              데이터를 불러오지 못했습니다: {rawError.message}
            </p>
          )}

          <ul className="mt-3 flex flex-col gap-3">
            {rows.map((row) => (
              <li
                key={row.id}
                className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
              >
                <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                    {row.sources?.brands?.name ?? "F&B 뉴스"}
                  </span>
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 dark:bg-zinc-800">
                    {row.sources?.source_type ?? row.content_type}
                  </span>
                  <span>수집: {formatDate(row.fetched_at)}</span>
                  {row.published_at && <span>게시: {formatDate(row.published_at)}</span>}
                </div>

                <a
                  href={row.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 block font-medium text-black hover:underline dark:text-zinc-50"
                >
                  {row.title || row.url}
                </a>

                {row.content_text && (
                  <p className="mt-2 line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">
                    {row.content_text.slice(0, 300)}
                  </p>
                )}
              </li>
            ))}
          </ul>

          {rows.length === 0 && !rawError && (
            <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
              아직 수집된 데이터가 없습니다. <code>npm run collect</code>를 실행해보세요.
            </p>
          )}
        </details>
      </div>
    </div>
  );
}
