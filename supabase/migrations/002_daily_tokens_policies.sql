-- Allows connected users to create and update their own daily token counter.

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'daily_tokens'
      and policyname = 'Users can create own tokens'
  ) then
    create policy "Users can create own tokens"
    on public.daily_tokens for insert
    with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'daily_tokens'
      and policyname = 'Users can update own tokens'
  ) then
    create policy "Users can update own tokens"
    on public.daily_tokens for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
  end if;
end $$;
