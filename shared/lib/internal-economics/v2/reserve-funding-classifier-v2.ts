import { Decimal } from '../../../lib/decimal-config';
import type {
  ReserveFundingSourcesV2,
  ReserveFundingSourcesV2Result,
  V2ReserveRefusal,
} from '../../../contracts/internal-economics/reserve-funding-sources-v2.contract';
import type { CashSourceLot, EventStreamState } from './event-stream-engine-v2';

const ZERO = new Decimal(0);
const FIX6 = 6;

function refuse(code: V2ReserveRefusal['code'], message: string): V2ReserveRefusal {
  return { ok: false, code, stage: 'receipt', message };
}

export function classifyReserveFundingSources(
  state: EventStreamState
): ReserveFundingSourcesV2Result {
  let remainingCallable = ZERO;
  for (const [, tracker] of state.callableTrackers) {
    remainingCallable = remainingCallable.plus(tracker.remainingCallable);
  }

  // Unclassified opening cash is eligible for NEITHER bucket (F_2.0.0 reserve
  // funding contract) — classify explicitly, never by exclusion.
  const bucketOf = (lot: CashSourceLot): 'paid_in' | 'recycling' | 'excluded' => {
    if (lot.origin === 'event') {
      return lot.sourceKind === 'realization_proceeds' ? 'recycling' : 'paid_in';
    }
    if (lot.classification === 'recycling') return 'recycling';
    if (lot.classification === 'paid_in') return 'paid_in';
    return 'excluded';
  };

  let eligiblePaidIn = ZERO;
  let eligibleRecycling = ZERO;
  for (const [, lot] of state.cashSourceLots) {
    const bucket = bucketOf(lot);
    if (bucket === 'paid_in') eligiblePaidIn = eligiblePaidIn.plus(lot.remainingBalance);
    if (bucket === 'recycling') eligibleRecycling = eligibleRecycling.plus(lot.remainingBalance);
  }

  if (remainingCallable.lt(0) || eligiblePaidIn.lt(0) || eligibleRecycling.lt(0)) {
    return {
      ok: false,
      refusal: refuse(
        'RESERVE_CONSERVATION_VIOLATION',
        'Negative reserve funding source detected.'
      ),
    };
  }

  const sources: ReserveFundingSourcesV2 = {
    remainingCallableCommitmentUsd: remainingCallable.toFixed(FIX6),
    eligiblePaidInCashUsd: eligiblePaidIn.toFixed(FIX6),
    eligibleRecyclingCashUsd: eligibleRecycling.toFixed(FIX6),
  };

  return { ok: true, sources };
}
