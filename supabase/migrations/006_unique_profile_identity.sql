-- Prevents duplicate public identities and lets the app check availability
-- before trying to create a new account.

create unique index if not exists profiles_pseudo_unique_lower_idx
on public.profiles (lower(pseudo));

create unique index if not exists profiles_email_unique_lower_idx
on public.profiles (lower(email));

create or replace function public.check_profile_availability(
  requested_pseudo text,
  requested_email text
)
returns table (
  pseudo_available boolean,
  email_available boolean
)
language sql
security definer
set search_path = public
as $$
  select
    not exists (
      select 1
      from public.profiles
      where lower(pseudo) = lower(trim(requested_pseudo))
    ) as pseudo_available,
    not exists (
      select 1
      from public.profiles
      where lower(email) = lower(trim(requested_email))
    ) as email_available;
$$;

grant execute on function public.check_profile_availability(text, text)
to anon, authenticated;
