-- Page-view statistics. Run any of these in Supabase: SQL Editor → New query.
-- (Only you can read the log, from the dashboard; visitors can't.)
-- Swap 'cinaedus.com' for 'cl.cinaedus.com' to see the other site.

-- Totals per site: page views and unique visitors, all time.
select site,
       count(*)                as page_views,
       count(distinct visitor) as unique_visitors
from public.page_view_log
group by site;

-- Per day: page views and unique visitors.
select date_trunc('day', viewed_at)::date as day,
       count(*)                           as page_views,
       count(distinct visitor)            as unique_visitors
from public.page_view_log
where site = 'cinaedus.com'
group by 1
order by 1 desc;

-- Per page: page views and unique visitors.
select path,
       count(*)                as page_views,
       count(distinct visitor) as unique_visitors
from public.page_view_log
where site = 'cinaedus.com'
group by path
order by page_views desc;

-- Where visitors came from (other websites only).
select referrer, count(distinct visitor) as visitors
from public.page_view_log
where site = 'cinaedus.com' and referrer is not null
group by referrer
order by visitors desc;

-- New vs returning visitors, by the day of their first visit.
select first_day, count(*) as new_visitors
from (
  select visitor, min(viewed_at)::date as first_day
  from public.page_view_log
  where site = 'cinaedus.com'
  group by visitor
) v
group by first_day
order by first_day desc;

-- The latest 50 page views.
select viewed_at, site, path, referrer
from public.page_view_log
order by viewed_at desc
limit 50;
