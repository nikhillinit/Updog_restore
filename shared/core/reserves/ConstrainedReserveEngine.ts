import type { ReserveInput } from '../../schemas.js';
import {
  addCents,
  conservationCheck,
  fromCents,
  maxCents,
  minCents,
  toCents,
  type Cents,
} from '../../money.js';

type StageConstraintMap = Record<string, number>;

type RankedCompany = {
  id: string;
  name: string;
  stage: string;
  capCompanyC: Cents;
  capStageC: Cents | null;
  score: number;
  allocatedC: Cents;
};

const MAX_COMPANY_CAP_CENTS = BigInt(Number.MAX_SAFE_INTEGER) as Cents;

function getStageConstraintValue(
  values: StageConstraintMap | undefined,
  stage: string,
  fallback: number
): number {
  return values?.[stage] ?? fallback;
}

export class ConstrainedReserveEngine {
  calculate(input: ReserveInput) {
    const cst = input.constraints ?? {};

    const minCheckC = toCents(cst.minCheck ?? 0);
    const disc = cst.discountRateAnnual ?? 0.12;

    const stageMax = new Map<string, Cents>();
    Object.entries(cst.maxPerStage ?? {}).forEach(([stage, max]) => {
      stageMax.set(stage, toCents(max));
    });

    const stageAllocated = new Map<string, Cents>();
    const polByStage = new Map(input.stagePolicies.map((policy) => [policy.stage, policy] as const));
    const graduationYears = cst.graduationYears as StageConstraintMap | undefined;
    const graduationProb = cst.graduationProb as StageConstraintMap | undefined;

    const comps: RankedCompany[] = input.companies.map((company) => {
      const policy = polByStage.get(company.stage);
      if (!policy) {
        throw Object.assign(new Error(`No policy for ${company.stage}`), { status: 400 });
      }

      const maxPerCompany = cst.maxPerCompany;
      const capCompanyC = typeof maxPerCompany === 'number' && Number.isFinite(maxPerCompany)
        ? toCents(maxPerCompany)
        : MAX_COMPANY_CAP_CENTS;
      const capStageC = stageMax.get(company.stage) ?? null;
      const yearsToExit = getStageConstraintValue(graduationYears, company.stage, 5);
      const exitProb = getStageConstraintValue(graduationProb, company.stage, 0.5);
      const discountFactor = Math.pow(1 + disc, yearsToExit);

      if (!Number.isFinite(discountFactor) || discountFactor <= 0) {
        throw Object.assign(
          new Error(
            `Invalid discount calculation for stage ${company.stage}: discount=${disc}, years=${yearsToExit}`
          ),
          { status: 400 }
        );
      }

      const pv = (policy.reserveMultiple * exitProb) / discountFactor;
      return {
        id: company.id,
        name: company.name,
        stage: company.stage,
        capCompanyC,
        capStageC,
        score: pv * policy.weight,
        allocatedC: 0n as Cents,
      };
    });

    comps.sort((a, b) => {
      const d = b.score - a.score;
      if (d !== 0) {
        return d > 0 ? 1 : -1;
      }

      return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
    });

    let remainingC = toCents(input.availableReserves);

    // Pass 1
    for (const company of comps) {
      if (remainingC <= 0n) {
        break;
      }

      const stAlloc = stageAllocated.get(company.stage) ?? 0n;
      const stRoom =
        company.capStageC === null ? remainingC : maxCents(company.capStageC - stAlloc, 0n);
      let roomC = minCents(remainingC, stRoom);
      roomC = minCents(roomC, company.capCompanyC);

      if (roomC <= 0n) {
        continue;
      }

      if (minCheckC > 0n && roomC < minCheckC) {
        continue;
      }

      company.allocatedC += roomC;
      remainingC -= roomC;
      stageAllocated.set(company.stage, stAlloc + roomC);
    }

    const totalAllocatedC = comps.reduce(
      (sum, company) => addCents(sum, company.allocatedC),
      0n as Cents
    );
    const ok = conservationCheck([toCents(input.availableReserves)], [totalAllocatedC, remainingC]);

    return {
      allocations: comps
        .filter((company) => company.allocatedC > 0n)
        .map((company) => ({
          id: company.id,
          name: company.name,
          stage: company.stage,
          allocated: fromCents(company.allocatedC),
        })),
      totalAllocated: fromCents(totalAllocatedC),
      remaining: fromCents(remainingC),
      conservationOk: ok,
    };
  }
}
