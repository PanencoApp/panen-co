-- Panen&Co initial Supabase schema.
-- Run this in Supabase SQL Editor after creating the project.

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  pseudo text not null unique,
  email text not null,
  is_adult boolean not null default false,
  notifications_enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  home_team text not null,
  away_team text not null,
  kickoff_at timestamptz not null,
  status text not null default 'scheduled',
  home_score int,
  away_score int,
  first_scoring_team text,
  last_scoring_team text,
  total_goals numeric,
  created_at timestamptz not null default now()
);

create table if not exists public.daily_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  token_date date not null default current_date,
  free_tokens int not null default 1,
  ad_tokens int not null default 0,
  subscription_tokens int not null default 0,
  used_tokens int not null default 0,
  unique(user_id, token_date)
);

create table if not exists public.predictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  match_id uuid not null references public.matches(id) on delete cascade,
  result_pick text not null,
  scorer_pick text not null,
  exact_score_pick text not null,
  first_team_pick text not null,
  last_team_pick text not null,
  goals_pick text not null,
  status text not null default 'active',
  points int not null default 0,
  score_details jsonb,
  prediction_date date default ((now() at time zone 'Europe/Paris')::date),
  created_at timestamptz not null default now(),
  unique(user_id, match_id)
);

create table if not exists public.weekly_scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  pseudo text,
  week_start date not null,
  points int not null default 0,
  reward_euros int not null default 0,
  updated_at timestamptz not null default now(),
  unique(user_id, week_start)
);

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

create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  friend_id uuid references public.profiles(id) on delete set null,
  match_id uuid not null references public.matches(id) on delete cascade,
  friendly_stake text,
  status text not null default 'waiting_friend',
  created_at timestamptz not null default now()
);

create table if not exists public.challenge_predictions (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  result_pick text not null,
  scorer_pick text not null,
  exact_score_pick text not null,
  first_team_pick text not null,
  last_team_pick text not null,
  goals_pick text not null,
  points int not null default 0,
  created_at timestamptz not null default now(),
  unique(challenge_id, user_id)
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null default 'stripe',
  provider_customer_id text,
  provider_subscription_id text,
  status text not null default 'inactive',
  current_period_end timestamptz,
  updated_at timestamptz not null default now(),
  unique(user_id)
);

create table if not exists public.help_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  subject text not null,
  message text not null,
  status text not null default 'open',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.daily_tokens enable row level security;
alter table public.predictions enable row level security;
alter table public.weekly_scores enable row level security;
alter table public.user_winnings enable row level security;
alter table public.weekly_reward_claims enable row level security;
alter table public.withdrawal_requests enable row level security;
alter table public.challenges enable row level security;
alter table public.challenge_predictions enable row level security;
alter table public.subscriptions enable row level security;
alter table public.help_requests enable row level security;
alter table public.matches enable row level security;

create policy "Public can read matches"
on public.matches for select
using (true);

create policy "Authenticated users can create demo matches"
on public.matches for insert
to authenticated
with check (true);

create policy "Public can read weekly scores"
on public.weekly_scores for select
using (true);

create policy "Users can create own weekly score"
on public.weekly_scores for insert
with check (auth.uid() = user_id);

create policy "Users can update own weekly score"
on public.weekly_scores for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can read own winnings"
on public.user_winnings for select
using (auth.uid() = user_id);

create policy "Users can read own weekly reward claims"
on public.weekly_reward_claims for select
using (auth.uid() = user_id);

create policy "Users can read own withdrawal requests"
on public.withdrawal_requests for select
using (auth.uid() = user_id);

create policy "Users can read own profile"
on public.profiles for select
using (auth.uid() = id);

create policy "Users can update own profile"
on public.profiles for update
using (auth.uid() = id);

create policy "Users can read own tokens"
on public.daily_tokens for select
using (auth.uid() = user_id);

create policy "Users can create own tokens"
on public.daily_tokens for insert
with check (auth.uid() = user_id);

create policy "Users can update own tokens"
on public.daily_tokens for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can read own predictions"
on public.predictions for select
using (auth.uid() = user_id);

create policy "Users can create own predictions"
on public.predictions for insert
with check (auth.uid() = user_id);

create policy "Users can update own predictions"
on public.predictions for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can read involved challenges"
on public.challenges for select
using (auth.uid() = creator_id or auth.uid() = friend_id);

create policy "Users can create challenges"
on public.challenges for insert
with check (auth.uid() = creator_id);

create policy "Users can read involved challenge predictions"
on public.challenge_predictions for select
using (
  exists (
    select 1 from public.challenges c
    where c.id = challenge_id
    and (c.creator_id = auth.uid() or c.friend_id = auth.uid())
  )
);

create policy "Users can create own challenge predictions"
on public.challenge_predictions for insert
with check (auth.uid() = user_id);

create policy "Users can read own subscription"
on public.subscriptions for select
using (auth.uid() = user_id);

create policy "Users can create own help requests"
on public.help_requests for insert
with check (auth.uid() = user_id);

create unique index if not exists predictions_user_prediction_date_match_idx
on public.predictions(user_id, prediction_date, match_id);

create index if not exists predictions_user_prediction_date_idx
on public.predictions(user_id, prediction_date);

create or replace function public.guard_prediction_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  match_kickoff timestamptz;
  user_day_count int;
begin
  new.prediction_date := coalesce(
    new.prediction_date,
    (now() at time zone 'Europe/Paris')::date
  );

  select kickoff_at
  into match_kickoff
  from public.matches
  where id = new.match_id;

  if match_kickoff is null then
    raise exception 'MATCH_NOT_FOUND';
  end if;

  if match_kickoff <= now() then
    raise exception 'MATCH_ALREADY_STARTED';
  end if;

  select count(*)
  into user_day_count
  from public.predictions
  where user_id = new.user_id
    and prediction_date = new.prediction_date;

  if user_day_count >= 5 then
    raise exception 'DAILY_PREDICTION_LIMIT_REACHED';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_prediction_insert_trigger on public.predictions;

create trigger guard_prediction_insert_trigger
before insert on public.predictions
for each row
execute function public.guard_prediction_insert();
