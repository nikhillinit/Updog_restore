import type {
  V2CoreRefusal,
  NormalizedInternalEconomicsInputV2,
  V2Event,
  V2TierKind,
  V2WaterfallLane,
  V2RefusalCode,
  V2Stage,
} from '../../../contracts/internal-economics/internal-economics-input-v2.contract';
import type {
  InternalEconomicsReceiptV2Result,
  V2DualLaneCertificationResult,
  TierAllocationV2,
} from '../../../contracts/internal-economics/internal-economics-receipt-v2.contract';
import { verifyAndNormalizeInternalEconomicsInputV2 } from './normalize-input-v2';
import {
  cloneEventStreamState,
  initializeEventStreamState,
  processCallableCommitment,
  sortEventsIntoChronology,
  processSettledContribution,
  processDeployment,
  processRealization,
  processFundExpense,
  type EventStreamState,
} from './event-stream-engine-v2';
import {
  runDealByDealWaterfall,
  toTierAllocationsV2 as dealToTier,
} from './waterfall-deal-by-deal-v2';
import {
  runWholeFundWaterfall,
  toTierAllocationsV2 as wholeToTier,
} from './waterfall-whole-fund-v2';
import { buildReceipt } from './liquidity-receipt-builder-v2';
import { Decimal } from '../../decimal-config';

export const INTERNAL_ECONOMICS_COMPOSITE_IMPLEMENTATION_VERSION =
  'internal-economics-composite/2.3.0' as const;

function admissionRefusal(code: V2RefusalCode, stage: V2Stage, message: string): V2CoreRefusal {
  return { ok: false, code, stage, message };
}

export function checkEventCapabilityRefusalForEvent(event: V2Event): V2CoreRefusal | null {
  if (event.kind === 'contribution_correction')
    return admissionRefusal(
      'UNSUPPORTED_V2_CONTRIBUTION_CORRECTION',
      'admission',
      `Event ${event.eventId}: contribution correction is not yet supported.`
    );
  if (event.kind === 'write_off')
    return admissionRefusal(
      'UNSUPPORTED_V2_WRITE_OFF',
      'admission',
      `Event ${event.eventId}: write-off is not yet supported.`
    );
  if (event.kind === 'conversion')
    return admissionRefusal(
      'UNSUPPORTED_V2_CONVERSION',
      'admission',
      `Event ${event.eventId}: conversion is not yet supported.`
    );

  return null;
}

export function checkEventCapabilityRefusal(
  input: NormalizedInternalEconomicsInputV2
): V2CoreRefusal | null {
  for (const event of input.events) {
    const refusal = checkEventCapabilityRefusalForEvent(event);
    if (refusal) return refusal;
  }

  return null;
}

function checkManagementFeeRefusal(
  input: NormalizedInternalEconomicsInputV2
): V2CoreRefusal | null {
  if (
    input.lpClasses.some((lpClass) =>
      lpClass.feeProfile.managementFeeSchedule.some(
        (entry) => !new Decimal(entry.rate.rate).isZero()
      )
    )
  )
    return admissionRefusal(
      'UNSUPPORTED_V2_MANAGEMENT_FEE',
      'accrual',
      'Management fee accrual is not yet supported.'
    );

  return null;
}

function isExactF2AdmissionEnvelope(input: NormalizedInternalEconomicsInputV2): boolean {
  const firstTier = input.waterfallPolicy[0];

  return (
    input.selectedLane === 'deal_by_deal' &&
    input.events.length === 0 &&
    input.gpCashPreferredReturnTreatment === 'pari_passu' &&
    input.lpClasses.every(
      ({ feeProfile }) =>
        feeProfile.managementFeeSchedule.length === 0 &&
        feeProfile.feeRecyclingEnabled === false &&
        feeProfile.feeRecyclingCapUsd === undefined &&
        feeProfile.exitRecyclingEnabled === false &&
        feeProfile.exitRecyclingCapUsd === undefined
    ) &&
    input.waterfallPolicy.length === 1 &&
    firstTier?.kind === 'carry' &&
    firstTier.priority === 1 &&
    new Decimal(input.openingState.openingCashClassification.recycling).isZero() &&
    new Decimal(input.openingState.openingCashClassification.unclassified).isZero() &&
    input.openingState.openingProvenance.cashLots.every(
      (lot) => lot.classification === 'paid_in'
    ) &&
    (input.sourceRefs?.length ?? 0) === 0 &&
    (input.upstreamReceiptIds?.length ?? 0) === 0
  );
}

function checkAdmissionGuard(input: NormalizedInternalEconomicsInputV2): V2CoreRefusal | null {
  const managementFeeRefusal = checkManagementFeeRefusal(input);
  if (managementFeeRefusal) return managementFeeRefusal;

  const eventCapabilityRefusal = checkEventCapabilityRefusal(input);
  if (eventCapabilityRefusal) return eventCapabilityRefusal;

  if (isExactF2AdmissionEnvelope(input)) return null;

  return admissionRefusal(
    'UNSUPPORTED_V2_BASE_EVENT',
    'admission',
    'Public derivation is not yet enabled for strict 2.0.1 inputs.'
  );
}

export type ProcessEventsV2ForTestResult =
  | { readonly ok: false; readonly refusal: V2CoreRefusal }
  | { readonly ok: true; readonly state: EventStreamState };

export interface TierPartnerAllocation {
  readonly lane: V2WaterfallLane;
  readonly tierKind: V2TierKind;
  readonly tierOrdinal: number;
  readonly partnerId: string;
  readonly amountUsd: string;
}

function buildTierPartnerAllocations(
  lane: V2WaterfallLane,
  tierAllocations: readonly {
    readonly kind: V2TierKind;
    readonly priority: number;
    readonly perPartner: ReadonlyMap<string, Decimal>;
  }[]
): TierPartnerAllocation[] {
  const result: TierPartnerAllocation[] = [];

  for (const tier of tierAllocations) {
    const perPartner = Array.from(tier.perPartner.entries()).sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0
    );
    for (const [partnerId, amount] of perPartner) {
      if (amount.lte(0)) continue;
      result.push({
        lane,
        tierKind: tier.kind,
        tierOrdinal: tier.priority,
        partnerId,
        amountUsd: amount.toFixed(6),
      });
    }
  }

  return result;
}

export function processEventsV2ForTest(
  input: NormalizedInternalEconomicsInputV2,
  state: EventStreamState
): ProcessEventsV2ForTestResult {
  const stagedState = cloneEventStreamState(state);
  const chronology = sortEventsIntoChronology(input.events);

  for (const entry of chronology) {
    if (!entry.event) continue;
    const event = entry.event;

    const capabilityRefusal = checkEventCapabilityRefusalForEvent(event);
    if (capabilityRefusal) return { ok: false, refusal: capabilityRefusal };

    const callableRefusal = processCallableCommitment(event, stagedState.callableTrackers);
    if (callableRefusal) return { ok: false, refusal: callableRefusal };

    switch (event.kind) {
      case 'settled_contribution':
        {
          const refusal = processSettledContribution(event, stagedState);
          if (refusal) return { ok: false, refusal };
        }
        break;
      case 'deployment':
        {
          const refusal = processDeployment(event, stagedState);
          if (refusal) return { ok: false, refusal };
        }
        break;
      case 'realization':
        {
          const refusal = processRealization(event, stagedState);
          if (refusal) return { ok: false, refusal };
        }
        break;
      case 'fund_expense_payment':
        {
          const refusal = processFundExpense(event, stagedState);
          if (refusal) return { ok: false, refusal };
        }
        break;
    }
  }

  return { ok: true, state: stagedState };
}

function runLane(
  input: NormalizedInternalEconomicsInputV2,
  lane: V2WaterfallLane
): InternalEconomicsReceiptV2Result {
  const initialState = initializeEventStreamState(input);
  const eventResult = processEventsV2ForTest(input, initialState);
  if (!eventResult.ok) return { ok: false, refusal: eventResult.refusal };
  const state = eventResult.state;

  const waterfall =
    lane === 'deal_by_deal'
      ? runDealByDealWaterfall(input, state)
      : runWholeFundWaterfall(input, state);
  if (!waterfall.ok) return { ok: false, refusal: waterfall.refusal };

  const tierAllocations: TierAllocationV2[] =
    lane === 'deal_by_deal'
      ? dealToTier(waterfall.tierAllocations)
      : wholeToTier(waterfall.tierAllocations);
  // Tier-partner vectors are built from raw waterfall results BEFORE tier
  // conversion because dealToTier/wholeToTier discard perPartner. The
  // aggregate totalDistributed/partnerDistributions returns are passed to
  // buildReceipt as conservation cross-checks.
  const tierPartnerAllocations = buildTierPartnerAllocations(lane, waterfall.tierAllocations);

  return buildReceipt(
    input,
    state,
    lane,
    tierAllocations,
    tierPartnerAllocations,
    waterfall.totalDistributed,
    waterfall.partnerDistributions
  );
}

export function deriveInternalEconomicsV2(rawInput: unknown): InternalEconomicsReceiptV2Result {
  const normalizeResult = verifyAndNormalizeInternalEconomicsInputV2(rawInput);
  if (!normalizeResult.ok) return { ok: false, refusal: normalizeResult.refusal };

  const input = normalizeResult.input;

  const guard = checkAdmissionGuard(input);
  if (guard) return { ok: false, refusal: guard };

  return runLane(input, input.selectedLane);
}

export function certifyInternalEconomicsDualLaneV2(
  rawInput: unknown
): V2DualLaneCertificationResult {
  const normalizeResult = verifyAndNormalizeInternalEconomicsInputV2(rawInput);
  if (!normalizeResult.ok) return { ok: false, refusal: normalizeResult.refusal };

  const guard = checkManagementFeeRefusal(normalizeResult.input);
  if (guard) return { ok: false, refusal: guard };

  const capabilityRefusal = checkEventCapabilityRefusal(normalizeResult.input);
  if (capabilityRefusal) return { ok: false, refusal: capabilityRefusal };

  const dealByDeal = runLane(normalizeResult.input, 'deal_by_deal');
  if (!dealByDeal.ok) return { ok: false, refusal: dealByDeal.refusal };

  const wholeFund = runLane(normalizeResult.input, 'whole_fund');
  if (!wholeFund.ok) return { ok: false, refusal: wholeFund.refusal };

  return {
    ok: true,
    certification: {
      dealByDeal: dealByDeal.receipt,
      wholeFund: wholeFund.receipt,
    },
  };
}
