-- Voice logging: atomic, retry-safe confirmation, foods added at confirm time,
-- and the corrections that become personal defaults.

alter table public.log_entries
  add column parsed_food text,
  -- Set when an entry is one ingredient of a dish built from ingredients.
  add column dish text;

create index log_entries_last_choice_idx
  on public.log_entries (user_id, parsed_food, created_at desc)
  where parsed_food is not null;

-- Stops the same restaurant dish or custom food being added twice.
create unique index foods_added_unique
  on public.foods (source, lower(name), lower(coalesce(brand, '')))
  where source in ('custom', 'restaurant');

create table public.user_corrections (
  user_id uuid not null references auth.users (id) on delete cascade,
  phrase text not null check (phrase <> '' and phrase = lower(phrase)),
  food_id uuid not null references public.foods (id) on delete cascade,
  times integer not null default 1 check (times > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, phrase, food_id)
);

create index user_corrections_food_idx on public.user_corrections (food_id);

alter table public.user_corrections enable row level security;
revoke all on public.user_corrections from anon, authenticated;
grant select, insert, update, delete on public.user_corrections to authenticated;
create policy own_rows on public.user_corrections for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Adds a food from outside the USDA import. Clients can't write to foods
-- directly, so this function is the only way in, and it enforces each source's
-- rules. A food keeps the trust level it arrived with, whoever logs it later.
create function public.save_food(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  food_source public.food_source := (p ->> 'source')::public.food_source;
  trust public.food_confidence := (p ->> 'confidence')::public.food_confidence;
  url text := p ->> 'source_url';
  saved uuid;
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = 'insufficient_privilege';
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
  return saved;
end;
$$;

-- Saves confirmed meals in one transaction. Macros are always computed here from
-- the food's own values, never taken from the request. Retrying with the same
-- client_id changes nothing, including the correction counts.
create function public.confirm_meals(p_meals jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  meal_input jsonb;
  item jsonb;
  new_meal uuid;
  meal_ids jsonb := '[]'::jsonb;
  offers jsonb := '[]'::jsonb;
  food record;
  grams numeric;
  phrase_key text;
  corrected_times integer;
begin
  if me is null then
    raise exception 'not signed in' using errcode = 'insufficient_privilege';
  end if;

  for meal_input in select * from jsonb_array_elements(p_meals) loop
    insert into public.meals (user_id, eaten_on, meal_type, source, transcript, client_id)
    values (
      me,
      (meal_input ->> 'eaten_on')::date,
      (meal_input ->> 'meal_type')::public.meal_type,
      (meal_input ->> 'source')::public.meal_source,
      meal_input ->> 'transcript',
      (meal_input ->> 'client_id')::uuid
    )
    on conflict (user_id, client_id) do nothing
    returning id into new_meal;

    if new_meal is null then
      select id into new_meal from public.meals
      where user_id = me and client_id = (meal_input ->> 'client_id')::uuid;
      meal_ids := meal_ids || to_jsonb(new_meal);
      continue;
    end if;
    meal_ids := meal_ids || to_jsonb(new_meal);

    for item in select * from jsonb_array_elements(meal_input -> 'items') loop
      select f.id, f.confidence, f.source_url, f.kcal_per_100g, f.protein_per_100g, f.carbs_per_100g, f.fat_per_100g, f.name
        into food from public.foods f where f.id = (item ->> 'food_id')::uuid;
      if food.id is null then
        raise exception 'unknown food' using errcode = 'foreign_key_violation';
      end if;
      grams := (item ->> 'grams')::numeric;

      insert into public.log_entries (
        meal_id, user_id, food_id, phrase, parsed_food, dish, quantity, unit, grams,
        kcal, protein_g, carbs_g, fat_g, confidence, source_url, adjusted, assumptions
      ) values (
        new_meal, me, food.id, item ->> 'phrase', lower(item ->> 'parsed_food'), item ->> 'dish',
        (item ->> 'quantity')::numeric, item ->> 'unit', grams,
        round(food.kcal_per_100g * grams / 100, 1),
        round(food.protein_per_100g * grams / 100, 1),
        round(food.carbs_per_100g * grams / 100, 1),
        round(food.fat_per_100g * grams / 100, 1),
        case when item ->> 'dish' is not null and food.confidence = 'verified'
          then 'estimated'::public.food_confidence else food.confidence end,
        food.source_url,
        coalesce((item ->> 'adjusted')::boolean, false),
        coalesce(array(select jsonb_array_elements_text(item -> 'assumptions')), '{}')
      );

      if coalesce((item ->> 'corrected')::boolean, false) and item ->> 'parsed_food' is not null then
        phrase_key := lower(item ->> 'parsed_food');
        insert into public.user_corrections (user_id, phrase, food_id)
        values (me, phrase_key, food.id)
        on conflict (user_id, phrase, food_id)
          do update set times = public.user_corrections.times + 1, updated_at = now()
        returning times into corrected_times;

        if corrected_times >= 2 and not exists (
          select 1 from public.user_aliases a where a.user_id = me and a.phrase = phrase_key and a.food_id = food.id
        ) then
          offers := offers || jsonb_build_object('phrase', phrase_key, 'food_id', food.id, 'food_name', food.name);
        end if;
      end if;
    end loop;
  end loop;

  return jsonb_build_object('meal_ids', meal_ids, 'remember_offers', offers);
end;
$$;

create function public.update_log_entry(p_id uuid, p_food_id uuid, p_quantity numeric, p_unit text, p_grams numeric)
returns void
language plpgsql
set search_path = ''
as $$
declare
  food record;
  entry_dish text;
begin
  select dish into entry_dish from public.log_entries where id = p_id;
  if not found then
    raise exception 'entry not found' using errcode = 'no_data_found';
  end if;
  select * into food from public.foods where id = p_food_id;
  if food.id is null then
    raise exception 'unknown food' using errcode = 'foreign_key_violation';
  end if;
  update public.log_entries set
    food_id = food.id,
    quantity = p_quantity,
    unit = p_unit,
    grams = p_grams,
    kcal = round(food.kcal_per_100g * p_grams / 100, 1),
    protein_g = round(food.protein_per_100g * p_grams / 100, 1),
    carbs_g = round(food.carbs_per_100g * p_grams / 100, 1),
    fat_g = round(food.fat_per_100g * p_grams / 100, 1),
    confidence = case when entry_dish is not null and food.confidence = 'verified'
      then 'estimated'::public.food_confidence else food.confidence end,
    source_url = food.source_url,
    updated_at = now()
  where id = p_id;
end;
$$;

-- Removes an entry, and its meal if that was the last one.
create function public.delete_log_entry(p_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  parent uuid;
begin
  delete from public.log_entries where id = p_id returning meal_id into parent;
  if parent is not null and not exists (select 1 from public.log_entries where meal_id = parent) then
    delete from public.meals where id = parent;
  end if;
end;
$$;

create function public.save_favorite(p_name text, p_items jsonb)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  saved uuid;
begin
  if me is null then
    raise exception 'not signed in' using errcode = 'insufficient_privilege';
  end if;
  insert into public.favorites (user_id, name) values (me, trim(p_name))
  on conflict (user_id, name) do update set name = excluded.name
  returning id into saved;

  delete from public.favorite_items where favorite_id = saved;
  insert into public.favorite_items (favorite_id, user_id, food_id, quantity, unit, grams)
  select saved, me, (i ->> 'food_id')::uuid, (i ->> 'quantity')::numeric, i ->> 'unit', (i ->> 'grams')::numeric
  from jsonb_array_elements(p_items) as i;
  return saved;
end;
$$;

revoke all on function public.save_food(jsonb) from public, anon;
revoke all on function public.confirm_meals(jsonb) from public, anon;
revoke all on function public.update_log_entry(uuid, uuid, numeric, text, numeric) from public, anon;
revoke all on function public.delete_log_entry(uuid) from public, anon;
revoke all on function public.save_favorite(text, jsonb) from public, anon;
grant execute on function public.save_food(jsonb) to authenticated;
grant execute on function public.confirm_meals(jsonb) to authenticated;
grant execute on function public.update_log_entry(uuid, uuid, numeric, text, numeric) to authenticated;
grant execute on function public.delete_log_entry(uuid) to authenticated;
grant execute on function public.save_favorite(text, jsonb) to authenticated;
