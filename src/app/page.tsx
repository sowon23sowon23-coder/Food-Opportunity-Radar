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

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function Home() {
  const { data, error } = await supabaseAdmin
    .from("raw_contents")
    .select(
      `id, title, url, content_type, content_text, published_at, fetched_at,
       sources ( source_type, url, brands ( name ) )`
    )
    .order("fetched_at", { ascending: false })
    .returns<RawContentRow[]>();

  const rows = data ?? [];

  return (
    <div className="min-h-screen bg-zinc-50 px-6 py-10 font-sans dark:bg-black sm:px-12">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
          Food Opportunity Radar
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          수집된 원본 콘텐츠 {rows.length}건 (경쟁사 관찰 소스 기준, AI 분석 이전 단계)
        </p>

        {error && (
          <p className="mt-6 text-sm text-red-600 dark:text-red-400">
            데이터를 불러오지 못했습니다: {error.message}
          </p>
        )}

        <ul className="mt-8 flex flex-col gap-4">
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

        {rows.length === 0 && !error && (
          <p className="mt-8 text-sm text-zinc-500 dark:text-zinc-400">
            아직 수집된 데이터가 없습니다. <code>npm run collect</code>를 실행해보세요.
          </p>
        )}
      </div>
    </div>
  );
}
