-- Creates a profile automatically when a new auth user signs up.
-- Run this in Supabase SQL Editor if you already ran schema.sql before this file existed.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, pseudo, email, is_adult)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'pseudo', split_part(new.email, '@', 1)),
    new.email,
    true
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
    and tablename = 'profiles'
    and policyname = 'Users can create own profile'
  ) then
    create policy "Users can create own profile"
    on public.profiles for insert
    with check (auth.uid() = id);
  end if;
end;
$$;
