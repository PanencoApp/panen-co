-- Adds a real admin role flag to profiles.

alter table public.profiles
add column if not exists is_admin boolean not null default false;

update public.profiles
set is_admin = true
where lower(email) = 'panenco14@gmail.com';
