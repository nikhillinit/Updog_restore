import { Decimal } from '../../../../../shared/lib/decimal-config';
import {
  INTERNAL_ECONOMICS_COMPOSITE_V2_1_VERSION,
  INTERNAL_ECONOMICS_COMPOSITE_V2_VERSION,
} from '../../../../../shared/contracts/internal-economics/internal-economics-input-v2.contract';
import { createHash } from 'node:crypto';

interface LegacyPartner {
  id: string;
  type: 'lp' | 'gp';
  lpClassId?: string;
  committedCapital?: string;
  gpCommitment?: string;
  gpDeemedContribution?: string;
}

interface LegacyEvent {
  eventId: string;
  instant: string;
  kind: string;
  amountUsd: string;
  partnerId?: string;
  purpose?: string;
  dealId?: string;
  securityId?: string;
  recyclingTag?: string;
}

interface LegacyInput {
  contractVersion: string;
  currency: string;
  fundEstablishmentDate: string;
  investmentPeriodEndDate: string;
  fundTermDate: string;
  calculationDate: string;
  cutoverInstant: string;
  roundingMode: string;
  selectedLane: string;
  gpCashPreferredReturnTreatment: string;
  partners: LegacyPartner[];
  waterfallPolicy: Record<string, unknown>[];
  events: LegacyEvent[];
}

function money(n: number | string | Decimal): string {
  return new Decimal(n).toFixed(6);
}

function ensureDatetime(d: string): string {
  if (d.includes('T')) return d;
  return `${d}T00:00:00.000Z`;
}

function adaptPartner(p: LegacyPartner) {
  const isGp = p.type === 'gp';
  const committed = isGp ? (p.gpCommitment ?? '0.000000') : (p.committedCapital ?? '0.000000');

  const result: Record<string, unknown> = {
    partnerId: p.id,
    name: `Partner ${p.id}`,
    isGp,
    committedCapital: money(committed),
    settledCash: money(0),
    remainingCallableCommitment: money(committed),
  };
  if (p.lpClassId) result.lpClassId = p.lpClassId;
  if (p.gpDeemedContribution !== undefined)
    result.gpDeemedContribution = money(p.gpDeemedContribution);
  return result;
}

function adaptEvent(event: LegacyEvent, events: LegacyEvent[]) {
  const base: Record<string, unknown> = {
    eventId: event.eventId,
    instant: ensureDatetime(event.instant),
    amountUsd: event.amountUsd,
    kind: event.kind,
  };

  if (event.kind === 'settled_contribution') {
    base.partnerId = event.partnerId;
    base.purpose = event.purpose ?? 'deployment';
    base.settlementSourceRef = `legacy:${event.eventId}`;
  } else if (event.kind === 'deployment') {
    const contribution = events.find((candidate) => candidate.kind === 'settled_contribution');
    base.dealId = event.dealId;
    base.securityId = event.securityId ?? `sec:${event.dealId}`;
    base.cashSourceAllocations = [
      { lotId: `csl:${contribution?.eventId ?? event.eventId}`, amount: event.amountUsd },
    ];
  } else if (event.kind === 'realization') {
    const deployment = events.find(
      (candidate) => candidate.kind === 'deployment' && candidate.dealId === event.dealId
    );
    const securityId = deployment?.securityId ?? `sec:${event.dealId}`;
    base.dealId = event.dealId;
    base.recyclingTag = event.recyclingTag ?? 'none';
    base.reliefRows = [
      {
        investmentLotId: `inv:${event.dealId}:${securityId}:${deployment?.eventId ?? event.eventId}`,
        relievedCostBasis: deployment?.amountUsd ?? event.amountUsd,
        allocatedProceeds: event.amountUsd,
      },
    ];
  }

  return base;
}

function synthesizeLpClasses(partners: LegacyPartner[]) {
  const classIds = new Set<string>();
  for (const p of partners) {
    if (p.type === 'lp' && p.lpClassId) classIds.add(p.lpClassId);
  }
  if (classIds.size === 0) return [];
  return Array.from(classIds).map((id) => ({
    lpClassId: id,
    feeProfile: {
      managementFeeSchedule: [],
      feeRecyclingEnabled: false,
      exitRecyclingEnabled: false,
    },
  }));
}

function synthesizeOpeningState(adaptedPartners: Record<string, unknown>[]) {
  const totalCommitments = adaptedPartners.reduce(
    (sum, p) => sum.plus(new Decimal(p['committedCapital'] as string)),
    new Decimal(0)
  );

  const investorLedgers = adaptedPartners.map((p) => ({
    partnerId: p['partnerId'] as string,
    committedCapital: p['committedCapital'] as string,
    calledCapital: money(0),
    settledCapital: money(0),
    paidInCapital: money(0),
    unreturnedSettledCashCapital: money(0),
    cumulativeDistributions: money(0),
    cumulativeFees: money(0),
    accruedPreference: money(0),
  }));

  return {
    openingCash: money(0),
    openingCashClassification: {
      paidIn: money(0),
      recycling: money(0),
      unclassified: money(0),
    },
    openingProvenance: {
      cashLots: [],
      investmentLots: [],
      entitlementPools: [],
    },
    openingCommitments: money(totalCommitments),
    investorLedgers: investorLedgers.length > 0 ? investorLedgers : undefined,
    accruedPreferenceTotal: money(0),
    cumulativeDistributionsTotal: money(0),
    cumulativeFeesTotal: money(0),
    consumedFeeRecyclingCapacity: money(0),
    consumedExitRecyclingCapacity: money(0),
    profitDecomposition: {
      openingCumulativePreferredPaid: money(0),
      openingCumulativeGpProfitDistributions: money(0),
      openingCumulativeLpProfitDistributions: money(0),
    },
  };
}

export function adaptLegacyCase(legacy: LegacyInput): Record<string, unknown> {
  const shouldUpgradeVersion = legacy.contractVersion === INTERNAL_ECONOMICS_COMPOSITE_V2_VERSION;
  const adaptedPartners = legacy.partners.map(adaptPartner);

  return {
    contractVersion: shouldUpgradeVersion
      ? INTERNAL_ECONOMICS_COMPOSITE_V2_1_VERSION
      : legacy.contractVersion,
    currency: legacy.currency,
    calculationDate: ensureDatetime(legacy.calculationDate),
    cutoverInstant: ensureDatetime(legacy.cutoverInstant),
    roundingMode: legacy.roundingMode,
    fundEstablishmentDate: ensureDatetime(legacy.fundEstablishmentDate),
    investmentPeriodEndDate: ensureDatetime(legacy.investmentPeriodEndDate),
    fundTermDate:
      ensureDatetime(legacy.investmentPeriodEndDate) > ensureDatetime(legacy.fundTermDate)
        ? ensureDatetime(legacy.investmentPeriodEndDate)
        : ensureDatetime(legacy.fundTermDate),
    lpClasses: synthesizeLpClasses(legacy.partners),
    partners: adaptedPartners,
    waterfallPolicy: legacy.waterfallPolicy,
    selectedLane: legacy.selectedLane,
    gpCashPreferredReturnTreatment: legacy.gpCashPreferredReturnTreatment,
    openingState: synthesizeOpeningState(adaptedPartners),
    events: legacy.events.map((event) => adaptEvent(event, legacy.events)),
  };
}

function canonicalizeSorted(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(canonicalizeSorted);
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    const child = (value as Record<string, unknown>)[key];
    if (child !== undefined) result[key] = canonicalizeSorted(child);
  }
  return result;
}

export function computeStrictWireDigest(adaptedCases: unknown[]): string {
  const canonical = canonicalizeSorted(adaptedCases);
  return createHash('sha256').update(JSON.stringify(canonical), 'utf-8').digest('hex');
}
