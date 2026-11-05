import { PROJECTS, TEST_DOMAIN, TEST_PASSWORD, emailFor, logEmailFor, removeTestData, runSql } from "./helpers";

/** Creates confirmed accounts directly, so the tests never send real email. */
export default function globalSetup() {
  removeTestData();
  const users = PROJECTS.flatMap((project) => [emailFor(project), logEmailFor(project)])
    .map(
      (email) => `
      insert into auth.users (
        id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
        confirmation_token, recovery_token, email_change, email_change_token_new,
        email_change_token_current, reauthentication_token, phone_change, phone_change_token,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at
      ) values (
        gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        '${email}', extensions.crypt('${TEST_PASSWORD}', extensions.gen_salt('bf')), now(),
        '', '', '', '', '', '', '', '',
        '{"provider":"email","providers":["email"]}', '{}', now(), now()
      );`,
    )
    .join("\n");
  // Logging tests start from a finished setup: 2,000 kcal, in UTC.
  const profiles = PROJECTS.map(logEmailFor)
    .map(
      (email) => `
      with u as (select id from auth.users where email = '${email}'),
      p as (
        insert into public.profiles (user_id, display_name, sex, birth_year, height_cm, weight_kg, activity, goal, pace_kg_per_week, timezone)
        select id, 'Logger', 'female', 1990, 165, 60, 'light', 'maintain', 0, 'UTC' from u returning user_id
      )
      insert into public.targets (user_id, effective_from, kcal, protein_g, carbs_g, fat_g)
      select user_id, current_date - 30, 2000, 100, 250, 60 from p;`,
    )
    .join("\n");
  runSql(`insert into app_private.allowed_email_domains (domain) values ('${TEST_DOMAIN}');\n${users}\n${profiles}`);
}
