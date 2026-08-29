-- Temporary live payout test: lower the withdrawal minimum from 20 euros to 1 euro.
-- Revert this after the real PayPal payout test is validated.

alter table public.withdrawal_requests
drop constraint if exists withdrawal_requests_amount_euros_check;

alter table public.withdrawal_requests
add constraint withdrawal_requests_amount_euros_check
check (amount_euros >= 1);
