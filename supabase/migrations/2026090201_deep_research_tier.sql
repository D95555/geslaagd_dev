-- ─── Deep-research (niche) tier ─────────────────────────────────────────────
-- A subject flagged as niche crawls much more thoroughly: more candidates per
-- search and more gap-fill rounds, so it builds the fullest possible knowledge
-- base and uses most of its larger (800) credit budget. The flag is explicit
-- rather than inferred from the budget number, so an admin can raise a budget
-- without silently changing crawl depth.

alter table public.crawl_subjects
  add column if not exists deep_research boolean not null default false;
