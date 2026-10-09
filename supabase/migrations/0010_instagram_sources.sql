-- Instagram competitor posts via the Meta Graph API (Business Discovery).
-- Run this in the Supabase SQL Editor after 0009_more_news_sources.sql.
--
-- One sources row per competitor Instagram account:
--   source_type = 'instagram_account', collection_method = 'instagram_graph',
--   identifier  = Instagram username (without @). Add more accounts by inserting
--   more rows like the one at the bottom of this file.

alter table sources drop constraint sources_source_type_check;
alter table sources add constraint sources_source_type_check
  check (source_type in ('website', 'press_page', 'youtube_channel', 'news_rss', 'instagram_account'));

alter table sources drop constraint sources_collection_method_check;
alter table sources add constraint sources_collection_method_check
  check (collection_method in ('html_poll', 'youtube_api', 'rss', 'instagram_graph'));

alter table raw_contents drop constraint raw_contents_content_type_check;
alter table raw_contents add constraint raw_contents_content_type_check
  check (content_type in ('html_snapshot', 'youtube_video', 'rss_article', 'instagram_post'));

-- Platform-native item ID (Instagram media ID). Instagram posts are deduped by
-- this ID rather than by url, so re-running collection never stores a post twice.
alter table raw_contents add column external_id text;
create unique index raw_contents_instagram_external_id_idx on raw_contents(external_id)
  where content_type = 'instagram_post';

-- First tracked account. Linked to the existing Yochi brand — change brand_id
-- if this account turns out to belong to a different brand.
insert into sources (brand_id, source_type, url, identifier, collection_method, is_active, notes)
select id, 'instagram_account', 'https://www.instagram.com/iloveyochi.us/', 'iloveyochi.us', 'instagram_graph', true,
       'Instagram Business Discovery; identifier = username'
from brands where name = 'Yochi';
