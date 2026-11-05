export type Portion = { label: string; grams: number };

const ML_PER_UNIT: Record<string, number> = {
  cup: 236.588,
  tbsp: 14.787,
  tsp: 4.929,
  "fl oz": 29.574,
  ml: 1,
};

const UNIT_ALIASES: Record<string, string> = {
  tablespoon: "tbsp",
  teaspoon: "tsp",
  "fluid ounce": "fl oz",
  "fl oz": "fl oz",
  milliliter: "ml",
  millilitre: "ml",
};

/** Prefers measured energy, then USDA's specific factors, then its general ones. */
export function pickEnergy(
  kcal: number | undefined,
  atwaterSpecific: number | undefined,
  atwaterGeneral: number | undefined,
): number | undefined {
  return kcal ?? atwaterSpecific ?? atwaterGeneral;
}

/** Turns a USDA portion row into a label and the grams for one of that portion. */
export function normalizePortion(row: {
  amount: number;
  gramWeight: number;
  unit: string;
  description: string;
  modifier: string;
}): Portion | null {
  const amount = row.amount > 0 ? row.amount : 1;
  if (!(row.gramWeight > 0)) return null;

  const unit = row.unit.trim().toLowerCase();
  const parts = [unit === "undetermined" ? "" : unit, row.modifier.trim().toLowerCase()].filter(Boolean);
  const raw = (parts.join(", ") || row.description.trim().toLowerCase())
    .replace(/^\d+(\.\d+)?\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!raw || raw === "quantity not specified") return null;

  const label = UNIT_ALIASES[raw] ?? raw;
  return { label, grams: Math.round((row.gramWeight / amount) * 100) / 100 };
}

/**
 * Density comes only from a plain volume portion. "cup, chopped" describes
 * loose pieces, so it would give a misleading figure.
 */
export function densityFromPortion(portion: Portion): number | null {
  const ml = ML_PER_UNIT[portion.label];
  if (!ml) return null;
  return Math.round((portion.grams / ml) * 1000) / 1000;
}
