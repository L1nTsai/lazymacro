import { PROJECTS, TEST_DOMAIN, TEST_PASSWORD, emailFor, removeTestData, runSql } from "./helpers";

/** Creates confirmed accounts directly, so the tests never send real email. */
export default function globalSetup() {
  removeTestData();
  const users = PROJECTS
    .map(
      (project) => `
      insert into auth.users (
        id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
        confirmation_token, recovery_token, email_change, email_change_token_new,
        email_change_token_current, reauthentication_token, phone_change, phone_change_token,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at
      ) values (
        gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        '${emailFor(project)}', extensions.crypt('${TEST_PASSWORD}', extensions.gen_salt('bf')), now(),
        '', '', '', '', '', '', '', '',
        '{"provider":"email","providers":["email"]}', '{}', now(), now()
      );`,
    )
    .join("\n");
  runSql(`insert into app_private.allowed_email_domains (domain) values ('${TEST_DOMAIN}');\n${users}`);
}
