alter table public.firecrawl_usage
  add column provider text not null default 'firecrawl';
