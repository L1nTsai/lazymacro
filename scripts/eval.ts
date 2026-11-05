/**
 * Scores parsing and food matching against evals/meals.ts.
 *
 *   pnpm eval:check   Checks every expected pattern exists in the database. Free.
 *   pnpm eval         Runs the real AI. Needs ANTHROPIC_API_KEY, and costs real
 *                     money: roughly 2 Claude Haiku calls per case, a few cents a run.
 *
 * Searches the live food table but saves nothing, and uses no personal data.
 * The plan's target is at least 85% of items right without edits.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CASES } from "../evals/meals";
import { buildDish, estimateFood, lookupRestaurant, parseMealText, pickFoods } from "../src/lib/ai/claude";
import { scoreCase } from "../src/lib/logging/eval-score";
import { resolveMeals, type ResolveDeps } from "../src/lib/logging/resolve";
import type { DraftFood } from "../src/lib/logging/types";

const TARGET = 0.85;
const CONCURRENCY = 4;
const today = "2026-11-05";
const lunchtime = 12;

function sql<T>(statement: string): T[] {
  const dir = mkdtempSync(join(tmpdir(), "lazymacro-eval-"));
  try {
    const file = join(dir, "query.sql");
    writeFileSync(file, statement);
    const output = execFileSync("supabase", ["db", "query", "--linked", "-f", file, "-o", "json"], { stdio: "pipe", maxBuffer: 1 << 26 }).toString();
    return JSON.parse(output.slice(output.indexOf("{"))).rows as T[];
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const quote = (text: string) => `'${text.replace(/'/g, "''")}'`;

function checkPatterns() {
  const patterns = [...new Set(CASES.flatMap((c) => c.items.map(([pattern]) => pattern)))];
  const rows = sql<{ pattern: string; n: number }>(
    `select p.pattern, (select count(*)::int from public.foods f where f.name ~* p.pattern) as n
     from unnest(array[${patterns.map(quote).join(",")}]) as p(pattern)`,
  );
  const missing = rows.filter((row) => row.n === 0);
  console.log(`${CASES.length} cases, ${patterns.length} patterns, ${missing.length} match no food.`);
  for (const row of missing) console.log(`  no match: ${row.pattern}`);
  process.exit(missing.length ? 1 : 0);
}

const cache = new Map<string, DraftFood[]>();

function candidates(query: string): DraftFood[] {
  const cached = cache.get(query);
  if (cached) return cached;
  const rows = sql<Record<string, never> & { food: DraftFood }>(`
    select jsonb_build_object(
      'id', f.id, 'name', f.name, 'brand', f.brand, 'trust', f.confidence, 'sourceUrl', f.source_url,
      'kcal', f.kcal_per_100g, 'protein', f.protein_per_100g, 'carbs', f.carbs_per_100g, 'fat', f.fat_per_100g,
      'densityGPerMl', f.density_g_per_ml, 'newFood', null,
      'portions', coalesce((select jsonb_agg(jsonb_build_object('label', p.label, 'grams', p.grams)) from public.food_portions p where p.food_id = f.id), '[]'::jsonb)
    ) as food
    from public.search_foods(${quote(query)}, 40) s join public.foods f on f.id = s.id where f.source = 'usda'`);
  const foods = rows.map((row) => row.food);
  cache.set(query, foods);
  return foods;
}

// A fresh person: no aliases, history or saved foods to lean on.
const deps: ResolveDeps = {
  alias: async () => null,
  lastChoice: async () => null,
  savedFoods: async () => [],
  usdaCandidates: async (query) => candidates(query),
  brandedFoods: async () => [],
  pickFoods,
  lookupRestaurant,
  buildDish,
  estimateFood,
};

async function main() {
  if (process.argv.includes("--check")) return checkPatterns();
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Set ANTHROPIC_API_KEY in .env.local first. `pnpm eval:check` runs without it.");
    process.exit(1);
  }

  let correct = 0;
  let total = 0;
  let extras = 0;
  let mealSplitsRight = 0;
  let failedCases = 0;
  const durations: number[] = [];
  const failures: string[] = [];
  let next = 0;

  const worker = async () => {
    while (next < CASES.length) {
      const testCase = CASES[next++];
      const started = performance.now();
      try {
        const parsed = await parseMealText(testCase.say, { localTime: "Thursday, November 5, 2026 at 12:30 PM", savedPhrases: [], recentFoods: [] });
        const { meals } = await resolveMeals(parsed, { today, hour: lunchtime, source: "text", transcript: testCase.say }, deps);
        durations.push(performance.now() - started);
        const score = scoreCase(testCase.items, meals, testCase.meals ?? 1);
        correct += score.correct;
        total += score.total;
        extras += score.extras;
        if (score.mealsRight) mealSplitsRight++;
        if (score.misses.length) failures.push(`"${testCase.say}"\n    ${score.misses.join("\n    ")}`);
      } catch (error) {
        failedCases++;
        total += testCase.items.length;
        failures.push(`"${testCase.say}"\n    failed: ${error instanceof Error ? error.message : "unknown"}`);
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  durations.sort((a, b) => a - b);
  const accuracy = total ? correct / total : 0;
  for (const failure of failures) console.log(failure);
  console.log(`\nFirst-try accuracy: ${(accuracy * 100).toFixed(1)}% (${correct} of ${total} items). Target: ${TARGET * 100}%.`);
  console.log(`Invented items: ${extras}. Right number of meals: ${mealSplitsRight} of ${CASES.length}. Cases that errored: ${failedCases}.`);
  if (durations.length) console.log(`Median time, parse and match only: ${(durations[Math.floor(durations.length / 2)] / 1000).toFixed(1)} s. Database lookups here go through the CLI, so the app is faster.`);
  process.exit(accuracy >= TARGET ? 0 : 1);
}

void main();
