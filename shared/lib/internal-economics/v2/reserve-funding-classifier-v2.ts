import { Decimal } from '../../../lib/decimal-config';
import type {
  ReserveFundingSourcesV2,
  ReserveFundingSourcesV2Result,
  V2ReserveRefusal,
} from '../../../contracts/internal-economics/reserve-funding-sources-v2.contract';
import type { EventStreamState } from './event-stream-engine-v2';

const ZERO = new Decimal(0);
const FIX6 = 6;

function refuse(code: V2ReserveRefusal['code'], message: string): V2ReserveRefusal {
  return { ok: false, code, stage: 'reserve', message };
}

export function classifyReserveFundingSources(
  state: EventStreamState
): ReserveFundingSourcesV2Result {
  let remainingCallable = ZERO;
  for (const [, tracker] of state.callableTrackers) {
    remainingCallable = remainingCallable.plus(tracker.remainingCallable);
  }

  let eligiblePaidIn = ZERO;
  for (const [, lot] of state.cashSourceLots) {
    if (lot.lotId.startsWith('proceeds:')) continue;
    eligiblePaidIn = eligiblePaidIn.plus(lot.remainingBalance);
  }

  let eligibleRecycling = ZERO;
  for (const [, lot] of state.cashSourceLots) {
    if (!lot.lotId.startsWith('proceeds:')) continue;
    eligibleRecycling = eligibleRecycling.plus(lot.remainingBalance);
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
