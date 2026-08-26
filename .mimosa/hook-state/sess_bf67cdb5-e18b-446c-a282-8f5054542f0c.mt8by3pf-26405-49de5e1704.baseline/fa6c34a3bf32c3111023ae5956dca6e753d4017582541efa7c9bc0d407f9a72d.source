import type {
  V2CoreRefusal,
  NormalizedInternalEconomicsInputV2,
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
  initializeEventStreamState,
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
  'internal-economics-composite/2.0.1' as const;

function admissionRefusal(code: V2RefusalCode, stage: V2Stage, message: string): V2CoreRefusal {
  return { ok: false, code, stage, message };
}

function checkEventCapabilityRefusal(
  input: NormalizedInternalEconomicsInputV2
): V2CoreRefusal | null {
  for (const event of input.events) {
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

function processEvents(
  input: NormalizedInternalEconomicsInputV2,
  state: EventStreamState
): V2CoreRefusal | null {
  const chronology = sortEventsIntoChronology(input.events);

  for (const entry of chronology) {
    if (!entry.event) continue;
    const event = entry.event;

    switch (event.kind) {
      case 'settled_contribution':
        processSettledContribution(event, state);
        break;
      case 'deployment':
        processDeployment(event, state);
        break;
      case 'realization':
        processRealization(event, state);
        break;
      case 'fund_expense_payment':
        processFundExpense(event, state);
        break;
    }
  }

  return null;
}

function runLane(
  input: NormalizedInternalEconomicsInputV2,
  lane: V2WaterfallLane
): InternalEconomicsReceiptV2Result {
  const state = initializeEventStreamState(input);
  const eventError = processEvents(input, state);
  if (eventError) return { ok: false, refusal: eventError };

  let tierAllocations: TierAllocationV2[];

  if (lane === 'deal_by_deal') {
    const result = runDealByDealWaterfall(input, state);
    if (!result.ok) return { ok: false, refusal: result.refusal };
    tierAllocations = dealToTier(result.tierAllocations);
  } else {
    const result = runWholeFundWaterfall(input, state);
    if (!result.ok) return { ok: false, refusal: result.refusal };
    tierAllocations = wholeToTier(result.tierAllocations);
  }

  const receipt = buildReceipt(input, state, lane, tierAllocations);
  return receipt;
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

  return {
    ok: false,
    refusal: admissionRefusal(
      'UNSUPPORTED_V2_WHOLE_FUND_CERTIFICATION',
      'waterfall',
      'Dual-lane certification is not yet enabled.'
    ),
  };
}
