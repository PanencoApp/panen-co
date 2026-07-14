-- Stores the public pseudo directly on weekly scores so the leaderboard can be read safely.

alter table public.weekly_scores
add column if not exists pseudo text;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'weekly_scores'
      and policyname = 'Users can create own weekly score'
  ) then
    create policy "Users can create own weekly score"
    on public.weekly_scores for insert
    with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'weekly_scores'
      and policyname = 'Users can update own weekly score'
  ) then
    create policy "Users can update own weekly score"
    on public.weekly_scores for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
  end if;
end $$;
