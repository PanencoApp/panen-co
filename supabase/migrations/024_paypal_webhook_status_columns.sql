-- Extra PayPal payout tracking fields used by the real payout flow.

alter table public.withdrawal_requests
add column if not exists provider_status text,
add column if not exists provider_error text,
add column if not exists provider_processed_at timestamptz;
