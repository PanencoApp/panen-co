-- Stores Mangopay identifiers needed to automate payouts.

alter table public.profiles
add column if not exists mangopay_user_id text,
add column if not exists mangopay_wallet_id text,
add column if not exists mangopay_recipient_id text,
add column if not exists mangopay_recipient_status text,
add column if not exists mangopay_kyc_status text;

alter table public.withdrawal_requests
add column if not exists provider_status text,
add column if not exists provider_error text,
add column if not exists provider_processed_at timestamptz;

create index if not exists withdrawal_requests_provider_payout_id_idx
on public.withdrawal_requests(provider_payout_id)
where provider_payout_id is not null;
