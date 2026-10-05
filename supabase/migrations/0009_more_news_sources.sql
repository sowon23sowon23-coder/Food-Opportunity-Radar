-- Phase 1: additional industry-wide news sources
-- Restaurant Dive and NOSH have real RSS feeds. FoodNavigator, the National
-- Restaurant Association, and Placer.ai's blog don't expose RSS, so they're
-- polled as html_poll instead (whole-page snapshot diff, same as press
-- pages) with the same relevance-keyword filter applied in scripts/collect.mjs
-- for any null-brand_id source. Reuters was evaluated and excluded: no public
-- RSS and no food-specific section to scope a poll to.

insert into sources (brand_id, source_type, url, collection_method, is_active, notes) values
  (null, 'news_rss', 'https://www.restaurantdive.com/feeds/news/', 'rss', true, 'General restaurant industry news, filtered by keyword'),
  (null, 'news_rss', 'https://www.nosh.com/feed/', 'rss', true, 'CPG/food-beverage industry news, filtered by keyword'),
  (null, 'news_rss', 'https://www.foodnavigator.com/News/', 'html_poll', true, 'No RSS available; polling the news listing page instead, filtered by keyword'),
  (null, 'news_rss', 'https://restaurant.org/research-and-media/media/press-releases/', 'html_poll', true, 'National Restaurant Association; no RSS, press-release listing page, filtered by keyword'),
  (null, 'news_rss', 'https://www.placer.ai/anchor', 'html_poll', true, 'Placer.ai foot-traffic/retail insights blog; no RSS, filtered by keyword');
