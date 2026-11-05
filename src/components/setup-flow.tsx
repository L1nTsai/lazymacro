"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { addTransitionType, startTransition, useActionState, useEffect, useRef, useState, ViewTransition, type FormEvent } from "react";
import { saveSetup } from "@/app/(app)/onboarding/actions";
import { DEFAULT_STAPLES, type StepId } from "@/lib/setup";
import {
  calorieTarget,
  formulaIsValid,
  isBelowCommonMinimum,
  macrosFor,
  MAX_FAT_PERCENT,
  type Activity,
  type FatUnit,
  type Goal,
  type MacroFormula,
  type Sex,
} from "@/lib/targets";
import { cmToFeetInches, feetInchesToCm, kgToLb, lbToKg, paceKgToLb, paceLbToKg } from "@/lib/units";
import { Button, Chevron, Field, FormError, Input, SegmentedControl, Select } from "./ui";

export type SetupDefaults = {
  name: string;
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
  formula: MacroFormula;
  allergies: string[];
  excluded: string[];
  staples: string[];
  showOz: boolean;
};

const TITLES: Record<StepId, string> = {
  about: "About you",
  goal: "Your goal",
  targets: "Daily targets",
  avoid: "Foods to avoid",
  staples: "Pantry staples",
  units: "Units",
};

const ACTIVITY_LABELS: Record<Activity, string> = {
  sedentary: "Mostly sitting",
  light: "Lightly active",
  moderate: "Moderately active",
  very_active: "Very active",
};

const PACES_LB = [0.5, 1, 1.5, 2];
const STEP_MOTION = { "nav-forward": "nav-forward", "nav-back": "nav-back", default: "none" };

const list = (text: string) => text.split(",").map((item) => item.trim()).filter(Boolean);
const toNumber = (text: string) => (text.trim() === "" ? NaN : Number(text));
const inRange = (n: number, min: number, max: number) => Number.isFinite(n) && n >= min && n <= max;

export function SetupFlow({
  defaults,
  steps,
  next,
  direction,
  back,
}: {
  defaults: SetupDefaults;
  steps: StepId[];
  next: string;
  direction: "nav-forward" | "nav-back";
  /** Where the back arrow goes from the first step. Setup itself has none. */
  back?: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(saveSetup, {});
  const [index, setIndex] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);

  const body = defaults.body;
  const currentYear = new Date().getFullYear();
  const height = body ? cmToFeetInches(body.heightCm) : null;

  const [name, setName] = useState(defaults.name);
  const [sex, setSexValue] = useState<Sex>(body?.sex ?? "female");
  const [age, setAgeValue] = useState(body ? String(currentYear - body.birthYear) : "");
  const [feet, setFeetValue] = useState(height ? String(height.feet) : "");
  const [inches, setInchesValue] = useState(height ? String(height.inches) : "");
  const [pounds, setPoundsValue] = useState(body ? String(kgToLb(body.weightKg)) : "");
  const [activity, setActivityValue] = useState<Activity>(body?.activity ?? "light");
  const [goal, setGoalValue] = useState<Goal>(body?.goal ?? "maintain");
  const [paceLb, setPaceValue] = useState(body && body.paceKgPerWeek > 0 ? paceKgToLb(body.paceKgPerWeek) : 1);
  const [allergies, setAllergies] = useState(defaults.allergies.join(", "));
  const [excluded, setExcluded] = useState(defaults.excluded.join(", "));
  const [staples, setStaples] = useState(new Set(defaults.staples));
  const [showOz, setShowOz] = useState(defaults.showOz);
  const [proteinRatio, setProteinRatio] = useState(String(defaults.formula.proteinGPerLb));
  const [fatUnit, setFatUnit] = useState<FatUnit>(defaults.formula.fatUnit);
  const [fatValue, setFatValue] = useState(String(defaults.formula.fatValue));
  // Stay on the saved numbers until something that affects them changes, so
  // saving another step never rewrites someone's targets.
  const [saved, setSaved] = useState(defaults.targets);
  // Calories the person chose, otherwise they're calculated from their details.
  const [chosenKcal, setChosenKcal] = useState(defaults.targets ? String(defaults.targets.kcal) : null);
  // What's in the field while typing, so a low number isn't raised mid-keystroke.
  const [kcalDraft, setKcalDraft] = useState<string | null>(null);

  const recalculate = () => {
    setSaved(null);
    setChosenKcal(null);
    setKcalDraft(null);
  };
  const recalculating = <T,>(set: (value: T) => void) => (value: T) => {
    set(value);
    recalculate();
  };
  const setSex = recalculating(setSexValue);
  const setAge = recalculating(setAgeValue);
  const setFeet = recalculating(setFeetValue);
  const setInches = recalculating(setInchesValue);
  const setPounds = recalculating(setPoundsValue);
  const setActivity = recalculating(setActivityValue);
  const setGoal = recalculating(setGoalValue);
  const setPace = recalculating(setPaceValue);

  const ageNumber = toNumber(age);
  const feetNumber = toNumber(feet);
  const inchesNumber = inches.trim() === "" ? 0 : Number(inches);
  const poundsNumber = toNumber(pounds);
  const aboutValid =
    name.trim() !== "" &&
    Number.isInteger(ageNumber) &&
    inRange(ageNumber, 13, 120) &&
    Number.isInteger(feetNumber) &&
    inRange(feetNumber, 3, 8) &&
    inRange(inchesNumber, 0, 11) &&
    inRange(poundsNumber, 45, 1100);

  const paceKgPerWeek = goal === "maintain" ? 0 : paceLbToKg(paceLb);
  const details = aboutValid
    ? {
        sex,
        heightCm: feetInchesToCm(feetNumber, inchesNumber),
        weightKg: lbToKg(poundsNumber),
        activity,
        goal,
        paceKgPerWeek,
      }
    : null;
  const formula: MacroFormula = { proteinGPerLb: toNumber(proteinRatio), fatUnit, fatValue: toNumber(fatValue) };
  const kcalText = kcalDraft ?? chosenKcal;
  const baseKcal = kcalText !== null ? toNumber(kcalText) : details ? calorieTarget({ ...details, age: ageNumber }) : NaN;
  const calculated = details && Number.isInteger(baseKcal) && formulaIsValid(formula) ? macrosFor(baseKcal, poundsNumber, formula) : null;
  const targets = saved ?? calculated;
  const kcalShown = kcalDraft ?? String(targets?.kcal ?? (Number.isFinite(baseKcal) ? baseKcal : ""));

  const targetsValid =
    targets !== null &&
    Number.isInteger(targets.kcal) &&
    inRange(targets.kcal, 1, 20000) &&
    [targets.proteinG, targets.carbsG, targets.fatG].every((grams) => inRange(grams, 0, 5000));
  const belowMinimum = targetsValid && isBelowCommonMinimum(targets.kcal, sex);
  const raised = saved === null && kcalDraft === null && Boolean(calculated?.raised);
  const savedDiffers =
    saved !== null &&
    calculated !== null &&
    (saved.proteinG !== calculated.proteinG || saved.carbsG !== calculated.carbsG || saved.fatG !== calculated.fatG);

  const changeFatUnit = (unit: FatUnit) => {
    if (unit === fatUnit) return;
    setFatUnit(unit);
    setFatValue(
      !targetsValid
        ? ""
        : unit === "grams"
          ? String(targets.fatG)
          : String(Math.min(MAX_FAT_PERCENT, Math.round((targets.fatG * 9 * 1000) / targets.kcal) / 10)),
    );
    setSaved(null);
  };

  const payload = JSON.stringify({
    name: name.trim(),
    body: details ? { ...details, birthYear: currentYear - ageNumber } : null,
    targets: targets && { kcal: targets.kcal, proteinG: targets.proteinG, carbsG: targets.carbsG, fatG: targets.fatG },
    formula,
    allergies: list(allergies),
    excluded: list(excluded),
    staples: [...staples],
    showOz,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });

  const step = steps[index];
  const isLast = index === steps.length - 1;
  const stepValid = step === "about" ? aboutValid : step === "targets" ? targetsValid : true;

  const move = (to: number, type: "nav-forward" | "nav-back") => {
    (document.activeElement as HTMLElement | null)?.blur();
    moved.current = true;
    startTransition(() => {
      addTransitionType(type);
      setIndex(to);
    });
  };

  // Screen readers announce the new step; the keyboard stays closed until a tap.
  useEffect(() => {
    if (moved.current) heading.current?.focus();
  }, [index]);

  useEffect(() => {
    if (!state.saved) return;
    router.push(next, { transitionTypes: [direction] });
    // On desktop the settings menu stays on screen, and its numbers just changed.
    router.refresh();
  }, [state, router, next, direction]);

  const onSubmit = (event: FormEvent) => {
    if (isLast) return;
    event.preventDefault();
    if (stepValid) move(index + 1, "nav-forward");
  };

  const stapleOptions = [...new Set([...DEFAULT_STAPLES, ...defaults.staples])];

  return (
    <form
      action={formAction}
      onSubmit={onSubmit}
      className="mx-auto flex h-full w-full flex-col bg-background px-4 pt-[max(env(safe-area-inset-top),0.5rem)] pb-[max(env(safe-area-inset-bottom),1rem)] lg:max-w-xl lg:py-6"
    >
      <input type="hidden" name="payload" value={payload} />

      <div className="flex h-11 shrink-0 items-center gap-3">
        <div className="-ml-3 size-11 shrink-0">
          {index > 0 ? (
            <button type="button" aria-label="Back" onClick={() => move(index - 1, "nav-back")} className="flex size-11 items-center justify-center">
              <Chevron direction="left" />
            </button>
          ) : back ? (
            <Link href={back} transitionTypes={["nav-back"]} aria-label="Back" className="flex size-11 items-center justify-center">
              <Chevron direction="left" />
            </Link>
          ) : null}
        </div>
        {steps.length > 1 ? (
          <div
            role="progressbar"
            aria-label="Progress"
            aria-valuemin={1}
            aria-valuemax={steps.length}
            aria-valuenow={index + 1}
            className="h-1.5 flex-1 overflow-hidden rounded-full bg-track"
          >
            <div className="h-full rounded-full" style={{ width: `${((index + 1) / steps.length) * 100}%`, background: "var(--data-calories)" }} />
          </div>
        ) : null}
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <ViewTransition key={step} enter={STEP_MOTION} exit={STEP_MOTION} default="none">
          <div className="h-full bg-background pt-1">
            <h1 ref={heading} tabIndex={-1} className="mb-4 text-2xl font-semibold tracking-tight outline-none">
              {TITLES[step]}
            </h1>

            {step === "about" ? (
              <div className="space-y-3">
                <Field label="Name">
                  <Input value={name} autoComplete="given-name" enterKeyHint="next" onChange={(e) => setName(e.target.value)} />
                </Field>
                <SegmentedControl
                  label="Sex"
                  value={sex}
                  onChange={setSex}
                  options={[
                    { value: "female", label: "Female" },
                    { value: "male", label: "Male" },
                  ]}
                />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Age">
                    <Input inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value)} />
                  </Field>
                  <Field label="Weight (lb)">
                    <Input inputMode="decimal" value={pounds} onChange={(e) => setPounds(e.target.value)} />
                  </Field>
                  <Field label="Height (ft)">
                    <Input inputMode="numeric" value={feet} onChange={(e) => setFeet(e.target.value)} />
                  </Field>
                  <Field label="Height (in)">
                    <Input inputMode="numeric" value={inches} onChange={(e) => setInches(e.target.value)} />
                  </Field>
                </div>
              </div>
            ) : null}

            {step === "goal" ? (
              <div className="space-y-4">
                <Field label="Activity">
                  <Select value={activity} onChange={(e) => setActivity(e.target.value as Activity)}>
                    {Object.entries(ACTIVITY_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </Select>
                </Field>
                <SegmentedControl
                  label="Goal"
                  value={goal}
                  onChange={setGoal}
                  options={[
                    { value: "lose", label: "Lose" },
                    { value: "maintain", label: "Maintain" },
                    { value: "gain", label: "Gain" },
                  ]}
                />
                {goal !== "maintain" ? (
                  <Field label="Pace per week">
                    <Select value={paceLb} onChange={(e) => setPace(Number(e.target.value))}>
                      {PACES_LB.map((pace) => (
                        <option key={pace} value={pace}>{pace} lb</option>
                      ))}
                    </Select>
                  </Field>
                ) : null}
              </div>
            ) : null}

            {step === "targets" ? (
              <div className="space-y-3">
                <Field label="Calories (kcal)">
                  <Input
                    inputMode="numeric"
                    value={kcalShown}
                    onChange={(e) => {
                      setKcalDraft(e.target.value);
                      setSaved(null);
                    }}
                    onBlur={() => {
                      if (kcalDraft === null) return;
                      setChosenKcal(kcalDraft);
                      setKcalDraft(null);
                    }}
                  />
                </Field>
                <div className="space-y-1.5">
                  <div className="grid grid-cols-3 items-start gap-3">
                    <Field label="Protein (g/lb)">
                      <Input
                        inputMode="decimal"
                        value={proteinRatio}
                        onChange={(e) => {
                          setProteinRatio(e.target.value);
                          setSaved(null);
                        }}
                      />
                    </Field>
                    <Field label={fatUnit === "percent" ? "Fat (%)" : "Fat (g)"}>
                      <Input
                        inputMode="decimal"
                        value={fatValue}
                        onChange={(e) => {
                          setFatValue(e.target.value);
                          setSaved(null);
                        }}
                      />
                    </Field>
                    <SegmentedControl
                      label="Fat in"
                      value={fatUnit}
                      onChange={changeFatUnit}
                      options={[
                        { value: "percent", label: "%" },
                        { value: "grams", label: "g" },
                      ]}
                    />
                  </div>
                  {belowMinimum ? null : (
                    <p className="text-sm text-muted">
                      {fatUnit === "percent" ? "Most choose 20–30%." : targetsValid ? `About ${Math.round((targets.fatG * 900) / targets.kcal)}% of calories.` : ""} Carbs fill the rest.
                    </p>
                  )}
                </div>
                <dl className="grid grid-cols-3 gap-3 rounded-md border border-border p-2 text-sm">
                  {[
                    { label: "Protein", grams: targets?.proteinG },
                    { label: "Carbs", grams: targets?.carbsG },
                    { label: "Fat", grams: targets?.fatG },
                  ].map(({ label, grams }) => (
                    <div key={label}>
                      <dt className="text-muted">{label}</dt>
                      <dd className="font-medium tabular-nums">{grams === undefined ? "–" : `${grams} g`}</dd>
                    </div>
                  ))}
                </dl>
                {raised && !belowMinimum ? (
                  <p role="status" className="text-sm text-muted">
                    Calories raised to fit your protein and fat.{goal === "lose" ? " You'll lose weight slower than your chosen pace." : ""}
                  </p>
                ) : null}
                {savedDiffers && !belowMinimum ? <p className="text-sm text-muted">These are your saved targets. Recalculate to use this formula.</p> : null}
                {chosenKcal !== null || saved !== null ? (
                  <button type="button" onClick={recalculate} className="min-h-11 text-sm underline underline-offset-4">
                    Recalculate from my details
                  </button>
                ) : null}
                {belowMinimum ? (
                  <p role="status" className="rounded-md border border-border p-2 text-sm">
                    {raised ? "Calories raised to fit your protein and fat. This is still" : "This is"} below the common daily minimum. Consider talking to a doctor or dietitian first.
                  </p>
                ) : null}
              </div>
            ) : null}

            {step === "avoid" ? (
              <div className="space-y-4">
                <Field label="Allergies" hint="Separate with commas. Meal ideas will never include these.">
                  <Input value={allergies} onChange={(e) => setAllergies(e.target.value)} placeholder="peanuts, shellfish" />
                </Field>
                <Field label="Foods you don't eat" hint="Separate with commas.">
                  <Input value={excluded} onChange={(e) => setExcluded(e.target.value)} placeholder="cilantro" />
                </Field>
              </div>
            ) : null}

            {step === "staples" ? (
              <div className="space-y-3">
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
              </div>
            ) : null}

            {step === "units" ? (
              <label className="flex min-h-11 items-center gap-3 text-sm">
                <input type="checkbox" className="size-5" checked={showOz} onChange={(e) => setShowOz(e.target.checked)} />
                Show ounces alongside grams
              </label>
            ) : null}
          </div>
        </ViewTransition>
      </div>

      <div className="shrink-0 space-y-3 pt-3">
        <FormError message={state.error} />
        <Button type="submit" disabled={pending || !stepValid} className="w-full">
          {isLast ? (back ? "Save" : "Finish") : "Continue"}
        </Button>
      </div>
    </form>
  );
}
