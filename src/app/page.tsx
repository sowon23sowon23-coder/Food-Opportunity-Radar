import { supabaseAdmin } from "@/lib/supabase-admin";

// Always fetch fresh data from Supabase; don't bake a build-time snapshot.
export const dynamic = "force-dynamic";

type RawContentRow = {
  id: string;
  title: string | null;
  url: string;
  content_type: "html_snapshot" | "youtube_video";
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
  ingredients: string[];
  products: string[];
  flavors: string[];
  campaign_type: string[];
  promotion_type: string[];
  confidence: number | null;
  created_at: string;
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

function Tags({ label, items }: { label: string; items: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
      <span className="text-zinc-400 dark:text-zinc-500">{label}</span>
      {items.map((item) => (
        <span
          key={item}
          className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
        >
          {item}
        </span>
      ))}
    </div>
  );
}

export default async function Home() {
  const [{ data: rawData, error: rawError }, { data: insightData, error: insightError }] = await Promise.all([
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
        `id, trend_signal, evidence, ingredients, products, flavors, campaign_type, promotion_type, confidence, created_at,
         raw_contents ( title, url, sources ( brands ( name ) ) )`
      )
      .eq("has_signal", true)
      .order("created_at", { ascending: false })
      .returns<InsightRow[]>(),
  ]);

  const rows = rawData ?? [];
  const insights = insightData ?? [];

  return (
    <div className="min-h-screen bg-zinc-50 px-6 py-10 font-sans dark:bg-black sm:px-12">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
          Food Opportunity Radar
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          경쟁사 관찰 소스 기준 · 원본 {rows.length}건 · AI 인사이트 {insights.length}건
        </p>

        {/* AI Insights */}
        <section className="mt-8">
          <h2 className="text-lg font-semibold text-black dark:text-zinc-50">AI 인사이트</h2>
          {insightError && (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">
              인사이트를 불러오지 못했습니다: {insightError.message}
            </p>
          )}
          <ul className="mt-3 flex flex-col gap-3">
            {insights.map((insight) => (
              <li
                key={insight.id}
                className="rounded-lg border border-amber-200 bg-amber-50/40 p-4 dark:border-amber-900 dark:bg-amber-950/20"
              >
                <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                    {insight.raw_contents?.sources?.brands?.name ?? "Unknown brand"}
                  </span>
                  {insight.confidence !== null && <span>신뢰도 {Math.round(insight.confidence * 100)}%</span>}
                  <span>{formatDate(insight.created_at)}</span>
                </div>

                <p className="mt-2 font-medium text-black dark:text-zinc-50">{insight.trend_signal}</p>

                {insight.evidence && (
                  <p className="mt-1 text-sm italic text-zinc-600 dark:text-zinc-400">&ldquo;{insight.evidence}&rdquo;</p>
                )}

                <Tags label="재료" items={insight.ingredients} />
                <Tags label="제품" items={insight.products} />
                <Tags label="맛" items={insight.flavors} />
                <Tags label="캠페인" items={insight.campaign_type} />
                <Tags label="프로모션" items={insight.promotion_type} />

                {insight.raw_contents?.url && (
                  <a
                    href={insight.raw_contents.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-block text-xs text-zinc-500 hover:underline dark:text-zinc-400"
                  >
                    원문 보기 →
                  </a>
                )}
              </li>
            ))}
          </ul>

          {insights.length === 0 && !insightError && (
            <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
              아직 발견된 인사이트가 없습니다. <code>npm run extract</code>를 실행해보세요.
            </p>
          )}
        </section>

        {/* Raw collected content */}
        <section className="mt-10">
          <h2 className="text-lg font-semibold text-black dark:text-zinc-50">수집된 원본 콘텐츠</h2>

          {rawError && (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">
              데이터를 불러오지 못했습니다: {rawError.message}
            </p>
          )}

          <ul className="mt-3 flex flex-col gap-4">
            {rows.map((row) => (
              <li
                key={row.id}
                className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
              >
                <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                    {row.sources?.brands?.name ?? "Unknown brand"}
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
                  <p className="mt-2 line-clamp-3 text-sm text-zinc-600 dark:text-zinc-400">
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
        </section>
      </div>
    </div>
  );
}
