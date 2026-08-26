/**
 * Injected fixed clock with defensive-copy behavior (Tranche 1 substrate).
 *
 * The clock stores only an epoch-milliseconds number, never a Date instance,
 * so there is no shared mutable object: every now() call returns a fresh Date
 * and mutating a returned Date cannot move the clock.
 */

const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

export interface CalcClock {
  /** Fresh Date copy of the fixed instant; safe for callers to mutate. */
  now(): Date;
  /** Canonical ISO-8601 UTC representation of the fixed instant. */
  isoNow(): string;
}

class FixedClock implements CalcClock {
  private readonly epochMs: number;

  constructor(epochMs: number) {
    this.epochMs = epochMs;
  }

  now(): Date {
    return new Date(this.epochMs);
  }

  isoNow(): string {
    return new Date(this.epochMs).toISOString();
  }
}

export function createFixedClock(isoUtc: string): CalcClock {
  if (typeof isoUtc !== 'string' || !ISO_UTC_RE.test(isoUtc)) {
    throw new RangeError(
      `fixed clock requires a Z-suffixed ISO-8601 UTC timestamp, received: ${String(isoUtc)}`
    );
  }
  const epochMs = Date.parse(isoUtc);
  if (Number.isNaN(epochMs)) {
    throw new RangeError(`fixed clock timestamp does not parse: ${isoUtc}`);
  }
  // Round-trip guard: rejects lexically valid but non-existent instants
  // (e.g. month 13 or Feb 30) that Date.parse would silently roll over.
  const canonical = new Date(epochMs).toISOString();
  const normalizedInput = isoUtc.includes('.')
    ? isoUtc.replace(/(\.\d{1,3})Z$/, (_m, frac: string) => `.${frac.slice(1).padEnd(3, '0')}Z`)
    : isoUtc.replace('Z', '.000Z');
  if (canonical !== normalizedInput) {
    throw new RangeError(`fixed clock timestamp is not a real instant: ${isoUtc}`);
  }
  return new FixedClock(epochMs);
}
