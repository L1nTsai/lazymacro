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
