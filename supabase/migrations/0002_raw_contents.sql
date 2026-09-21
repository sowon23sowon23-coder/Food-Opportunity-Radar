-- Phase 1: raw content storage + collection status tracking
-- Run this in the Supabase SQL Editor after 0001_brands_and_sources.sql

alter table sources add column last_error text;

create table raw_contents (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references sources(id) on delete cascade,
  content_type text not null check (content_type in ('html_snapshot', 'youtube_video')),
  title text,
  url text not null,
  content_text text,
  content_hash text not null,
  published_at timestamptz,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index raw_contents_source_id_idx on raw_contents(source_id);
create index raw_contents_fetched_at_idx on raw_contents(fetched_at desc);

-- Prevent re-inserting the same YouTube video across collection runs
create unique index raw_contents_youtube_url_idx on raw_contents(url)
  where content_type = 'youtube_video';

-- Row Level Security: no anon policies added on purpose.
-- All access goes through the server-side service_role client.
alter table raw_contents enable row level security;
