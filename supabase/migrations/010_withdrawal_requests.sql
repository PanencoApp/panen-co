-- Stores withdrawal requests created by users from their available winnings.

create table if not exists public.withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount_euros int not null check (amount_euros >= 20),
  account_holder_name text not null,
  iban text not null,
  iban_last4 text not null,
  status text not null default 'pending',
  provider text,
  provider_payout_id text,
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.withdrawal_requests enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'withdrawal_requests'
      and policyname = 'Users can read own withdrawal requests'
  ) then
    create policy "Users can read own withdrawal requests"
    on public.withdrawal_requests for select
    using (auth.uid() = user_id);
  end if;
end $$;
