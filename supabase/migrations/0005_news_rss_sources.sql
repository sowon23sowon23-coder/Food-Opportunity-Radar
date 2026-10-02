-- Phase 1: industry-wide F&B news RSS sources (not tied to a single brand)

-- A news source isn't "owned" by one brand; individual articles may mention
-- one or more tracked brands (captured in content_insights.brands instead).
alter table sources alter column brand_id drop not null;

alter table sources drop constraint sources_source_type_check;
alter table sources add constraint sources_source_type_check
  check (source_type in ('website', 'press_page', 'youtube_channel', 'news_rss'));

alter table sources drop constraint sources_collection_method_check;
alter table sources add constraint sources_collection_method_check
  check (collection_method in ('html_poll', 'youtube_api', 'rss'));

-- RSS articles and YouTube videos are discrete items: dedupe by url permanently.
-- (html_snapshot intentionally allows multiple rows per url over time.)
drop index raw_contents_youtube_url_idx;
create unique index raw_contents_item_url_idx on raw_contents(url)
  where content_type in ('youtube_video', 'rss_article');

alter table raw_contents drop constraint raw_contents_content_type_check;
alter table raw_contents add constraint raw_contents_content_type_check
  check (content_type in ('html_snapshot', 'youtube_video', 'rss_article'));

insert into sources (brand_id, source_type, url, collection_method, is_active, notes) values
  (null, 'news_rss', 'https://www.fooddive.com/feeds/news/', 'rss', true, 'General F&B industry news, filtered by keyword'),
  (null, 'news_rss', 'https://www.nrn.com/rss.xml', 'rss', true, 'Nation''s Restaurant News, filtered by keyword'),
  (null, 'news_rss', 'https://thespoon.tech/feed/', 'rss', true, 'Food tech news, filtered by keyword'),
  (null, 'news_rss', 'https://modernrestaurantmanagement.com/feed/', 'rss', true, 'Restaurant management news, filtered by keyword');
