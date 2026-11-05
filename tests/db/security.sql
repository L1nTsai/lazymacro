-- Security checks against the linked project. Everything runs in one
-- transaction that is rolled back, so nothing is left behind.
-- Run with: pnpm test:db
begin;

create function pg_temp.assert(ok boolean, label text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'FAILED: %', label; end if;
end $$;

create function pg_temp.new_user(uid uuid, address text) returns void language sql as $$
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at)
  values (uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', address, 'x', now());
$$;

create function pg_temp.act_as(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
end $$;

-- Sign-up is limited to allowed domains.
do $$
begin
  begin
    perform pg_temp.new_user(gen_random_uuid(), 'someone@outside.test');
    raise exception 'FAILED: outside domain was allowed';
  exception when check_violation then null;
  end;
end $$;

insert into app_private.allowed_email_domains (domain) values ('security-test.lazymacro.test');
select pg_temp.new_user('00000000-0000-4000-8000-00000000000a', 'a@security-test.lazymacro.test');
select pg_temp.new_user('00000000-0000-4000-8000-00000000000b', 'b@security-test.lazymacro.test');
select pg_temp.assert(public.is_allowed_signup_email('A@SECURITY-TEST.LAZYMACRO.TEST'), 'domain match ignores case');
select pg_temp.assert(not public.is_allowed_signup_email('a@evil.test'), 'other domain rejected');
select pg_temp.assert(not public.is_allowed_signup_email('a@security-test.lazymacro.test.evil.test'), 'lookalike domain rejected');

-- A changed email address must also stay on an allowed domain.
do $$
begin
  begin
    update auth.users set email_change = 'a@outside.test'
    where id = '00000000-0000-4000-8000-00000000000a';
    raise exception 'FAILED: email change to outside domain was allowed';
  exception when check_violation then null;
  end;
end $$;

insert into public.foods (id, source, source_id, confidence, name, kcal_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g)
values ('00000000-0000-4000-8000-0000000000f0', 'usda', 'security-test', 'verified', 'Securitytestfood, plain', 100, 1, 1, 1);

-- User A saves their setup through the app's function.
select pg_temp.act_as('00000000-0000-4000-8000-00000000000a');
select public.save_my_setup(
  '{"timezone":"UTC","pace_kg_per_week":0,"show_oz":false}',
  '{"kcal":2000,"protein_g":150,"carbs_g":200,"fat_g":60}',
  '[{"term":" Peanuts ","kind":"allergy"}]', array['Salt'], '2026-11-04');
insert into public.meals (id, user_id, eaten_on, meal_type, source, client_id)
values ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-00000000000a', '2026-11-04', 'lunch', 'text', gen_random_uuid());
select pg_temp.assert((select count(*) from public.search_foods('securitytestfood')) = 1, 'search finds food');
select pg_temp.assert((select count(*) from public.search_foods('securitytestfod')) = 1, 'search tolerates a typo');
select pg_temp.assert((select count(*) from public.search_foods('!!!')) = 0, 'search handles symbols only');
select pg_temp.assert((select term from public.user_exclusions) = 'peanuts', 'exclusion normalized');

-- Clients can't change shared foods.
do $$
begin
  begin
    insert into public.foods (source, confidence, name, kcal_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g)
    values ('custom', 'verified', 'Fake', 1, 1, 1, 1);
    raise exception 'FAILED: client inserted a food';
  exception when insufficient_privilege then null;
  end;
end $$;

-- The allowed-domain list isn't reachable by clients.
do $$
begin
  begin
    perform 1 from app_private.allowed_email_domains;
    raise exception 'FAILED: client read the domain list';
  exception when insufficient_privilege then null;
  end;
end $$;

-- User B sees none of A's rows and can't write as A.
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-00000000000b');
select pg_temp.assert((select count(*) from public.profiles) = 0, 'B cannot read A profile');
select pg_temp.assert((select count(*) from public.targets) = 0, 'B cannot read A targets');
select pg_temp.assert((select count(*) from public.meals) = 0, 'B cannot read A meals');
select pg_temp.assert((select count(*) from public.user_exclusions) = 0, 'B cannot read A allergies');
do $$
declare changed integer;
begin
  update public.meals set transcript = 'hacked' where id = '00000000-0000-4000-8000-0000000000e1';
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'FAILED: B updated A meal'; end if;
  begin
    insert into public.meals (user_id, eaten_on, meal_type, source, client_id)
    values ('00000000-0000-4000-8000-00000000000a', '2026-11-04', 'lunch', 'text', gen_random_uuid());
    raise exception 'FAILED: B wrote a meal as A';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.log_entries (meal_id, user_id, food_id, quantity, unit, grams, kcal, protein_g, carbs_g, fat_g, confidence)
    values ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-0000000000f0', 1, 'g', 1, 1, 1, 1, 1, 'verified');
    raise exception 'FAILED: B attached an entry to A meal';
  exception when foreign_key_violation then null;
  end;
end $$;

-- Confirming meals ---------------------------------------------------------
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-00000000000b');
create function pg_temp.confirm(client uuid, grams numeric, corrected boolean default false) returns jsonb language sql as $$
  select public.confirm_meals(jsonb_build_array(jsonb_build_object(
    'client_id', client, 'eaten_on', '2026-11-04', 'meal_type', 'lunch', 'source', 'text', 'transcript', 'x',
    'items', jsonb_build_array(jsonb_build_object(
      'food_id', '00000000-0000-4000-8000-0000000000f0', 'phrase', 'test', 'parsed_food', 'Test', 'quantity', grams, 'unit', 'g', 'grams', grams,
      'corrected', corrected, 'assumptions', '["Assumed"]'::jsonb,
      -- A tampered request: these must be ignored in favor of the food's values.
      'kcal', 1, 'protein_g', 1000, 'confidence', 'verified'
    ))
  )));
$$;
select pg_temp.confirm('00000000-0000-4000-8000-0000000000c1', 250);
select pg_temp.assert((select kcal from public.log_entries) = 250, 'macros come from the food, not the request');
select pg_temp.assert((select protein_g from public.log_entries) = 2.5, 'protein comes from the food, not the request');
select pg_temp.assert((select parsed_food from public.log_entries) = 'test', 'parsed food is lower-cased');

-- Retrying the same confirmation changes nothing.
select pg_temp.confirm('00000000-0000-4000-8000-0000000000c1', 999);
select pg_temp.assert((select count(*) from public.meals) = 1, 'retry does not add a meal');
select pg_temp.assert((select count(*) from public.log_entries) = 1, 'retry does not add an entry');
select pg_temp.assert((select grams from public.log_entries) = 250, 'retry does not change the entry');

-- Two corrections earn an offer to remember, and a retry doesn't count twice.
select pg_temp.assert(jsonb_array_length(pg_temp.confirm('00000000-0000-4000-8000-0000000000c2', 10, true) -> 'remember_offers') = 0, 'first correction: no offer');
select pg_temp.assert(jsonb_array_length(pg_temp.confirm('00000000-0000-4000-8000-0000000000c2', 10, true) -> 'remember_offers') = 0, 'retried correction: no offer');
select pg_temp.assert((select times from public.user_corrections) = 1, 'retried correction counted once');
select pg_temp.assert(jsonb_array_length(pg_temp.confirm('00000000-0000-4000-8000-0000000000c3', 10, true) -> 'remember_offers') = 1, 'second correction: offer');

-- Editing recomputes from the food, and removing the last entry removes the meal.
select public.update_log_entry((select id from public.log_entries where grams = 250), '00000000-0000-4000-8000-0000000000f0', 100, 'g', 100);
select pg_temp.assert((select kcal from public.log_entries where grams = 100) = 100, 'edit recomputes macros');

-- A different person can't confirm into, edit or delete these rows.
reset role;
select pg_temp.new_user('00000000-0000-4000-8000-00000000000c', 'c@security-test.lazymacro.test');
select pg_temp.act_as('00000000-0000-4000-8000-00000000000c');
do $$
declare target uuid;
begin
  reset role;
  select id into target from public.log_entries where grams = 100;
  perform pg_temp.act_as('00000000-0000-4000-8000-00000000000c');
  begin
    perform public.update_log_entry(target, '00000000-0000-4000-8000-0000000000f0', 1, 'g', 1);
    raise exception 'FAILED: another person edited an entry';
  exception when no_data_found then null;
  end;
  perform public.delete_log_entry(target);
  reset role;
  if not exists (select 1 from public.log_entries where id = target) then
    raise exception 'FAILED: another person deleted an entry';
  end if;
end $$;
select pg_temp.act_as('00000000-0000-4000-8000-00000000000c');
select pg_temp.assert((select count(*) from public.log_entries) = 0, 'other people see no entries');
select pg_temp.assert((select count(*) from public.user_corrections) = 0, 'other people see no corrections');

-- save_food keeps each source to its rules.
create function pg_temp.food(source text, confidence text, url text default null, source_id text default null) returns jsonb language sql as $$
  select jsonb_build_object('source', source, 'confidence', confidence, 'source_url', url, 'source_id', source_id, 'name', 'E2E security food ' || source,
    'kcal_per_100g', 100, 'protein_per_100g', 1, 'carbs_per_100g', 1, 'fat_per_100g', 1);
$$;
do $$
begin
  begin perform public.save_food(pg_temp.food('custom', 'verified')); raise exception 'FAILED: verified custom food';
  exception when check_violation then null; end;
  begin perform public.save_food(pg_temp.food('restaurant', 'verified')); raise exception 'FAILED: restaurant food without link';
  exception when check_violation then null; end;
  begin perform public.save_food(pg_temp.food('restaurant', 'rough', 'https://a.test')); raise exception 'FAILED: unverified restaurant food';
  exception when check_violation then null; end;
  begin perform public.save_food(pg_temp.food('restaurant', 'verified', 'http://a.test')); raise exception 'FAILED: restaurant food over http';
  exception when check_violation then null; end;
  begin perform public.save_food(pg_temp.food('usda', 'verified')); raise exception 'FAILED: usda food without id';
  exception when check_violation then null; end;
end $$;
select pg_temp.assert(public.save_food(pg_temp.food('custom', 'rough')) = public.save_food(pg_temp.food('custom', 'rough')), 'same custom food is not added twice');
select pg_temp.assert((select confidence from public.foods where name = 'E2E security food custom') = 'rough', 'a rough food stays rough');

-- Signed-out visitors reach nothing.
reset role;
select set_config('request.jwt.claims', '', true);
set local role anon;
do $$
begin
  begin
    perform 1 from public.foods;
    raise exception 'FAILED: anon read foods';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.search_foods('oats');
    raise exception 'FAILED: anon searched foods';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.delete_my_account();
    raise exception 'FAILED: anon called account deletion';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.confirm_meals('[]');
    raise exception 'FAILED: anon confirmed a meal';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.save_food('{}');
    raise exception 'FAILED: anon saved a food';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Deleting an account removes every personal row.
reset role;
select pg_temp.act_as('00000000-0000-4000-8000-00000000000a');
select public.delete_my_account();
reset role;
select pg_temp.assert((select count(*) from auth.users where id = '00000000-0000-4000-8000-00000000000a') = 0, 'account removed');
select pg_temp.assert((select count(*) from public.profiles where user_id = '00000000-0000-4000-8000-00000000000a') = 0, 'profile removed');
select pg_temp.assert((select count(*) from public.meals where user_id = '00000000-0000-4000-8000-00000000000a') = 0, 'meals removed');

rollback;
select 'all security checks passed' as result;
