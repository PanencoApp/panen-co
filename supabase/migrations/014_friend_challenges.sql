create table if not exists public.friend_challenges (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references auth.users(id) on delete cascade,
  creator_pseudo text not null,
  friend_id uuid references auth.users(id) on delete set null,
  friend_pseudo text,
  match_id text not null,
  match_label text not null,
  match_time text not null default '',
  match_date timestamptz,
  stake text not null default '',
  creator_pick jsonb not null,
  friend_pick jsonb,
  status text not null default 'waiting'
    check (status in ('waiting', 'active', 'done')),
  creator_points integer,
  friend_points integer,
  creator_score_details jsonb,
  friend_score_details jsonb,
  result_summary jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  settled_at timestamptz
);

alter table public.friend_challenges enable row level security;

drop policy if exists "friend challenges are readable by participants" on public.friend_challenges;
create policy "friend challenges are readable by participants"
on public.friend_challenges for select
to authenticated
using (
  creator_id = auth.uid()
  or friend_id = auth.uid()
  or friend_id is null
);

drop policy if exists "users can create own friend challenges" on public.friend_challenges;
create policy "users can create own friend challenges"
on public.friend_challenges for insert
to authenticated
with check (creator_id = auth.uid());

drop policy if exists "participants can update friend challenges" on public.friend_challenges;
create policy "participants can update friend challenges"
on public.friend_challenges for update
to authenticated
using (
  creator_id = auth.uid()
  or friend_id = auth.uid()
  or friend_id is null
)
with check (
  creator_id = auth.uid()
  or friend_id = auth.uid()
  or friend_id is null
);

create index if not exists friend_challenges_creator_id_idx
  on public.friend_challenges (creator_id, created_at desc);

create index if not exists friend_challenges_friend_id_idx
  on public.friend_challenges (friend_id, created_at desc);

create index if not exists friend_challenges_status_idx
  on public.friend_challenges (status, created_at desc);
