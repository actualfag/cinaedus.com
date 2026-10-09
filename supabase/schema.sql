-- Cinaedus page-view counting (Supabase project hgkqsjuqjvpkgvztbeop).
-- Run in Supabase: SQL Editor → New query → paste → Run. Safe to re-run.
--
-- Visitors can't read or change either table: row level security is on with
-- no policies. The site can only call the two functions below, which are
-- restricted to the two known sites.

-- 1. Running total per site (shown on the site as the Roman numeral).
create table if not exists public.page_views (
  site  text primary key,
  total bigint not null default 0
);
insert into public.page_views (site) values ('cinaedus.com'), ('cl.cinaedus.com')
  on conflict do nothing;
alter table public.page_views enable row level security;

-- 2. One row per page view, for your own statistics (see stats.sql).
--    visitor = random ID kept in the visitor's browser (anonymous; links
--    their repeat visits). referrer = the other website they came from, if any.
create table if not exists public.page_view_log (
  id        bigint generated always as identity primary key,
  viewed_at timestamptz not null default now(),
  site      text not null,
  path      text not null,
  visitor   uuid not null,
  referrer  text
);
create index if not exists page_view_log_site_time on public.page_view_log (site, viewed_at);
alter table public.page_view_log enable row level security;

-- Original counter-only function (kept as a fallback).
create or replace function public.count_page_view(p_site text)
returns bigint
language sql
security definer
set search_path = public
as $$
  update public.page_views set total = total + 1
  where site = p_site
  returning total;
$$;
revoke all on function public.count_page_view(text) from public;
grant execute on function public.count_page_view(text) to anon;

-- What the site calls on every page view: log the view and add one to the
-- total, returning the new total. Unknown sites are ignored (returns null).
create or replace function public.record_page_view(
  p_site text,
  p_path text,
  p_visitor uuid,
  p_referrer text default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  new_total bigint;
begin
  update public.page_views set total = total + 1
  where site = p_site
  returning total into new_total;
  if new_total is null then
    return null;
  end if;
  insert into public.page_view_log (site, path, visitor, referrer)
  values (p_site, left(coalesce(p_path, '/'), 200), p_visitor, left(p_referrer, 300));
  return new_total;
end;
$$;
revoke all on function public.record_page_view(text, text, uuid, text) from public;
grant execute on function public.record_page_view(text, text, uuid, text) to anon;
