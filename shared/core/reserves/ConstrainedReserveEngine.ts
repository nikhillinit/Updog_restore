import { ReserveInput } from '../../schemas.js';
import { toCents, fromCents, addCents, conservationCheck, type Cents } from '../../money.js';

export class ConstrainedReserveEngine {
  calculate(input: ReserveInput) {
    const { availableReserves, companies, stagePolicies, constraints: cst = {} } = input;

    const minCheckC = toCents(cst.minCheck ?? 0);
    const disc = cst.discountRateAnnual ?? 0.12;

    const stageMax = new Map<string, Cents>();
    Object.entries(cst.maxPerStage ?? {}).forEach(([stage, max]) => {
      stageMax['set'](stage, toCents(max));
    });

    const stageAllocated = new Map<string, Cents>();
    const polByStage = new Map(input.stagePolicies.map(p=>[p.stage, p]));
    const years = (s:string)=> (cst.graduationYears as any)?.[s] ?? 5;
    const pExit = (s:string)=> (cst.graduationProb as any)?.[s] ?? 0.5;

    const comps = input.companies.map(c=>{
      const pol = polByStage['get'](c.stage);
      if (!pol) throw Object.assign(new Error(`No policy for ${c.stage}`), { status: 400 });
      const capCompanyC = Number.isFinite(cst.maxPerCompany) ? toCents(cst.maxPerCompany as number) : BigInt(Number.MAX_SAFE_INTEGER);
      const capStageC = stageMax['get'](c.stage) ?? null;

      // Fix: Improved present value calculation with proper discount factor validation
    const yearsToExit = years(c.stage);
    const exitProb = pExit(c.stage);
    const discountFactor = Math.pow(1 + disc, yearsToExit);

    // Validate discount factor to prevent division by zero or invalid calculations
    if (discountFactor <= 0 || !Number.isFinite(discountFactor)) {
      throw Object.assign(
        new Error(`Invalid discount calculation for stage ${c.stage}: discount=${disc}, years=${yearsToExit}`),
        { status: 400 }
      );
    }

    // Present value calculation with proper formula
    const pv = (pol.reserveMultiple * exitProb) / discountFactor;
      return {
        id: c.id, name: c.name, stage: c.stage,
        investedC: toCents(c.invested),
        capCompanyC, capStageC,
        score: pv * pol.weight,
        allocatedC: 0n as Cents,
      };
    });

    comps.sort((a,b)=>{
      const d = b.score - a.score;
      if (d !== 0) return d > 0 ? 1 : -1;
      return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
    });

    let remainingC = toCents(input.availableReserves);

    // Pass 1
    for (const c of comps) {
      if (remainingC <= 0n) break;
      const stAlloc = stageAllocated['get'](c.stage) ?? 0n;
      const stRoom = c.capStageC != null ? (c.capStageC - stAlloc > 0n ? c.capStageC - stAlloc : 0n) : remainingC;
      let roomC = remainingC < stRoom ? remainingC : stRoom;
      roomC = roomC < c.capCompanyC ? roomC : c.capCompanyC;
      if (roomC <= 0n) continue;
      if (minCheckC > 0n && roomC < minCheckC) continue;

      c.allocatedC += roomC;
      remainingC -= roomC;
      stageAllocated['set'](c.stage, stAlloc + roomC);
    }

    const totalAllocatedC = comps.reduce((s,c)=> addCents(s,c.allocatedC), 0n);
    const ok = conservationCheck([toCents(availableReserves)], [totalAllocatedC, remainingC]);

    return {
      allocations: comps.filter(c=>c.allocatedC>0n).map(c=>({
        id: c.id,
        name: c.name,
        stage: c.stage,
        allocated: fromCents(c.allocatedC),
      })),
      totalAllocated: fromCents(totalAllocatedC),
      remaining: fromCents(remainingC),
      conservationOk: ok,
    };
  }
}