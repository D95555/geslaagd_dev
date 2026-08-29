-- Rename the niveau taxonomy from vwo/bachelor1 to havo_vwo_bovenbouw/universitair,
-- consistently across subject requests and student study preferences.
-- Also add emphasis and preferred_source_types so a student can steer the crawl.

alter table public.crawl_subjects
  drop constraint crawl_subjects_year_level_check;

update public.crawl_subjects
  set year_level = case year_level
    when 'vwo' then 'havo_vwo_bovenbouw'
    when 'bachelor1' then 'universitair'
    else year_level
  end;

alter table public.crawl_subjects
  add constraint crawl_subjects_year_level_check
  check (year_level = any (array['havo_vwo_bovenbouw'::text, 'universitair'::text]));

alter table public.study_preferences
  drop constraint study_preferences_education_level_check;

update public.study_preferences
  set education_level = case education_level
    when 'vwo6' then 'havo_vwo_bovenbouw'
    when 'bachelor1' then 'universitair'
    else education_level
  end;

alter table public.study_preferences
  add constraint study_preferences_education_level_check
  check (education_level = any (array['havo_vwo_bovenbouw'::text, 'universitair'::text]));

alter table public.crawl_subjects
  add column emphasis text,
  add column preferred_source_types text;
