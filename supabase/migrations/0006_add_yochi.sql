-- Phase 1: add Yochi (Australia) as a tracked competitor brand

insert into brands (name, parent_company, notes) values
  ('Yochi', null, 'Australian frozen yogurt brand (yochi.com.au); no official YouTube channel found');

insert into sources (brand_id, source_type, url, collection_method, is_active, notes)
select id, 'website', 'https://yochi.com.au', 'html_poll', true, null
from brands where name = 'Yochi'
union all
select id, 'press_page', 'https://yochi.com.au/news/', 'html_poll', true, null
from brands where name = 'Yochi';
