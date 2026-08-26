import { Decimal } from '../../../lib/decimal-config';

export interface MonthlyPeriod {
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly monthIndex: number;
  readonly isStub: boolean;
}

export interface PreferredReturnConfig {
  readonly annualRate: Decimal;
  readonly rateMode: 'simple' | 'effective_annual_compounded';
}

export interface PartnerAccrualState {
  readonly partnerId: string;
  readonly isGp: boolean;
  readonly unreturnedSettledCashCapital: Decimal;
  readonly accruedPreference: Decimal;
}

export interface PartnerAccrualEntry {
  readonly partnerId: string;
  readonly openingBase: Decimal;
  readonly periodAccrual: Decimal;
  readonly closingAccrued: Decimal;
}

export interface MonthlyAccrualPosting {
  readonly period: MonthlyPeriod;
  readonly entries: readonly PartnerAccrualEntry[];
  readonly totalAccrual: Decimal;
}

function monthStart(year: number, month: number): string {
  const m = String(month).padStart(2, '0');
  return `${year}-${m}-01T00:00:00Z`;
}

function monthEnd(year: number, month: number): string {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const m = String(month).padStart(2, '0');
  const d = String(lastDay).padStart(2, '0');
  return `${year}-${m}-${d}T23:59:59Z`;
}

export function buildMonthlySchedule(
  fundEstablishmentDate: string,
  calculationDate: string
): readonly MonthlyPeriod[] {
  const estDate = new Date(fundEstablishmentDate);
  const calcDate = new Date(calculationDate);

  const estYear = estDate.getUTCFullYear();
  const estMonth = estDate.getUTCMonth() + 1;
  const calcYear = calcDate.getUTCFullYear();
  const calcMonth = calcDate.getUTCMonth() + 1;

  const periods: MonthlyPeriod[] = [];
  let monthIndex = 0;

  let year = estYear;
  let month = estMonth;

  while (year < calcYear || (year === calcYear && month <= calcMonth)) {
    const isFirstMonth = year === estYear && month === estMonth;
    const isLastMonth = year === calcYear && month === calcMonth;

    const start = isFirstMonth ? fundEstablishmentDate : monthStart(year, month);

    let end: string;
    if (isLastMonth) {
      end = calculationDate;
    } else {
      end = monthEnd(year, month);
    }

    const isStub =
      (isFirstMonth && estDate.getUTCDate() !== 1) ||
      (isLastMonth && calcDate.getTime() !== new Date(monthEnd(calcYear, calcMonth)).getTime());

    periods.push({ periodStart: start, periodEnd: end, monthIndex, isStub });
    monthIndex++;

    month++;
    if (month > 12) {
      month = 1;
      year++;
    }
  }

  return periods;
}

export function computePeriodAccrual(
  unreturnedBase: Decimal,
  priorAccrued: Decimal,
  config: PreferredReturnConfig
): Decimal {
  if (unreturnedBase.lte(0)) {
    return new Decimal(0);
  }

  if (config.rateMode === 'simple') {
    return unreturnedBase.mul(config.annualRate).div(12);
  }

  const monthlyRate = config.annualRate.plus(1).pow(new Decimal(1).div(12)).minus(1);
  const compoundBase = unreturnedBase.plus(priorAccrued);
  return compoundBase.mul(monthlyRate);
}

export function computeAccrualPostingsForSchedule(
  schedule: readonly MonthlyPeriod[],
  config: PreferredReturnConfig,
  partnerStates: readonly PartnerAccrualState[],
  gpTreatment: 'pari_passu' | 'excluded'
): readonly MonthlyAccrualPosting[] {
  const postings: MonthlyAccrualPosting[] = [];

  const runningAccrued = new Map<string, Decimal>();
  for (const ps of partnerStates) {
    runningAccrued.set(ps.partnerId, ps.accruedPreference);
  }

  for (const period of schedule) {
    const entries: PartnerAccrualEntry[] = [];
    let totalAccrual = new Decimal(0);

    for (const ps of partnerStates) {
      if (ps.isGp && gpTreatment === 'excluded') {
        entries.push({
          partnerId: ps.partnerId,
          openingBase: ps.unreturnedSettledCashCapital,
          periodAccrual: new Decimal(0),
          closingAccrued: runningAccrued.get(ps.partnerId)!,
        });
        continue;
      }

      const priorAccrued = runningAccrued.get(ps.partnerId)!;
      const accrual = computePeriodAccrual(ps.unreturnedSettledCashCapital, priorAccrued, config);

      const closingAccrued = priorAccrued.plus(accrual);
      runningAccrued.set(ps.partnerId, closingAccrued);

      entries.push({
        partnerId: ps.partnerId,
        openingBase: ps.unreturnedSettledCashCapital,
        periodAccrual: accrual,
        closingAccrued,
      });

      totalAccrual = totalAccrual.plus(accrual);
    }

    postings.push({ period, entries, totalAccrual });
  }

  return postings;
}

export function isPostable(period: MonthlyPeriod, distributionInstant: string): boolean {
  return period.periodEnd <= distributionInstant;
}

export function computeEpochMonth(fundEstablishmentDate: string, targetDate: string): number {
  const est = new Date(fundEstablishmentDate);
  const target = new Date(targetDate);
  return (
    (target.getUTCFullYear() - est.getUTCFullYear()) * 12 +
    (target.getUTCMonth() - est.getUTCMonth())
  );
}
