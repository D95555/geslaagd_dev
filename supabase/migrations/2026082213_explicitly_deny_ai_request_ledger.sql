create policy "Clients cannot access the AI request ledger"
  on public.study_ai_requests
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);