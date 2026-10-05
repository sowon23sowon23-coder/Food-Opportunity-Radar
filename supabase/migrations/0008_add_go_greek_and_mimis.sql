-- Phase 1: add Go Greek Yogurt and Mimi's (NYC) as tracked competitor brands

insert into brands (name, parent_company, notes) values
  ('Go Greek Yogurt', null, 'US Greek frozen yogurt chain (gogreekyogurt.com)'),
  ('Mimi''s', null, 'NYC premium frozen yogurt boutique (mimis.nyc); site is JS-rendered, our static-HTML collector extracts little real content — expect sparse signal from this source');

insert into sources (brand_id, source_type, url, collection_method, is_active, notes)
select id, 'website', 'https://gogreekyogurt.com', 'html_poll', true, null
from brands where name = 'Go Greek Yogurt'
union all
select id, 'press_page', 'https://gogreekyogurt.com/blogs/press', 'html_poll', true, null
from brands where name = 'Go Greek Yogurt'
union all
select id, 'website', 'https://mimis.nyc', 'html_poll', true, 'JS-rendered site; collector mostly sees nav/footer text'
from brands where name = 'Mimi''s';
