-- ─── Contradiction detection ────────────────────────────────────────────────
-- After a chapter's sources are reviewed, a separate, non-blocking check looks
-- for genuine factual disagreements between the accepted sources and records
-- them here. Purely additive: it never affects which sources are kept or
-- whether content is generated — it only annotates the chapter so students and
-- admins can see where sources conflict.
--
-- Shape: array of { topic, description, sources: [url, ...] }. NULL means the
-- check has not run yet; an empty array means it ran and found nothing.

alter table public.chapters
  add column if not exists contradictions jsonb;

-- The pipeline gains one leaf task type for this check.
alter table public.pipeline_tasks
  drop constraint if exists pipeline_tasks_task_type_check;

alter table public.pipeline_tasks
  add constraint pipeline_tasks_task_type_check check (task_type in (
    'triage', 'curriculum_design', 'source_gathering', 'source_review',
    'summary_generation', 'key_notes_generation', 'exercise_generation',
    'exam_generation', 'questionnaire_generation', 'readiness_check',
    'contradiction_check'
  ));
