-- Production guardrails for prediction creation.
-- Enforces one match per user, max 5 predictions per Paris day, and no prediction after kickoff.

alter table public.predictions
add column if not exists prediction_date date;

update public.predictions
set prediction_date = (created_at at time zone 'Europe/Paris')::date
where prediction_date is null;

alter table public.predictions
alter column prediction_date set default ((now() at time zone 'Europe/Paris')::date);

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
