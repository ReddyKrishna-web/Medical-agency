/** Round money to 2 decimals without accumulating float drift. */
export const round2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

/** Multiply then round (used for tax and line totals). */
export const money = (value: number, rate: number): number => round2(value * rate);

export const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0);

export const toMinorUnits = (value: number): number => Math.round(value * 100);

export const isPositiveInt = (value: number): boolean => Number.isInteger(value) && value > 0;

export const isNonNegativeInt = (value: number): boolean => Number.isInteger(value) && value >= 0;

export const clampInt = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);
