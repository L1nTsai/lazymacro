-- Whole-word matches on every term now outrank prefix matches ("egg" finds eggs
-- before eggplant), and typo matches ("whey protein" reaching soy protein) come
-- last. Protein powders live under "Beverages," so that prefix isn't penalized.
create or replace function public.search_foods(q text, max_results integer default 20)
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
      plainto_tsquery('english', left(q, 100)) as exact_terms,
      (
        select string_agg(token || ':*', ' & ')
        from regexp_split_to_table(lower(left(q, 100)), '[^[:alnum:]]+') as token
        where token <> ''
      ) as all_terms,
      (
        select string_agg(token, ' | ')
        from regexp_split_to_table(lower(left(q, 100)), '[^[:alnum:]]+') as token
        where token <> ''
      ) as any_term
  )
  select
    f.id, f.name, f.brand, f.source, f.confidence,
    f.kcal_per_100g, f.protein_per_100g, f.carbs_per_100g, f.fat_per_100g
  from public.foods f
  cross join input i
  where i.all_terms is not null
    and (
      f.search_vector @@ to_tsquery('english', i.all_terms)
      or i.cleaned <% f.name
    )
  order by
    (f.name ~* '^(babyfood|infant formula|fast foods|restaurant)') asc,
    (f.search_vector @@ i.exact_terms) desc,
    (f.search_vector @@ to_tsquery('english', i.all_terms)) desc,
    (to_tsvector('english', split_part(f.name, ',', 1)) @@ to_tsquery('english', i.any_term)) desc,
    (split_part(f.name, ',', 1) ~ ' ') asc,
    length(f.name) asc,
    f.id
  limit least(greatest(max_results, 1), 50);
$$;

revoke all on function public.search_foods(text, integer) from public, anon;
grant execute on function public.search_foods(text, integer) to authenticated;
