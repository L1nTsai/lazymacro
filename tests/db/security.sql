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
