 
 
 
 
 

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
  // v1.1: Remain pass configuration
  remainAttempts?: number; // Default 0 (disabled), 1 = one extra attempt
  remainDelayQuarters?: number; // Default 2 quarters delay before retry
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
  
  // v1.1: Remain pass configuration
  const remainAttempts = f.remainAttempts ?? 0;
  const remainDelayQuarters = f.remainDelayQuarters ?? 2;

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
    const idx = startQ + i;
    const currentValue = seedNewCosByQuarter.at(idx) ?? 0;
    seedNewCosByQuarter[idx] = currentValue + take;
    companiesRemaining -= take;
  }

  const AByQuarter: number[] = Array(horizon).fill(0);
  const BByQuarter: number[] = Array(horizon).fill(0);
  const CByQuarter: number[] = Array(horizon).fill(0);

  // v1.1: Track remain companies for retry attempts
  const seedRemainByQuarter: number[] = Array(horizon).fill(0);
  const ARemainByQuarter: number[] = Array(horizon).fill(0);
  const BRemainByQuarter: number[] = Array(horizon).fill(0);

  const tA = q(f.graduationRates.seedToA.months);
  const tB = q(f.graduationRates.aToB.months);
  const tC = q(f.graduationRates.bToC.months);

  // First pass: Standard graduation + track remain companies
  for (let quarter = 0; quarter < horizon; quarter++) {
    const totalSeed = seedNewCosByQuarter.at(quarter) ?? 0;
    const grads = totalSeed * (f.graduationRates.seedToA.graduate / 100);
    const remains = totalSeed * (f.graduationRates.seedToA.remain / 100);

    const when = quarter + tA;
    if (when < horizon) {
      const currentA = AByQuarter.at(when) ?? 0;
      AByQuarter[when] = currentA + grads;
      if (remainAttempts > 0) {
        const remainIdx = when + remainDelayQuarters;
        const currentRemain = seedRemainByQuarter.at(remainIdx) ?? 0;
        seedRemainByQuarter[remainIdx] = currentRemain + remains;
      }
    }
  }

  for (let quarter = 0; quarter < horizon; quarter++) {
    const totalA = AByQuarter.at(quarter) ?? 0;
    const grads = totalA * (f.graduationRates.aToB.graduate / 100);
    const remains = totalA * (f.graduationRates.aToB.remain / 100);

    const when = quarter + tB;
    if (when < horizon) {
      const currentB = BByQuarter.at(when) ?? 0;
      BByQuarter[when] = currentB + grads;
      if (remainAttempts > 0) {
        const remainIdx = when + remainDelayQuarters;
        const currentRemain = ARemainByQuarter.at(remainIdx) ?? 0;
        ARemainByQuarter[remainIdx] = currentRemain + remains;
      }
    }
  }

  for (let quarter = 0; quarter < horizon; quarter++) {
    const totalB = BByQuarter.at(quarter) ?? 0;
    const grads = totalB * (f.graduationRates.bToC.graduate / 100);
    const remains = totalB * (f.graduationRates.bToC.remain / 100);

    const when = quarter + tC;
    if (when < horizon) {
      const currentC = CByQuarter.at(when) ?? 0;
      CByQuarter[when] = currentC + grads;
      if (remainAttempts > 0) {
        const remainIdx = when + remainDelayQuarters;
        const currentRemain = BRemainByQuarter.at(remainIdx) ?? 0;
        BRemainByQuarter[remainIdx] = currentRemain + remains;
      }
    }
  }

  // v1.1: Second pass - Remain attempts with reduced success rates
  if (remainAttempts > 0) {
    const remainSuccessRate = 0.6; // 60% success rate for remain attempts (more realistic)

    for (let quarter = 0; quarter < horizon; quarter++) {
      const seedRemain = seedRemainByQuarter.at(quarter) ?? 0;
      if (seedRemain > 0) {
        const remainGrads = seedRemain * (f.graduationRates.seedToA.graduate / 100) * remainSuccessRate;
        const when = quarter + tA;
        if (when < horizon) {
          const currentA = AByQuarter.at(when) ?? 0;
          AByQuarter[when] = currentA + remainGrads;
        }
      }

      const aRemain = ARemainByQuarter.at(quarter) ?? 0;
      if (aRemain > 0) {
        const remainGrads = aRemain * (f.graduationRates.aToB.graduate / 100) * remainSuccessRate;
        const when = quarter + tB;
        if (when < horizon) {
          const currentB = BByQuarter.at(when) ?? 0;
          BByQuarter[when] = currentB + remainGrads;
        }
      }

      const bRemain = BRemainByQuarter.at(quarter) ?? 0;
      if (bRemain > 0) {
        const remainGrads = bRemain * (f.graduationRates.bToC.graduate / 100) * remainSuccessRate;
        const when = quarter + tC;
        if (when < horizon) {
          const currentC = CByQuarter.at(when) ?? 0;
          CByQuarter[when] = currentC + remainGrads;
        }
      }
    }
  }

  const followOnByQuarter: Record<number, { A: number; B: number; C: number; total: number }> = {};
  let sumA = 0, sumB = 0, sumC = 0;

  for (let quarter = 0; quarter < horizon; quarter++) {
    const aCount = AByQuarter.at(quarter) ?? 0;
    const bCount = BByQuarter.at(quarter) ?? 0;
    const cCount = CByQuarter.at(quarter) ?? 0;
    const A$ = Math.round(aCount * f.followOnChecks.A);
    const B$ = Math.round(bCount * f.followOnChecks.B);
    const C$ = Math.round(cCount * f.followOnChecks.C);
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

