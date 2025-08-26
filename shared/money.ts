export type Cents = bigint;

export const toCents = (n: number): Cents => {
  if (!Number.isFinite(n)) throw new Error(`bad dollars: ${n}`);
  return BigInt(Math.round(n * 100));
};

export const fromCents = (c: Cents): number => Number(c) / 100;

export const addCents = (a: Cents, b: Cents): Cents => a + b;
export const subCents = (a: Cents, b: Cents): Cents => a - b;
export const minCents = (a: Cents, b: Cents): Cents => a < b ? a : b;
export const maxCents = (a: Cents, b: Cents): Cents => a > b ? a : b;

export function conservationCheck(inputs: Cents[], outputs: Cents[]): boolean {
  const totalIn = inputs.reduce(addCents, 0n);
  const totalOut = outputs.reduce(addCents, 0n);
  return totalIn === totalOut;
}