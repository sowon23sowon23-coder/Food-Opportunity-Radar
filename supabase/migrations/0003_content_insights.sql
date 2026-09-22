-- Phase 1: AI-extracted structured insights (free, via Gemini API)
-- Run this in the Supabase SQL Editor after 0002_raw_contents.sql

create table content_insights (
  id uuid primary key default gen_random_uuid(),
  raw_content_id uuid not null unique references raw_contents(id) on delete cascade,
  has_signal boolean not null default false,
  brands text[] default '{}',
  ingredients text[] default '{}',
  products text[] default '{}',
  flavors text[] default '{}',
  consumer_needs text[] default '{}',
  campaign_type text[] default '{}',
  promotion_type text[] default '{}',
  trend_signal text,
  evidence text,
  confidence numeric,
  model text not null,
  created_at timestamptz not null default now()
);

create index content_insights_has_signal_idx on content_insights(has_signal);

alter table content_insights enable row level security;
