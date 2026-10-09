-- Rows still waiting for AI analysis, computed in the database.
-- Run this in the Supabase SQL Editor after 0010_instagram_sources.sql.
--
-- PostgREST returns at most 1000 rows per request, so loading every
-- raw_contents / content_insights row and diffing them in JS (as extract.mjs and
-- the dashboard used to) silently breaks once either table passes 1000 rows.

-- Same rule as extract.mjs: rows with almost no text (e.g. caption-less
-- Instagram posts) are never analyzed, so they don't count as pending.
create view pending_raw_contents with (security_invoker = true) as
select r.id, r.source_id, r.title, r.url, r.content_text, r.content_type, r.published_at, r.fetched_at
from raw_contents r
where not exists (select 1 from content_insights c where c.raw_content_id = r.id)
  and length(btrim(coalesce(r.content_text, ''))) > 20;

create view source_pending_counts with (security_invoker = true) as
select source_id, count(*)::int as pending
from pending_raw_contents
group by source_id;

-- Server-side (service_role) access only, like the underlying tables.
-- security_invoker means RLS on raw_contents/content_insights still applies.
revoke all on pending_raw_contents, source_pending_counts from anon, authenticated;
