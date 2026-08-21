-- Stores cumulative user winnings and the best weekly reward already credited.

create table if not exists public.user_winnings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  balance_euros int not null default 0,
  total_earned_euros int not null default 0,
  withdrawn_euros int not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.weekly_reward_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  week_start date not null,
  best_rank int,
  best_reward_euros int not null default 0,
  credited_euros int not null default 0,
  updated_at timestamptz not null default now(),
  unique(user_id, week_start)
);

alter table public.user_winnings enable row level security;
alter table public.weekly_reward_claims enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_winnings'
      and policyname = 'Users can read own winnings'
  ) then
    create policy "Users can read own winnings"
    on public.user_winnings for select
    using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'weekly_reward_claims'
      and policyname = 'Users can read own weekly reward claims'
  ) then
    create policy "Users can read own weekly reward claims"
    on public.weekly_reward_claims for select
    using (auth.uid() = user_id);
  end if;
end $$;
