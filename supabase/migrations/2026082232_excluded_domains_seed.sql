-- Seed the crawl domain blocklist.
--
-- `excluded_domains` is read by getGlobalExcludedDomains() and passed to
-- Firecrawl as `excludeDomains`, so these are never fetched or scraped —
-- saving credits before any scoring happens. The list is deliberately
-- conservative: only domains that either never yield usable study material
-- (social feeds, flashcard/slide mills, vendor pages) or are pure programme /
-- admissions catalogs. Study-summary sites the platform still uses on a lower
-- score (studeersnel, studocu) are intentionally NOT blocked.

insert into public.excluded_domains (domain, reason) values
  ('facebook.com', 'social feed, no study content'),
  ('twitter.com', 'social feed, no study content'),
  ('x.com', 'social feed, no study content'),
  ('instagram.com', 'social feed, no study content'),
  ('tiktok.com', 'social feed, no study content'),
  ('linkedin.com', 'social feed, no study content'),
  ('pinterest.com', 'social feed, no study content'),
  ('reddit.com', 'forum threads, consistently declined'),
  ('quizlet.com', 'flashcard mill, no usable theory'),
  ('slideshare.net', 'slide dump, consistently declined'),
  ('coursehero.com', 'paywalled answer mill, no usable theory'),
  ('studysmart.ai', 'flashcard mill, consistently declined'),
  ('brainscape.com', 'flashcard mill, no usable theory'),
  ('cusabio.com', 'antibody vendor, commercial noise'),
  ('tvpo.nl', 'low-value content farm, consistently declined'),
  ('farmacopedia.nl', 'thin content, consistently declined'),
  ('onderwijsaanbod.kuleuven.be', 'programme catalog, not study content'),
  ('studiekiezer.ugent.be', 'programme catalog, not study content'),
  ('studiekeuze123.nl', 'programme catalog, not study content')
on conflict (domain) do nothing;
