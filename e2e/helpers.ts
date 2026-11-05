import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const TEST_DOMAIN = "e2e.lazymacro.test";
export const TEST_PASSWORD = "e2e-temporary-password";
export const emailFor = (project: string) => `${project}@${TEST_DOMAIN}`;

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
    delete from auth.users where email like '%@${TEST_DOMAIN}';
    delete from app_private.allowed_email_domains where domain = '${TEST_DOMAIN}';
  `);
