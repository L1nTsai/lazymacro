import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const PROJECTS = ["iphone-safari", "android-chrome", "small-iphone", "desktop"];
/** Real sign-ups need a real domain. No email is sent, and teardown removes them. */
export const SIGNUP_PREFIX = "lazymacro.e2e.signup";
export const TEST_DOMAIN = "e2e.lazymacro.test";
export const TEST_PASSWORD = "e2e-temporary-password";
export const emailFor = (project: string) => `${project}@${TEST_DOMAIN}`;
export const logEmailFor = (project: string) => `log-${project}@${TEST_DOMAIN}`;

/** SQL that creates a confirmed account directly, so the tests never send real email. */
export const newUserSql = (email: string) => `
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
  );`;

/** Runs SQL on the linked project through the Supabase CLI. */
export function runSql(statement: string) {
  const dir = mkdtempSync(join(tmpdir(), "lazymacro-e2e-"));
  try {
    const file = join(dir, "query.sql");
    writeFileSync(file, statement);
    execFileSync("supabase", ["db", "query", "--linked", "-f", file, "-o", "json"], { stdio: "pipe" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export const removeTestData = () =>
  runSql(`
    delete from auth.users where email like '%@${TEST_DOMAIN}' or email like '${SIGNUP_PREFIX}%@gmail.com';
    delete from public.foods where lower(name) like 'e2e %';
    delete from app_private.allowed_email_domains where domain = '${TEST_DOMAIN}';
  `);

/** Reads rows back from the live database as JSON. */
export function queryJson<T>(statement: string): T[] {
  const dir = mkdtempSync(join(tmpdir(), "lazymacro-e2e-"));
  try {
    const file = join(dir, "query.sql");
    writeFileSync(file, statement);
    const output = execFileSync("supabase", ["db", "query", "--linked", "-f", file, "-o", "json"], { stdio: "pipe" }).toString();
    return JSON.parse(output.slice(output.indexOf("{"))).rows as T[];
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
