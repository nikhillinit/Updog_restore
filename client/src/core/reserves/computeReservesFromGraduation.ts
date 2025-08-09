export type GraduationStep = {
  graduate: number; // 0–100
  fail: number;     // 0–100
  remain: number;   // 0–100 (row must sum to 100)
  months: number;   // avg months to next round
};

export type FundDataForReserves = {
  totalCommitment: number;
  targetCompanies: number;
  avgCheckSize: number;
  deploymentPacePerYear: number;
  deploymentQuarters?: number;
  graduationRates: {
    seedToA: GraduationStep;
    aToB: GraduationStep;
    bToC: GraduationStep;
  };
  followOnChecks: { A: number; B: number; C: number };
  startQuarter?: number;
  horizonQuarters?: number;
};

export type ReservesResult = {
  valid: boolean;
  errors: string[];
  followOnByQuarter: Record<number, { A: number; B: number; C: number; total: number }>;
  aggregateByStage: { A: number; B: number; C: number; total: number };
  totalReserves: number;
  reserveRatioPct: number;
  assumptions: { perQuarter: number; deploymentQuarters: number };
};

const q = (months: number) => Math.max(1, Math.ceil(months / 3));

export function computeReservesFromGraduation(f: FundDataForReserves): ReservesResult {
  const errors: string[] = [];
  const startQ = f.startQuarter ?? 0;
  const horizon = f.horizonQuarters ?? 40;

  (["seedToA", "aToB", "bToC"] as const).forEach(key => {
    const r = f.graduationRates[key];
    const sum = Math.round((r.graduate + r.fail + r.remain) * 100) / 100;
    if (sum !== 100) errors.push(`${key} must sum to 100% (got ${sum}%)`);
  });

  if (f.followOnChecks.A <= 0 || f.followOnChecks.B <= 0 || f.followOnChecks.C <= 0)
    errors.push("Follow-on checks A/B/C must be > 0");
  if (f.targetCompanies <= 0) errors.push("targetCompanies must be > 0");
  if (f.deploymentPacePerYear <= 0) errors.push("deploymentPacePerYear must be > 0");
  if (f.totalCommitment <= 0) errors.push("totalCommitment must be > 0");

  if (errors.length) {
    return {
      valid: false,
      errors,
      followOnByQuarter: {},
      aggregateByStage: { A: 0, B: 0, C: 0, total: 0 },
      totalReserves: 0,
      reserveRatioPct: 0,
      assumptions: { perQuarter: 0, deploymentQuarters: 0 },
    };
  }

  const perQuarter = Math.max(1, Math.round(f.deploymentPacePerYear / 4));
  const deploymentQuarters =
    f.deploymentQuarters ?? Math.ceil(f.targetCompanies / perQuarter);

  const seedNewCosByQuarter: number[] = Array(horizon).fill(0);
  let companiesRemaining = f.targetCompanies;
  for (let i = 0; i < deploymentQuarters && companiesRemaining > 0; i++) {
    const take = Math.min(perQuarter, companiesRemaining);
    seedNewCosByQuarter[startQ + i] += take;
    companiesRemaining -= take;
  }

  const AByQuarter: number[] = Array(horizon).fill(0);
  const BByQuarter: number[] = Array(horizon).fill(0);
  const CByQuarter: number[] = Array(horizon).fill(0);

  const tA = q(f.graduationRates.seedToA.months);
  const tB = q(f.graduationRates.aToB.months);
  const tC = q(f.graduationRates.bToC.months);

  for (let quarter = 0; quarter < horizon; quarter++) {
    const grads = seedNewCosByQuarter[quarter] * (f.graduationRates.seedToA.graduate / 100);
    const when = quarter + tA;
    if (when < horizon) AByQuarter[when] += grads;
  }

  for (let quarter = 0; quarter < horizon; quarter++) {
    const grads = AByQuarter[quarter] * (f.graduationRates.aToB.graduate / 100);
    const when = quarter + tB;
    if (when < horizon) BByQuarter[when] += grads;
  }

  for (let quarter = 0; quarter < horizon; quarter++) {
    const grads = BByQuarter[quarter] * (f.graduationRates.bToC.graduate / 100);
    const when = quarter + tC;
    if (when < horizon) CByQuarter[when] += grads;
  }

  const followOnByQuarter: Record<number, { A: number; B: number; C: number; total: number }> = {};
  let sumA = 0, sumB = 0, sumC = 0;

  for (let quarter = 0; quarter < horizon; quarter++) {
    const A$ = Math.round(AByQuarter[quarter] * f.followOnChecks.A);
    const B$ = Math.round(BByQuarter[quarter] * f.followOnChecks.B);
    const C$ = Math.round(CByQuarter[quarter] * f.followOnChecks.C);
    const total = A$ + B$ + C$;
    if (total > 0) followOnByQuarter[quarter] = { A: A$, B: B$, C: C$, total };
    sumA += A$; sumB += B$; sumC += C$;
  }

  const totalReserves = sumA + sumB + sumC;
  const reserveRatioPct = +(100 * totalReserves / f.totalCommitment).toFixed(2);

  return {
    valid: true,
    errors: [],
    followOnByQuarter,
    aggregateByStage: { A: sumA, B: sumB, C: sumC, total: totalReserves },
    totalReserves,
    reserveRatioPct,
    assumptions: { perQuarter, deploymentQuarters },
  };
}
