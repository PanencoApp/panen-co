-- Removes the legacy money/reward/payout model.
-- Panen&Co now uses points, tokens, badges and rankings only.

drop table if exists public.withdrawal_requests cascade;
drop table if exists public.user_winnings cascade;
drop table if exists public.weekly_reward_claims cascade;

alter table if exists public.weekly_scores
drop column if exists reward_euros;
