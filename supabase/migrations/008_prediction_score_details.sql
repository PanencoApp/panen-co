alter table public.predictions
add column if not exists score_details jsonb;
