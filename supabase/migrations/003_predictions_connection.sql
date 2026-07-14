-- Allows the prototype to create today's demo matches and update a user's own prediction status.

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'matches'
      and policyname = 'Authenticated users can create demo matches'
  ) then
    create policy "Authenticated users can create demo matches"
    on public.matches for insert
    to authenticated
    with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'predictions'
      and policyname = 'Users can update own predictions'
  ) then
    create policy "Users can update own predictions"
    on public.predictions for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
  end if;
end $$;
