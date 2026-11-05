"use client";

import { Field, Input, Select, TrustBadge } from "@/components/ui";
import { macrosFor, normalizeUnit, toGrams } from "@/lib/logging/amounts";
import type { DraftFood } from "@/lib/logging/types";

const STANDARD_UNITS = ["g", "oz", "lb", "ml", "cup", "tbsp", "tsp"];

export function unitsFor(food: DraftFood, current: string): string[] {
  return [...new Set([normalizeUnit(current), ...STANDARD_UNITS, ...food.portions.map((p) => p.label)])];
}

/** Grams for an amount, keeping a known grams-per-unit such as a chain's serving. */
export function recalculate(food: DraftFood, quantity: number, unit: string, fixedGramsPerUnit: number | null) {
  return toGrams(quantity, unit, food, fixedGramsPerUnit);
}

export function AmountEditor({
  food,
  quantityText,
  unit,
  grams,
  onQuantity,
  onUnit,
}: {
  food: DraftFood;
  quantityText: string;
  unit: string;
  grams: number | null;
  onQuantity: (text: string) => void;
  onUnit: (unit: string) => void;
}) {
  const macros = grams ? macrosFor(food, grams) : null;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount">
          <Input inputMode="decimal" value={quantityText} onChange={(e) => onQuantity(e.target.value)} />
        </Field>
        <Field label="Unit">
          <Select value={normalizeUnit(unit)} onChange={(e) => onUnit(e.target.value)}>
            {unitsFor(food, unit).map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </Select>
        </Field>
      </div>
      {macros && grams ? (
        <dl className="grid grid-cols-4 gap-2 rounded-md border border-border p-3 text-center text-sm tabular-nums">
          <div><dt className="text-muted">kcal</dt><dd className="font-medium">{Math.round(macros.kcal)}</dd></div>
          <div><dt className="text-muted">Protein</dt><dd className="font-medium">{macros.protein} g</dd></div>
          <div><dt className="text-muted">Carbs</dt><dd className="font-medium">{macros.carbs} g</dd></div>
          <div><dt className="text-muted">Fat</dt><dd className="font-medium">{macros.fat} g</dd></div>
        </dl>
      ) : null}
      <div className="flex items-center gap-2 text-sm text-muted">
        <TrustBadge confidence={food.trust} />
        {grams ? <span className="tabular-nums">{grams} g</span> : null}
        {food.sourceUrl ? (
          <a href={food.sourceUrl} target="_blank" rel="noreferrer noopener" className="underline underline-offset-4">Source</a>
        ) : null}
      </div>
    </div>
  );
}
