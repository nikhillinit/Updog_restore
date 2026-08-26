import type {
  CashFlowEventResponse,
  LpCapitalCallPatch,
} from '@shared/contracts/lp-reporting/cash-flow-event.contract';

// ============================================================================
// Draft-edit form model (pure, framework-free) — lp_capital_call only.
// String-typed throughout: money stays a string (ADR-011); '' means "clear".
// Lives outside the React hook so server integration tests can import the EXACT
// client serializer without pulling in @tanstack/react-query.
// ============================================================================

export interface CashEventEditForm {
  amount: string;
  description: string;
  /** Date portion only, 'YYYY-MM-DD'. */
  eventDate: string;
  callNumber: string;
  dueDate: string;
  purpose: string;
}

const DECIMAL_RE = /^-?\d+(\.\d{1,6})?$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const POSITIVE_INT_RE = /^[1-9]\d*$/;

function payloadString(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  return value === null || value === undefined ? '' : String(value);
}

/** Project a persisted event into the editable string form. */
export function formFromEvent(event: CashFlowEventResponse): CashEventEditForm {
  return {
    amount: event.amount,
    description: event.description ?? '',
    eventDate: event.eventDate.slice(0, 10),
    callNumber: payloadString(event.payload, 'callNumber'),
    dueDate: payloadString(event.payload, 'dueDate'),
    purpose: payloadString(event.payload, 'purpose'),
  };
}

/** Mirror of the server contract; gates the Save button. */
export function isCashEventFormValid(form: CashEventEditForm): boolean {
  if (!DECIMAL_RE.test(form.amount)) return false;
  if (!DATE_RE.test(form.eventDate)) return false;
  if (form.description.length > 1000) return false;
  if (form.callNumber !== '' && !POSITIVE_INT_RE.test(form.callNumber)) return false;
  if (form.dueDate !== '' && !DATE_RE.test(form.dueDate)) return false;
  if (form.purpose.length > 500) return false;
  return true;
}

/**
 * Serialize ONLY changed fields. '' on a nullable field -> null (clear).
 * eventDate swaps only the date portion, preserving the original ISO time.
 * `payload` is included only when at least one payload sub-key changed.
 * Returns {} when nothing changed (caller treats that as "not dirty").
 */
export function buildLpCapitalCallPatch(
  event: CashFlowEventResponse,
  form: CashEventEditForm
): LpCapitalCallPatch {
  const base = formFromEvent(event);
  const patch: LpCapitalCallPatch = {};

  if (form.amount !== base.amount) {
    patch.amount = form.amount;
  }
  if (form.description !== base.description) {
    patch.description = form.description === '' ? null : form.description;
  }
  if (form.eventDate !== base.eventDate) {
    patch.eventDate = `${form.eventDate}${event.eventDate.slice(10)}`;
  }

  const payload: NonNullable<LpCapitalCallPatch['payload']> = {};
  if (form.callNumber !== base.callNumber) {
    payload.callNumber = form.callNumber === '' ? null : Number(form.callNumber);
  }
  if (form.dueDate !== base.dueDate) {
    payload.dueDate = form.dueDate === '' ? null : form.dueDate;
  }
  if (form.purpose !== base.purpose) {
    payload.purpose = form.purpose === '' ? null : form.purpose;
  }
  if (Object.keys(payload).length > 0) {
    patch.payload = payload;
  }

  return patch;
}
