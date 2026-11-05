const CM_PER_INCH = 2.54;
const KG_PER_LB = 0.45359237;

const oneDecimal = (n: number) => Math.round(n * 10) / 10;

export const feetInchesToCm = (feet: number, inches: number) => oneDecimal((feet * 12 + inches) * CM_PER_INCH);

export function cmToFeetInches(cm: number): { feet: number; inches: number } {
  const total = Math.round(cm / CM_PER_INCH);
  return { feet: Math.floor(total / 12), inches: total % 12 };
}

export const lbToKg = (lb: number) => oneDecimal(lb * KG_PER_LB);
export const kgToLb = (kg: number) => Math.round(kg / KG_PER_LB);

/** Weekly pace choices. The database stores kilograms, to two decimals. */
export const paceLbToKg = (lb: number) => Math.round(lb * KG_PER_LB * 100) / 100;
export const paceKgToLb = (kg: number) => Math.round((kg / KG_PER_LB) * 2) / 2;
