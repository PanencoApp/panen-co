-- Stores PayPal payout information for withdrawal automation.

alter table public.withdrawal_requests
add column if not exists paypal_email text,
add column if not exists provider_item_id text;

create index if not exists withdrawal_requests_provider_item_id_idx
on public.withdrawal_requests(provider_item_id)
where provider_item_id is not null;
