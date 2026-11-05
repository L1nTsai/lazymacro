"use client";

import { useActionState, useMemo, useState } from "react";
import { saveSetup } from "@/app/onboarding/actions";
import { DEFAULT_STAPLES } from "@/lib/setup";
import { calculateTargets, isBelowCommonMinimum, type Activity, type Goal, type Sex } from "@/lib/targets";
import { Button, Field, FormError, Input, Select } from "./ui";

export type SetupDefaults = {
  body: {
    sex: Sex;
    birthYear: number;
    heightCm: number;
    weightKg: number;
    activity: Activity;
    goal: Goal;
    paceKgPerWeek: number;
  } | null;
  targets: { kcal: number; proteinG: number; carbsG: number; fatG: number } | null;
  allergies: string[];
  excluded: string[];
  staples: string[];
  showOz: boolean;
};

const ACTIVITY_LABELS: Record<Activity, string> = {
  sedentary: "Mostly sitting",
  light: "Lightly active",
  moderate: "Moderately active",
  very_active: "Very active",
};

const PACES = [0.25, 0.5, 0.75];
const list = (text: string) => text.split(",").map((item) => item.trim()).filter(Boolean);
const toNumber = (text: string) => (text.trim() === "" ? NaN : Number(text));

export function SetupForm({ defaults, next, submitLabel }: { defaults: SetupDefaults; next: "/" | "/me"; submitLabel: string }) {
  const [state, formAction, pending] = useActionState(saveSetup, {});
  const body = defaults.body;
  const currentYear = new Date().getFullYear();

  const [mode, setMode] = useState<"calculate" | "manual">(defaults.targets && !body ? "manual" : "calculate");
  const [sex, setSex] = useState<Sex>(body?.sex ?? "female");
  const [birthYear, setBirthYear] = useState(body ? String(body.birthYear) : "");
  const [heightCm, setHeightCm] = useState(body ? String(body.heightCm) : "");
  const [weightKg, setWeightKg] = useState(body ? String(body.weightKg) : "");
  const [activity, setActivity] = useState<Activity>(body?.activity ?? "light");
  const [goal, setGoal] = useState<Goal>(body?.goal ?? "maintain");
  const [pace, setPace] = useState(body && body.paceKgPerWeek > 0 ? body.paceKgPerWeek : 0.5);
  const [allergies, setAllergies] = useState(defaults.allergies.join(", "));
  const [excluded, setExcluded] = useState(defaults.excluded.join(", "));
  const [staples, setStaples] = useState(new Set(defaults.staples));
  const [showOz, setShowOz] = useState(defaults.showOz);
  // Numbers the person typed over; these win until they ask to recalculate.
  const [typed, setTyped] = useState<Record<string, string> | null>(
    defaults.targets
      ? {
          kcal: String(defaults.targets.kcal),
          proteinG: String(defaults.targets.proteinG),
          carbsG: String(defaults.targets.carbsG),
          fatG: String(defaults.targets.fatG),
        }
      : null,
  );

  const paceKgPerWeek = goal === "maintain" ? 0 : pace;
  const bodyValid =
    Number(birthYear) >= 1900 && Number(birthYear) <= currentYear && Number(heightCm) >= 50 && Number(heightCm) <= 300 && Number(weightKg) >= 20 && Number(weightKg) <= 500;

  const calculated = useMemo(
    () =>
      bodyValid
        ? calculateTargets({ sex, age: currentYear - Number(birthYear), heightCm: Number(heightCm), weightKg: Number(weightKg), activity, goal, paceKgPerWeek })
        : null,
    [bodyValid, sex, currentYear, birthYear, heightCm, weightKg, activity, goal, paceKgPerWeek],
  );

  const shown = (key: "kcal" | "proteinG" | "carbsG" | "fatG") =>
    typed?.[key] ?? (mode === "calculate" && calculated ? String(calculated[key]) : "");
  const edit = (key: string, value: string) =>
    setTyped({ kcal: shown("kcal"), proteinG: shown("proteinG"), carbsG: shown("carbsG"), fatG: shown("fatG"), [key]: value });

  const targets = {
    kcal: toNumber(shown("kcal")),
    proteinG: toNumber(shown("proteinG")),
    carbsG: toNumber(shown("carbsG")),
    fatG: toNumber(shown("fatG")),
  };
  const targetsValid = Object.values(targets).every((n) => Number.isFinite(n) && n >= 0) && Number.isInteger(targets.kcal) && targets.kcal > 0;
  const lowTarget = targetsValid && isBelowCommonMinimum(targets.kcal, mode === "calculate" ? sex : null);

  const payload = JSON.stringify({
    body:
      mode === "calculate" && bodyValid
        ? { sex, birthYear: Number(birthYear), heightCm: Number(heightCm), weightKg: Number(weightKg), activity, goal, paceKgPerWeek }
        : null,
    targets,
    allergies: list(allergies),
    excluded: list(excluded),
    staples: [...staples],
    showOz,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });

  const canSubmit = targetsValid && (mode === "manual" || bodyValid);
  const stapleOptions = [...new Set([...DEFAULT_STAPLES, ...defaults.staples])];

  return (
    <form action={formAction} className="space-y-8 pb-6">
      <input type="hidden" name="payload" value={payload} />
      <input type="hidden" name="next" value={next} />

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Your targets</h2>
        <div role="radiogroup" aria-label="How to set targets" className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border">
          {(["calculate", "manual"] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={mode === option}
              onClick={() => setMode(option)}
              className={`min-h-11 text-sm font-medium ${mode === option ? "bg-foreground text-background" : "bg-background text-muted"}`}
            >
              {option === "calculate" ? "Calculate for me" : "Set my own"}
            </button>
          ))}
        </div>

        {mode === "calculate" ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Sex">
                <Select value={sex} onChange={(e) => setSex(e.target.value as Sex)}>
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                </Select>
              </Field>
              <Field label="Birth year">
                <Input inputMode="numeric" value={birthYear} onChange={(e) => setBirthYear(e.target.value)} placeholder="1990" />
              </Field>
              <Field label="Height (cm)">
                <Input inputMode="decimal" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} />
              </Field>
              <Field label="Weight (kg)">
                <Input inputMode="decimal" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} />
              </Field>
            </div>
            <Field label="Activity">
              <Select value={activity} onChange={(e) => setActivity(e.target.value as Activity)}>
                {Object.entries(ACTIVITY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Goal">
                <Select value={goal} onChange={(e) => setGoal(e.target.value as Goal)}>
                  <option value="lose">Lose weight</option>
                  <option value="maintain">Maintain</option>
                  <option value="gain">Gain weight</option>
                </Select>
              </Field>
              {goal !== "maintain" ? (
                <Field label="Pace per week">
                  <Select value={pace} onChange={(e) => setPace(Number(e.target.value))}>
                    {PACES.map((p) => (
                      <option key={p} value={p}>{p} kg</option>
                    ))}
                  </Select>
                </Field>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Calories (kcal)">
            <Input inputMode="numeric" value={shown("kcal")} onChange={(e) => edit("kcal", e.target.value)} />
          </Field>
          <Field label="Protein (g)">
            <Input inputMode="decimal" value={shown("proteinG")} onChange={(e) => edit("proteinG", e.target.value)} />
          </Field>
          <Field label="Carbs (g)">
            <Input inputMode="decimal" value={shown("carbsG")} onChange={(e) => edit("carbsG", e.target.value)} />
          </Field>
          <Field label="Fat (g)">
            <Input inputMode="decimal" value={shown("fatG")} onChange={(e) => edit("fatG", e.target.value)} />
          </Field>
        </div>
        {mode === "calculate" && typed && calculated ? (
          <button type="button" onClick={() => setTyped(null)} className="min-h-11 text-sm underline underline-offset-4">
            Recalculate from my details
          </button>
        ) : null}
        {lowTarget ? (
          <p role="status" className="rounded-md border border-border p-3 text-sm">
            This is below the common daily minimum. Consider talking to a doctor or dietitian before following it.
          </p>
        ) : null}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Foods to avoid</h2>
        <Field label="Allergies" hint="Separate with commas. Meal ideas will never include these.">
          <Input value={allergies} onChange={(e) => setAllergies(e.target.value)} placeholder="peanuts, shellfish" />
        </Field>
        <Field label="Foods you don't eat" hint="Separate with commas.">
          <Input value={excluded} onChange={(e) => setExcluded(e.target.value)} placeholder="cilantro" />
        </Field>
      </section>

      <fieldset className="space-y-3">
        <legend className="text-lg font-semibold">Pantry staples</legend>
        <p className="text-sm text-muted">Meal ideas assume you always have these.</p>
        <div className="flex flex-wrap gap-2">
          {stapleOptions.map((staple) => {
            const on = staples.has(staple);
            return (
              <button
                key={staple}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  const updated = new Set(staples);
                  if (on) updated.delete(staple);
                  else updated.add(staple);
                  setStaples(updated);
                }}
                className={`min-h-11 rounded-md border px-3 text-sm ${on ? "border-foreground bg-foreground text-background" : "border-border text-foreground"}`}
              >
                {staple}
              </button>
            );
          })}
        </div>
      </fieldset>

      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input type="checkbox" className="size-5" checked={showOz} onChange={(e) => setShowOz(e.target.checked)} />
        Show ounces alongside grams
      </label>

      <FormError message={state.error} />
      <Button type="submit" disabled={pending || !canSubmit} className="w-full">
        {submitLabel}
      </Button>
    </form>
  );
}
