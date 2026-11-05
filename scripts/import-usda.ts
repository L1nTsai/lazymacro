/**
 * Loads USDA FoodData Central generic foods into the linked Supabase project.
 *
 *   pnpm import:usda <foundation.json> <sr-legacy-csv-dir>
 *
 * Foundation Foods uses the JSON release because its CSV release omits the
 * food and nutrient files. SR Legacy is frozen and only published usefully as CSV.
 *
 * Safe to re-run: rows are upserted on (source, source_id).
 */
import { execFileSync } from "node:child_process";
import { createReadStream, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "csv-parse";
import { densityFromPortion, normalizePortion, pickEnergy, type Portion } from "../src/lib/usda";

const FOOD_TYPES = new Set(["foundation_food", "sr_legacy_food"]);
const NUTRIENTS = { kcal: "1008", atwaterSpecific: "2048", atwaterGeneral: "2047", protein: "1003", fat: "1004", carbs: "1005" };
const WANTED = new Set(Object.values(NUTRIENTS));
const BATCH_SIZE = 400;

type Row = Record<string, string>;
async function* rows(path: string): AsyncGenerator<Row> {
  yield* createReadStream(path).pipe(parse({ columns: true, bom: true, relax_column_count: true })) as AsyncIterable<Row>;
}

type Food = { id: string; name: string; nutrients: Map<string, number>; portions: Portion[] };

async function readDataset(dir: string, foods: Map<string, Food>) {
  const units = new Map<string, string>();
  for await (const r of rows(join(dir, "measure_unit.csv"))) units.set(r.id, r.name);

  for await (const r of rows(join(dir, "food.csv"))) {
    if (FOOD_TYPES.has(r.data_type)) {
      foods.set(r.fdc_id, { id: r.fdc_id, name: r.description.trim(), nutrients: new Map(), portions: [] });
    }
  }
  for await (const r of rows(join(dir, "food_nutrient.csv"))) {
    const food = foods.get(r.fdc_id);
    const amount = Number(r.amount);
    if (food && WANTED.has(r.nutrient_id) && r.amount !== "" && Number.isFinite(amount)) {
      food.nutrients.set(r.nutrient_id, amount);
    }
  }
  for await (const r of rows(join(dir, "food_portion.csv"))) {
    const food = foods.get(r.fdc_id);
    if (!food) continue;
    const portion = normalizePortion({
      amount: Number(r.amount),
      gramWeight: Number(r.gram_weight),
      unit: units.get(r.measure_unit_id) ?? "",
      description: r.portion_description ?? "",
      modifier: r.modifier ?? "",
    });
    if (portion) food.portions.push(portion);
  }
}

type JsonFood = {
  fdcId: number;
  description: string;
  foodNutrients: { amount?: number; nutrient: { id: number } }[];
  foodPortions?: {
    amount?: number;
    gramWeight?: number;
    modifier?: string;
    portionDescription?: string;
    measureUnit?: { name?: string };
  }[];
};

function readFoundationJson(path: string, foods: Map<string, Food>) {
  const { FoundationFoods } = JSON.parse(readFileSync(path, "utf8")) as { FoundationFoods: JsonFood[] };
  for (const f of FoundationFoods) {
    const food: Food = { id: String(f.fdcId), name: f.description.trim(), nutrients: new Map(), portions: [] };
    for (const n of f.foodNutrients) {
      const id = String(n.nutrient.id);
      if (WANTED.has(id) && typeof n.amount === "number") food.nutrients.set(id, n.amount);
    }
    for (const p of f.foodPortions ?? []) {
      const portion = normalizePortion({
        amount: p.amount ?? 1,
        gramWeight: p.gramWeight ?? 0,
        unit: p.measureUnit?.name ?? "",
        description: p.portionDescription ?? "",
        modifier: p.modifier ?? "",
      });
      if (portion) food.portions.push(portion);
    }
    foods.set(food.id, food);
  }
}

const sql = (value: string | number | null) =>
  value === null ? "null" : typeof value === "number" ? String(value) : `'${value.replace(/'/g, "''")}'`;

const clamp100 = (n: number) => Math.min(Math.max(n, 0), 100);

function runSql(statement: string, workDir: string) {
  const file = join(workDir, "batch.sql");
  writeFileSync(file, statement);
  execFileSync("supabase", ["db", "query", "--linked", "-f", file, "-o", "json"], { stdio: ["ignore", "pipe", "pipe"], maxBuffer: 1 << 26 });
}

async function main() {
  const sources = process.argv.slice(2);
  if (sources.length === 0) throw new Error("Pass a Foundation Foods JSON file and/or a directory of USDA CSV files.");

  const foods = new Map<string, Food>();
  for (const source of sources) {
    if (source.endsWith(".json")) readFoundationJson(source, foods);
    else await readDataset(source, foods);
  }

  const skipped: string[] = [];
  const ready: { food: Food; kcal: number; protein: number; carbs: number; fat: number; density: number | null; portions: Portion[] }[] = [];
  for (const food of foods.values()) {
    const n = food.nutrients;
    const protein = n.get(NUTRIENTS.protein);
    const fat = n.get(NUTRIENTS.fat);
    const carbs = n.get(NUTRIENTS.carbs);
    const kcal = pickEnergy(n.get(NUTRIENTS.kcal), n.get(NUTRIENTS.atwaterSpecific), n.get(NUTRIENTS.atwaterGeneral));
    // Never invent a missing value: a food without all four numbers is left out.
    if (kcal === undefined || protein === undefined || fat === undefined || carbs === undefined) {
      skipped.push(food.name);
      continue;
    }
    const portions = [...new Map(food.portions.map((p) => [p.label, p])).values()];
    const density = portions.map(densityFromPortion).find((d) => d !== null) ?? null;
    ready.push({ food, kcal, protein: clamp100(protein), carbs: clamp100(carbs), fat: clamp100(fat), density, portions });
  }

  const workDir = mkdtempSync(join(tmpdir(), "lazymacro-usda-"));
  try {
    for (let i = 0; i < ready.length; i += BATCH_SIZE) {
      const batch = ready.slice(i, i + BATCH_SIZE);
      const foodValues = batch
        .map((f) =>
          `('usda', ${sql(f.food.id)}, ${sql(`https://fdc.nal.usda.gov/food-details/${f.food.id}/nutrients`)}, 'verified', ${sql(f.food.name)}, ${f.kcal}, ${f.protein}, ${f.carbs}, ${f.fat}, ${sql(f.density)})`)
        .join(",\n");
      const portionValues = batch
        .flatMap((f) => f.portions.map((p) => `(${sql(f.food.id)}, ${sql(p.label)}, ${p.grams})`))
        .join(",\n");
      runSql(
        `begin;
insert into public.foods (source, source_id, source_url, confidence, name, kcal_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, density_g_per_ml)
values ${foodValues}
on conflict (source, source_id) do update set
  source_url = excluded.source_url, name = excluded.name,
  kcal_per_100g = excluded.kcal_per_100g, protein_per_100g = excluded.protein_per_100g,
  carbs_per_100g = excluded.carbs_per_100g, fat_per_100g = excluded.fat_per_100g,
  density_g_per_ml = excluded.density_g_per_ml, updated_at = now();
${portionValues ? `insert into public.food_portions (food_id, label, grams)
select f.id, v.label, v.grams
from (values ${portionValues}) as v(source_id, label, grams)
join public.foods f on f.source = 'usda' and f.source_id = v.source_id
on conflict (food_id, label) do update set grams = excluded.grams;` : ""}
commit;`,
        workDir,
      );
      console.log(`Imported ${Math.min(i + BATCH_SIZE, ready.length)} of ${ready.length}`);
    }
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
  console.log(`Done. Imported ${ready.length} foods; skipped ${skipped.length} with incomplete nutrition.`);
  if (skipped.length) console.log("Skipped examples:", skipped.slice(0, 5));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
