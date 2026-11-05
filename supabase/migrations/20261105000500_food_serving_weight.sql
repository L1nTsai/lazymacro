-- A saved restaurant or label food must keep its serving weight. Without it, the
-- second person to log the dish would get a generic portion and the wrong calories.
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
