alter table public.subscriptions
add column if not exists plan text,
add column if not exists price_id text,
add column if not exists commitment_until timestamptz;
