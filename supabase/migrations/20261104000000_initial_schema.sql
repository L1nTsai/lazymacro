-- LazyMacro schema: the plan's ten tables, plus storage for favorites,
-- allergies and exclusions, and pantry staples.
--
-- Access rules, enforced here so that a bug in the app can't widen them:
--   * anon can touch nothing except is_allowed_signup_email().
--   * Personal rows are only visible to their owner (RLS).
--   * foods and food_portions are read-only to clients.
--   * Sign-up is limited to allowed domains, and fails closed when none are set.

create extension if not exists pg_trgm with schema extensions;

-- Sign-up domain restriction -------------------------------------------------

create schema app_private;
revoke all on schema app_private from public, anon, authenticated;

create table app_private.allowed_email_domains (
  domain text primary key
    check (domain = lower(domain) and domain ~ '^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$')
);

create function app_private.email_domain_allowed(address text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from app_private.allowed_email_domains
    where domain = lower(substring(address from '@([^@]+)$'))
  );
$$;

create function app_private.enforce_email_domain()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app_private.email_domain_allowed(new.email) then
    raise exception 'email domain not allowed' using errcode = 'check_violation';
  end if;
  if coalesce(new.email_change, '') <> ''
     and not app_private.email_domain_allowed(new.email_change) then
    raise exception 'email domain not allowed' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger enforce_email_domain
  before insert or update of email, email_change on auth.users
  for each row execute function app_private.enforce_email_domain();

-- Lets the sign-up form give a clear message. The trigger is the real check.
create function public.is_allowed_signup_email(address text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app_private.email_domain_allowed(address);
$$;

-- Types ----------------------------------------------------------------------

create type public.sex as enum ('male', 'female');
create type public.activity_level as enum ('sedentary', 'light', 'moderate', 'very_active');
create type public.goal as enum ('lose', 'maintain', 'gain');
create type public.food_source as enum ('usda', 'off', 'restaurant', 'custom');
create type public.food_confidence as enum ('verified', 'estimated', 'rough');
create type public.meal_type as enum ('breakfast', 'lunch', 'dinner', 'snack');
create type public.meal_source as enum ('voice', 'text', 'manual', 'suggestion');
create type public.exclusion_kind as enum ('allergy', 'exclude');
create type public.inventory_location as enum ('fridge', 'freezer', 'pantry');
create type public.inventory_level as enum ('full', 'half', 'low');
create type public.inventory_reason as enum ('bought', 'eaten', 'discarded', 'adjusted');
create type public.suggestion_status as enum ('shown', 'cooked', 'dismissed');

-- Profile and targets --------------------------------------------------------

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- Body details are optional because manual mode only needs targets.
  sex public.sex,
  birth_year smallint check (birth_year between 1900 and 2100),
  height_cm numeric(4, 1) check (height_cm between 50 and 300),
  weight_kg numeric(4, 1) check (weight_kg between 20 and 500),
  activity public.activity_level,
  goal public.goal,
  pace_kg_per_week numeric(3, 2) not null default 0 check (pace_kg_per_week between 0 and 1.5),
  timezone text not null check (timezone <> ''),
  show_oz boolean not null default false,
  max_prep_minutes integer check (max_prep_minutes > 0),
  equipment text[] not null default '{}',
  cuisines text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint body_details_all_or_none
    check (num_nonnulls(sex, birth_year, height_cm, weight_kg, activity, goal) in (0, 6)),
  constraint pace_matches_goal
    check ((goal is null or goal = 'maintain') = (pace_kg_per_week = 0))
);

create table public.targets (
  user_id uuid not null references auth.users (id) on delete cascade,
  effective_from date not null,
  kcal integer not null check (kcal between 1 and 20000),
  protein_g numeric(6, 1) not null check (protein_g >= 0),
  carbs_g numeric(6, 1) not null check (carbs_g >= 0),
  fat_g numeric(6, 1) not null check (fat_g >= 0),
  created_at timestamptz not null default now(),
  primary key (user_id, effective_from)
);

create table public.user_exclusions (
  user_id uuid not null references auth.users (id) on delete cascade,
  term text not null check (term <> '' and term = lower(term)),
  kind public.exclusion_kind not null,
  primary key (user_id, term)
);

create table public.user_staples (
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (name <> '' and name = lower(name)),
  primary key (user_id, name)
);

-- Foods ----------------------------------------------------------------------

-- Team-shared reference data. There's deliberately no column saying who added
-- a food, so a shared food can't reveal what someone has eaten.
create table public.foods (
  id uuid primary key default gen_random_uuid(),
  source public.food_source not null,
  source_id text,
  source_url text,
  confidence public.food_confidence not null,
  name text not null check (name <> ''),
  brand text,
  kcal_per_100g numeric(6, 1) not null check (kcal_per_100g between 0 and 1000),
  protein_per_100g numeric(5, 2) not null check (protein_per_100g between 0 and 100),
  carbs_per_100g numeric(5, 2) not null check (carbs_per_100g between 0 and 100),
  fat_per_100g numeric(5, 2) not null check (fat_per_100g between 0 and 100),
  density_g_per_ml numeric(5, 3) check (density_g_per_ml > 0),
  search_vector tsvector generated always as (
    to_tsvector('english', name || ' ' || coalesce(brand, ''))
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint food_source_identifier
    check (source not in ('usda', 'off') or source_id is not null),
  constraint restaurant_has_source_url
    check (source <> 'restaurant' or source_url is not null),
  constraint food_source_id_unique unique (source, source_id)
);

create index foods_search_vector_idx on public.foods using gin (search_vector);
create index foods_name_trgm_idx on public.foods using gin (name extensions.gin_trgm_ops);

create table public.food_portions (
  id uuid primary key default gen_random_uuid(),
  food_id uuid not null references public.foods (id) on delete cascade,
  label text not null check (label <> ''),
  grams numeric(8, 2) not null check (grams > 0),
  constraint food_portion_label_unique unique (food_id, label)
);

create table public.user_aliases (
  user_id uuid not null references auth.users (id) on delete cascade,
  phrase text not null check (phrase <> '' and phrase = lower(phrase)),
  food_id uuid not null references public.foods (id) on delete restrict,
  default_grams numeric(8, 2) check (default_grams > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, phrase)
);

create index user_aliases_food_id_idx on public.user_aliases (food_id);

-- Meals and log entries ------------------------------------------------------

create table public.meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  eaten_on date not null,
  meal_type public.meal_type not null,
  source public.meal_source not null,
  transcript text,
  client_id uuid not null,
  created_at timestamptz not null default now(),
  -- Makes Confirm safe to retry on a flaky connection.
  constraint meals_client_id_unique unique (user_id, client_id),
  constraint meals_id_user_unique unique (id, user_id)
);

create index meals_user_date_idx on public.meals (user_id, eaten_on);

-- Macros and trust are snapshots, so database updates can't rewrite history.
create table public.log_entries (
  id uuid primary key default gen_random_uuid(),
  meal_id uuid not null,
  user_id uuid not null,
  food_id uuid not null references public.foods (id) on delete restrict,
  phrase text,
  quantity numeric(8, 2) not null check (quantity > 0),
  unit text not null check (unit <> ''),
  grams numeric(8, 2) not null check (grams > 0),
  kcal numeric(7, 1) not null check (kcal >= 0),
  protein_g numeric(6, 1) not null check (protein_g >= 0),
  carbs_g numeric(6, 1) not null check (carbs_g >= 0),
  fat_g numeric(6, 1) not null check (fat_g >= 0),
  confidence public.food_confidence not null,
  source_url text,
  adjusted boolean not null default false,
  assumptions text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- The owner must match the meal, which keeps the RLS check on user_id honest.
  constraint log_entries_meal_fk foreign key (meal_id, user_id)
    references public.meals (id, user_id) on delete cascade
);

create index log_entries_meal_idx on public.log_entries (meal_id, user_id);
create index log_entries_user_idx on public.log_entries (user_id);
create index log_entries_food_idx on public.log_entries (food_id);

create table public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (name <> ''),
  created_at timestamptz not null default now(),
  constraint favorites_name_unique unique (user_id, name),
  constraint favorites_id_user_unique unique (id, user_id)
);

create table public.favorite_items (
  id uuid primary key default gen_random_uuid(),
  favorite_id uuid not null,
  user_id uuid not null,
  food_id uuid not null references public.foods (id) on delete restrict,
  quantity numeric(8, 2) not null check (quantity > 0),
  unit text not null check (unit <> ''),
  grams numeric(8, 2) not null check (grams > 0),
  constraint favorite_items_favorite_fk foreign key (favorite_id, user_id)
    references public.favorites (id, user_id) on delete cascade
);

create index favorite_items_favorite_idx on public.favorite_items (favorite_id, user_id);
create index favorite_items_user_idx on public.favorite_items (user_id);
create index favorite_items_food_idx on public.favorite_items (food_id);

-- Inventory ------------------------------------------------------------------

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  food_id uuid not null references public.foods (id) on delete restrict,
  location public.inventory_location not null,
  quantity_g numeric(9, 2) check (quantity_g >= 0),
  level public.inventory_level,
  grams_per_piece numeric(8, 2) check (grams_per_piece > 0),
  expires_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_grams_or_level check (num_nonnulls(quantity_g, level) = 1),
  constraint inventory_items_id_user_unique unique (id, user_id)
);

create index inventory_items_user_idx on public.inventory_items (user_id, location);
create index inventory_items_food_idx on public.inventory_items (food_id);

-- Append-only ledger: clients get no update or delete policy.
create table public.inventory_events (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null,
  user_id uuid not null,
  delta_g numeric(9, 2) check (delta_g <> 0),
  new_level public.inventory_level,
  reason public.inventory_reason not null,
  log_entry_id uuid references public.log_entries (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint inventory_event_grams_or_level check (num_nonnulls(delta_g, new_level) = 1),
  constraint inventory_events_item_fk foreign key (item_id, user_id)
    references public.inventory_items (id, user_id) on delete cascade
);

create index inventory_events_item_idx on public.inventory_events (item_id, user_id, created_at);
create index inventory_events_user_idx on public.inventory_events (user_id);
create index inventory_events_log_entry_idx on public.inventory_events (log_entry_id);

-- Suggestions ----------------------------------------------------------------

create table public.suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  budget jsonb not null,
  recipe jsonb not null,
  status public.suggestion_status not null default 'shown',
  created_at timestamptz not null default now()
);

create index suggestions_user_idx on public.suggestions (user_id, created_at desc);

-- Row-level security ---------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.targets enable row level security;
alter table public.user_exclusions enable row level security;
alter table public.user_staples enable row level security;
alter table public.foods enable row level security;
alter table public.food_portions enable row level security;
alter table public.user_aliases enable row level security;
alter table public.meals enable row level security;
alter table public.log_entries enable row level security;
alter table public.favorites enable row level security;
alter table public.favorite_items enable row level security;
alter table public.inventory_items enable row level security;
alter table public.inventory_events enable row level security;
alter table public.suggestions enable row level security;

revoke all on all tables in schema public from anon, authenticated;
grant select on public.foods, public.food_portions to authenticated;
grant select, insert, update, delete on
  public.profiles,
  public.targets,
  public.user_exclusions,
  public.user_staples,
  public.user_aliases,
  public.meals,
  public.log_entries,
  public.favorites,
  public.favorite_items,
  public.inventory_items,
  public.suggestions
to authenticated;
grant select, insert on public.inventory_events to authenticated;

create policy foods_read on public.foods
  for select to authenticated using (true);
create policy food_portions_read on public.food_portions
  for select to authenticated using (true);

create policy own_rows on public.profiles for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy own_rows on public.targets for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy own_rows on public.user_exclusions for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy own_rows on public.user_staples for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy own_rows on public.user_aliases for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy own_rows on public.meals for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy own_rows on public.log_entries for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy own_rows on public.favorites for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy own_rows on public.favorite_items for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy own_rows on public.inventory_items for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy own_rows on public.suggestions for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy read_own on public.inventory_events for select to authenticated
  using ((select auth.uid()) = user_id);
create policy add_own on public.inventory_events for insert to authenticated
  with check ((select auth.uid()) = user_id);

-- Functions the app calls ----------------------------------------------------

create function public.search_foods(q text, max_results integer default 20)
returns table (
  id uuid,
  name text,
  brand text,
  source public.food_source,
  confidence public.food_confidence,
  kcal_per_100g numeric,
  protein_per_100g numeric,
  carbs_per_100g numeric,
  fat_per_100g numeric
)
language sql
stable
set search_path = public, extensions
as $$
  with input as (
    select
      lower(trim(left(q, 100))) as cleaned,
      (
        select string_agg(token || ':*', ' & ')
        from regexp_split_to_table(lower(left(q, 100)), '[^[:alnum:]]+') as token
        where token <> ''
      ) as prefix_query
  )
  select
    f.id, f.name, f.brand, f.source, f.confidence,
    f.kcal_per_100g, f.protein_per_100g, f.carbs_per_100g, f.fat_per_100g
  from public.foods f
  cross join input i
  where i.prefix_query is not null
    and (
      f.search_vector @@ to_tsquery('english', i.prefix_query)
      or i.cleaned <% f.name
    )
  order by
    ts_rank(f.search_vector, to_tsquery('english', i.prefix_query)) desc,
    word_similarity(i.cleaned, f.name) desc,
    length(f.name) asc,
    f.id
  limit least(greatest(max_results, 1), 50);
$$;

-- Saves everything from goal setup in one transaction. Runs as the caller, so
-- RLS still applies; p_today is the caller's local date.
create function public.save_my_setup(
  p_profile jsonb,
  p_targets jsonb,
  p_exclusions jsonb,
  p_staples text[],
  p_today date
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'not signed in' using errcode = 'insufficient_privilege';
  end if;

  insert into public.profiles as p (
    user_id, sex, birth_year, height_cm, weight_kg, activity, goal,
    pace_kg_per_week, timezone, show_oz
  ) values (
    me,
    (p_profile ->> 'sex')::public.sex,
    (p_profile ->> 'birth_year')::smallint,
    (p_profile ->> 'height_cm')::numeric,
    (p_profile ->> 'weight_kg')::numeric,
    (p_profile ->> 'activity')::public.activity_level,
    (p_profile ->> 'goal')::public.goal,
    (p_profile ->> 'pace_kg_per_week')::numeric,
    p_profile ->> 'timezone',
    (p_profile ->> 'show_oz')::boolean
  )
  on conflict (user_id) do update set
    sex = excluded.sex,
    birth_year = excluded.birth_year,
    height_cm = excluded.height_cm,
    weight_kg = excluded.weight_kg,
    activity = excluded.activity,
    goal = excluded.goal,
    pace_kg_per_week = excluded.pace_kg_per_week,
    timezone = excluded.timezone,
    show_oz = excluded.show_oz,
    updated_at = now();

  insert into public.targets (user_id, effective_from, kcal, protein_g, carbs_g, fat_g)
  values (
    me,
    p_today,
    (p_targets ->> 'kcal')::integer,
    (p_targets ->> 'protein_g')::numeric,
    (p_targets ->> 'carbs_g')::numeric,
    (p_targets ->> 'fat_g')::numeric
  )
  on conflict (user_id, effective_from) do update set
    kcal = excluded.kcal,
    protein_g = excluded.protein_g,
    carbs_g = excluded.carbs_g,
    fat_g = excluded.fat_g;

  delete from public.user_exclusions where user_id = me;
  insert into public.user_exclusions (user_id, term, kind)
  select me, lower(trim(e ->> 'term')), (e ->> 'kind')::public.exclusion_kind
  from jsonb_array_elements(p_exclusions) as e
  on conflict (user_id, term) do nothing;

  delete from public.user_staples where user_id = me;
  insert into public.user_staples (user_id, name)
  select me, lower(trim(s)) from unnest(p_staples) as s
  on conflict (user_id, name) do nothing;
end;
$$;

-- Removes the caller's account. Every personal table cascades from auth.users.
create function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = 'insufficient_privilege';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.is_allowed_signup_email(text) from public;
revoke all on function public.search_foods(text, integer) from public, anon;
revoke all on function public.save_my_setup(jsonb, jsonb, jsonb, text[], date) from public, anon;
revoke all on function public.delete_my_account() from public, anon;
revoke all on function app_private.email_domain_allowed(text) from public;
revoke all on function app_private.enforce_email_domain() from public;

grant execute on function public.is_allowed_signup_email(text) to anon, authenticated;
grant execute on function public.search_foods(text, integer) to authenticated;
grant execute on function public.save_my_setup(jsonb, jsonb, jsonb, text[], date) to authenticated;
grant execute on function public.delete_my_account() to authenticated;
