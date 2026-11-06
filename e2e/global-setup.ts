import { PROJECTS, TEST_DOMAIN, emailFor, logEmailFor, newUserSql, removeTestData, runSql } from "./helpers";

export default function globalSetup() {
  removeTestData();
  const users = PROJECTS.flatMap((project) => [emailFor(project), logEmailFor(project)])
    .map(newUserSql)
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
  runSql(`insert into app_private.allowed_email_domains (domain) values ('${TEST_DOMAIN}');\n${users}\nupdate public.signup_approvals set approved = true where email like '%@${TEST_DOMAIN}';\n${profiles}`);
}
