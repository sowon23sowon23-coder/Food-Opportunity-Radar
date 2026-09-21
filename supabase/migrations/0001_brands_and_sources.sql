-- Phase 1: Yogurtland competitor monitoring
-- Run this in the Supabase SQL Editor (Project > SQL Editor > New query)

create table brands (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category text not null default 'frozen_yogurt',
  parent_company text,
  is_competitor boolean not null default true,
  notes text,
  created_at timestamptz not null default now()
);

create table sources (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  source_type text not null check (source_type in ('website', 'press_page', 'youtube_channel')),
  url text not null,
  identifier text,
  collection_method text not null check (collection_method in ('html_poll', 'youtube_api')),
  is_active boolean not null default true,
  last_checked_at timestamptz,
  last_success_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);

create index sources_brand_id_idx on sources(brand_id);
create index sources_is_active_idx on sources(is_active);

-- Seed data from source research (2026-09-21)

insert into brands (name, parent_company, notes) values
  ('Menchie''s', null, 'Independent'),
  ('Pinkberry', 'MTY Food Group (via Kahala Brands)', 'Shares parent with sweetFrog'),
  ('sweetFrog', 'MTY Food Group (via Kahala Brands)', 'Shares parent with Pinkberry'),
  ('TCBY', 'Mrs. Fields / Famous Brands International', null),
  ('16 Handles', null, 'Independent; only brand with an actively maintained YouTube channel'),
  ('Red Mango', 'BRIX Holdings', 'Sibling brands under BRIX include Orange Leaf, Clean Juice');

insert into sources (brand_id, source_type, url, identifier, collection_method, is_active, notes)
select id, 'website', 'https://www.menchies.com', null, 'html_poll', true, null
from brands where name = 'Menchie''s'
union all
select id, 'youtube_channel', 'https://youtube.com/@menchiesfrozenyogurt', 'UCZi6A9lBNcZTlk-z9gi3Lqw', 'youtube_api', false, 'Dormant since 2016-10'
from brands where name = 'Menchie''s'
union all
select id, 'website', 'https://www.pinkberry.com', null, 'html_poll', true, null
from brands where name = 'Pinkberry'
union all
select id, 'press_page', 'https://www.pinkberry.com/pressroom/', null, 'html_poll', true, null
from brands where name = 'Pinkberry'
union all
select id, 'youtube_channel', 'https://youtube.com/@pinkberry', 'UCV7q0CZGSgrAZWgygkHcQKA', 'youtube_api', false, 'Dormant since 2015-01'
from brands where name = 'Pinkberry'
union all
select id, 'website', 'https://www.sweetfrog.com', null, 'html_poll', true, null
from brands where name = 'sweetFrog'
union all
select id, 'youtube_channel', 'https://youtube.com/@sweetfrogpremiumfrozenyogu6257', 'UCl0_XpsbQs_WMGf9lH3ksOA', 'youtube_api', false, 'Unverified as official; 22 subscribers, dormant since 2018-04'
from brands where name = 'sweetFrog'
union all
select id, 'website', 'https://www.tcby.com', null, 'html_poll', true, null
from brands where name = 'TCBY'
union all
select id, 'youtube_channel', 'https://youtube.com/@tcbyYogurt', 'UC1LXFWPCTptRbxYK1bQt6UQ', 'youtube_api', false, 'Dormant since 2017-07'
from brands where name = 'TCBY'
union all
select id, 'website', 'https://www.16handles.com', null, 'html_poll', true, null
from brands where name = '16 Handles'
union all
select id, 'press_page', 'https://www.16handles.com/press/', null, 'html_poll', true, null
from brands where name = '16 Handles'
union all
select id, 'youtube_channel', 'https://youtube.com/@16Handles', 'UCEpufuTrz8usCkwho-_DkVA', 'youtube_api', true, 'Only actively maintained channel among the 6; last upload 2024-11'
from brands where name = '16 Handles'
union all
select id, 'website', 'https://www.redmangousa.com', null, 'html_poll', true, null
from brands where name = 'Red Mango'
union all
select id, 'press_page', 'https://www.redmangousa.com/news/', null, 'html_poll', true, null
from brands where name = 'Red Mango'
union all
select id, 'youtube_channel', 'https://youtube.com/@RedMangoTV', 'UCKeBDBxOAdqLUeJTGvbqHAA', 'youtube_api', false, 'Dormant since 2017-02'
from brands where name = 'Red Mango';
