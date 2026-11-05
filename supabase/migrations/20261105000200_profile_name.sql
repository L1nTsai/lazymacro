-- Adds the name asked for on the first setup step. Nullable because existing
-- profiles don't have one; the app sends those people back through setup.
alter table public.profiles
  add column display_name text check (char_length(display_name) between 1 and 80);

create or replace function public.save_my_setup(
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
    user_id, display_name, sex, birth_year, height_cm, weight_kg, activity, goal,
    pace_kg_per_week, timezone, show_oz
  ) values (
    me,
    p_profile ->> 'display_name',
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
    display_name = excluded.display_name,
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

revoke all on function public.save_my_setup(jsonb, jsonb, jsonb, text[], date) from public, anon;
grant execute on function public.save_my_setup(jsonb, jsonb, jsonb, text[], date) to authenticated;
