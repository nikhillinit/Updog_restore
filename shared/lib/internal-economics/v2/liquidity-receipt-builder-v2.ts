import { Decimal } from '../../../lib/decimal-config';
import { sha256CanonicalJson } from '../../canonical-json';
import type {
  NormalizedInternalEconomicsInputV2,
  V2WaterfallLane,
} from '../../../contracts/internal-economics/internal-economics-input-v2.contract';
import {
  INTERNAL_ECONOMICS_RECEIPT_V2_VERSION,
  type InternalEconomicsReceiptV2,
  type FundCashEquationV2,
  type PartnerLedgerV2,
  type ClassLedgerV2,
  type TierAllocationV2,
} from '../../../contracts/internal-economics/internal-economics-receipt-v2.contract';
import type { EventStreamState, PartnerLedgerState } from './event-stream-engine-v2';

const ZERO = new Decimal(0);
const FIX6 = 6;

function fix(d: Decimal): string {
  return d.toFixed(FIX6);
}

export function buildFundCashEquation(
  input: NormalizedInternalEconomicsInputV2,
  _state: EventStreamState
): FundCashEquationV2 {
  let contributions = ZERO;
  let deployments = ZERO;
  let realizations = ZERO;
  let fees = ZERO;
  let expenses = ZERO;

  for (const event of input.events) {
    const amount = new Decimal(event.amountUsd);
    switch (event.kind) {
      case 'settled_contribution':
        contributions = contributions.plus(amount);
        break;
      case 'deployment':
        deployments = deployments.plus(amount);
        break;
      case 'realization':
        realizations = realizations.plus(amount);
        break;
      case 'management_fee':
        fees = fees.plus(amount);
        break;
      case 'fund_expense':
        expenses = expenses.plus(amount);
        break;
    }
  }

  const openingCash = new Decimal(input.openingState.openingCash);
  const endingCash = openingCash
    .plus(contributions)
    .plus(realizations)
    .minus(fees)
    .minus(expenses)
    .minus(deployments);

  return {
    openingCash: fix(openingCash),
    contributions: fix(contributions),
    deployments: fix(deployments),
    realizations: fix(realizations),
    fees: fix(fees),
    expenses: fix(expenses),
    distributions: fix(ZERO),
    endingCash: fix(endingCash),
  };
}

export function buildPartnerLedgers(
  input: NormalizedInternalEconomicsInputV2,
  state: EventStreamState
): PartnerLedgerV2[] {
  const partnerMap = new Map(input.partners.map((p) => [p.partnerId, p]));

  return Array.from(state.partnerLedgers.values()).map(
    (ledger: PartnerLedgerState): PartnerLedgerV2 => {
      const partner = partnerMap.get(ledger.partnerId);
      return {
        partnerId: ledger.partnerId,
        committedCapital: partner ? partner.committedCapital : fix(ZERO),
        calledCapital: partner
          ? fix(
              new Decimal(partner.committedCapital).minus(
                new Decimal(partner.remainingCallableCommitment)
              )
            )
          : fix(ZERO),
        settledCapital: fix(ledger.settledCapital),
        paidInCapital: fix(ledger.paidInCapital),
        unreturnedSettledCashCapital: fix(ledger.unreturnedSettledCashCapital),
        cumulativeDistributions: fix(ledger.cumulativeDistributions),
        cumulativeFees: fix(ledger.cumulativeFees),
        cumulativeExpenses: fix(ZERO),
        accruedPreference: fix(ledger.accruedPreference),
        returnOfCapital: fix(ZERO),
        preferredReturnPaid: fix(ZERO),
        catchUpPaid: fix(ZERO),
        carryPaid: fix(ZERO),
        cashFlowVector: [],
      };
    }
  );
}

export function buildClassLedgers(input: NormalizedInternalEconomicsInputV2): ClassLedgerV2[] {
  return input.lpClasses.map((cls) => ({
    lpClassId: cls.lpClassId,
    totalFees: fix(ZERO),
    totalExpenses: fix(ZERO),
    feeRecyclingUsed: fix(ZERO),
    exitRecyclingUsed: fix(ZERO),
  }));
}

export function buildReceipt(
  input: NormalizedInternalEconomicsInputV2,
  state: EventStreamState,
  selectedLane: V2WaterfallLane,
  tierAllocations: readonly TierAllocationV2[]
): InternalEconomicsReceiptV2 {
  const fundCashEquation = buildFundCashEquation(input, state);
  const partnerLedgers = buildPartnerLedgers(input, state);
  const classLedgers = buildClassLedgers(input);

  const resultPayload = {
    selectedLane,
    fundCashEquation,
    tierAllocations,
    partnerLedgers,
    classLedgers,
  };

  return {
    receiptVersion: INTERNAL_ECONOMICS_RECEIPT_V2_VERSION,
    componentVersions: {},
    selectedLane,
    hashAlgorithm: 'canonical-json-sha256/1',
    normalizedInputHash: input._normalizedInputHash,
    resultHash: sha256CanonicalJson(resultPayload),
    fundCashEquation,
    tierAllocations,
    partnerLedgers,
    classLedgers,
  };
}
