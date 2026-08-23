import type {
  V2CoreRefusal,
  NormalizedInternalEconomicsInputV2,
  V2WaterfallLane,
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
  return { ok: true, receipt };
}

export function deriveInternalEconomicsV2(rawInput: unknown): InternalEconomicsReceiptV2Result {
  const normalizeResult = verifyAndNormalizeInternalEconomicsInputV2(rawInput);
  if (!normalizeResult.ok) return { ok: false, refusal: normalizeResult.refusal };

  const input = normalizeResult.input;
  return runLane(input, input.selectedLane);
}

export function certifyInternalEconomicsDualLaneV2(
  rawInput: unknown
): V2DualLaneCertificationResult {
  const normalizeResult = verifyAndNormalizeInternalEconomicsInputV2(rawInput);
  if (!normalizeResult.ok) return { ok: false, refusal: normalizeResult.refusal };

  const input = normalizeResult.input;

  const dealResult = runLane(input, 'deal_by_deal');
  if (!dealResult.ok) return dealResult;

  const wholeResult = runLane(input, 'whole_fund');
  if (!wholeResult.ok) return wholeResult;

  return {
    ok: true,
    certification: {
      dealByDeal: dealResult.receipt,
      wholeFund: wholeResult.receipt,
    },
  };
}
