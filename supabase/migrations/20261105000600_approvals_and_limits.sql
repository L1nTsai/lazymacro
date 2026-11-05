-- Sign-up opens to Gmail, so anyone can create an account. Nothing works until
-- the owner ticks `approved` for it in the Supabase dashboard. This is enforced
-- here, not only in the app, because the database is reachable directly.

create table public.signup_approvals (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  approved boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.signup_approvals enable row level security;
revoke all on public.signup_approvals from anon, authenticated;
grant select on public.signup_approvals to authenticated;
create policy read_own on public.signup_approvals for select to authenticated
  using ((select auth.uid()) = user_id);

create function app_private.add_signup_approval()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.signup_approvals (user_id, email) values (new.id, new.email);
  return new;
end;
$$;
revoke all on function app_private.add_signup_approval() from public;

create trigger add_signup_approval
  after insert on auth.users
  for each row execute function app_private.add_signup_approval();

-- Accounts from before this change stay usable.
insert into public.signup_approvals (user_id, email, approved)
select id, email, true from auth.users;

create function public.is_approved()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select approved from public.signup_approvals where user_id = auth.uid()),
    false
  );
$$;
revoke all on function public.is_approved() from public, anon;
grant execute on function public.is_approved() to authenticated;

drop policy own_rows on public.profiles;
create policy own_rows on public.profiles for all to authenticated
  using ((select auth.uid()) = user_id and (select public.is_approved()))
  with check ((select auth.uid()) = user_id and (select public.is_approved()));
drop policy own_rows on public.targets;
create policy own_rows on public.targets for all to authenticated
  using ((select auth.uid()) = user_id and (select public.is_approved()))
  with check ((select auth.uid()) = user_id and (select public.is_approved()));
drop policy own_rows on public.user_exclusions;
create policy own_rows on public.user_exclusions for all to authenticated
  using ((select auth.uid()) = user_id and (select public.is_approved()))
  with check ((select auth.uid()) = user_id and (select public.is_approved()));
drop policy own_rows on public.user_staples;
create policy own_rows on public.user_staples for all to authenticated
  using ((select auth.uid()) = user_id and (select public.is_approved()))
  with check ((select auth.uid()) = user_id and (select public.is_approved()));
drop policy own_rows on public.user_aliases;
create policy own_rows on public.user_aliases for all to authenticated
  using ((select auth.uid()) = user_id and (select public.is_approved()))
  with check ((select auth.uid()) = user_id and (select public.is_approved()));
drop policy own_rows on public.user_corrections;
create policy own_rows on public.user_corrections for all to authenticated
  using ((select auth.uid()) = user_id and (select public.is_approved()))
  with check ((select auth.uid()) = user_id and (select public.is_approved()));
drop policy own_rows on public.meals;
create policy own_rows on public.meals for all to authenticated
  using ((select auth.uid()) = user_id and (select public.is_approved()))
  with check ((select auth.uid()) = user_id and (select public.is_approved()));
drop policy own_rows on public.log_entries;
create policy own_rows on public.log_entries for all to authenticated
  using ((select auth.uid()) = user_id and (select public.is_approved()))
  with check ((select auth.uid()) = user_id and (select public.is_approved()));
drop policy own_rows on public.favorites;
create policy own_rows on public.favorites for all to authenticated
  using ((select auth.uid()) = user_id and (select public.is_approved()))
  with check ((select auth.uid()) = user_id and (select public.is_approved()));
drop policy own_rows on public.favorite_items;
create policy own_rows on public.favorite_items for all to authenticated
  using ((select auth.uid()) = user_id and (select public.is_approved()))
  with check ((select auth.uid()) = user_id and (select public.is_approved()));
drop policy own_rows on public.inventory_items;
create policy own_rows on public.inventory_items for all to authenticated
  using ((select auth.uid()) = user_id and (select public.is_approved()))
  with check ((select auth.uid()) = user_id and (select public.is_approved()));
drop policy own_rows on public.suggestions;
create policy own_rows on public.suggestions for all to authenticated
  using ((select auth.uid()) = user_id and (select public.is_approved()))
  with check ((select auth.uid()) = user_id and (select public.is_approved()));

drop policy foods_read on public.foods;
create policy foods_read on public.foods for select to authenticated
  using ((select public.is_approved()));
drop policy food_portions_read on public.food_portions;
create policy food_portions_read on public.food_portions for select to authenticated
  using ((select public.is_approved()));
drop policy read_own on public.inventory_events;
create policy read_own on public.inventory_events for select to authenticated
  using ((select auth.uid()) = user_id and (select public.is_approved()));
drop policy add_own on public.inventory_events;
create policy add_own on public.inventory_events for insert to authenticated
  with check ((select auth.uid()) = user_id and (select public.is_approved()));

create or replace function public.save_food(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  food_source public.food_source := (p ->> 'source')::public.food_source;
  trust public.food_confidence := (p ->> 'confidence')::public.food_confidence;
  url text := p ->> 'source_url';
  serving numeric := (p ->> 'serving_grams')::numeric;
  saved uuid;
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = 'insufficient_privilege';
  end if;

  if not public.is_approved() then
    raise exception 'not approved' using errcode = 'insufficient_privilege';
  end if;

  if food_source = 'custom' and trust = 'verified' then
    raise exception 'custom foods cannot be verified' using errcode = 'check_violation';
  end if;
  if food_source = 'restaurant' and (trust <> 'verified' or url !~ '^https://') then
    raise exception 'restaurant foods need a source link' using errcode = 'check_violation';
  end if;
  if food_source = 'off' then
    raise exception 'source not accepted' using errcode = 'check_violation';
  end if;
  if food_source = 'usda' and (trust <> 'verified' or coalesce(p ->> 'source_id', '') !~ '^[0-9]+$') then
    raise exception 'usda foods need an id' using errcode = 'check_violation';
  end if;

  if food_source = 'usda' then
    select id into saved from public.foods where source = 'usda' and source_id = p ->> 'source_id';
    if saved is not null then
      return saved;
    end if;
  end if;

  insert into public.foods (
    source, source_id, source_url, confidence, name, brand,
    kcal_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g
  ) values (
    food_source,
    p ->> 'source_id',
    url,
    trust,
    trim(p ->> 'name'),
    nullif(trim(p ->> 'brand'), ''),
    (p ->> 'kcal_per_100g')::numeric,
    (p ->> 'protein_per_100g')::numeric,
    (p ->> 'carbs_per_100g')::numeric,
    (p ->> 'fat_per_100g')::numeric
  )
  on conflict (source, lower(name), lower(coalesce(brand, '')))
    where source in ('custom', 'restaurant')
    do update set updated_at = now()
  returning id into saved;

  if serving is not null then
    insert into public.food_portions (food_id, label, grams)
    values (saved, 'serving', serving)
    on conflict (food_id, label) do nothing;
  end if;
  return saved;
end;
$$;


revoke all on function public.save_food(jsonb) from public, anon;
grant execute on function public.save_food(jsonb) to authenticated;

-- The daily limit on anything that costs AI credits. Clients can read their own
-- count but can't change it, and the day comes from the database, not the request.
create table public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  kind text not null check (kind in ('transcribe', 'parse')),
  used integer not null default 0 check (used >= 0),
  primary key (user_id, day, kind)
);

alter table public.ai_usage enable row level security;
revoke all on public.ai_usage from anon, authenticated;
grant select on public.ai_usage to authenticated;
create policy read_own on public.ai_usage for select to authenticated
  using ((select auth.uid()) = user_id);

-- Takes one use and returns how many are left today, or -1 if none were available.
-- Each logged meal uses one 'parse', and one 'transcribe' if it was spoken.
create function public.use_ai_call(p_kind text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  daily_limit constant integer := 10;
  me uuid := auth.uid();
  zone text;
  now_used integer;
begin
  if me is null or not public.is_approved() then
    return -1;
  end if;
  select timezone into zone from public.profiles where user_id = me;

  insert into public.ai_usage as u (user_id, day, kind, used)
  values (me, (now() at time zone coalesce(zone, 'UTC'))::date, p_kind, 1)
  on conflict (user_id, day, kind) do update set used = u.used + 1
    where u.used < daily_limit
  returning used into now_used;

  if now_used is null then
    return -1;
  end if;
  return daily_limit - now_used;
end;
$$;
revoke all on function public.use_ai_call(text) from public, anon;
grant execute on function public.use_ai_call(text) to authenticated;

-- Sign-up is now Gmail only. Accounts are confirmed by the owner's approval.
insert into app_private.allowed_email_domains (domain) values ('gmail.com')
on conflict do nothing;
