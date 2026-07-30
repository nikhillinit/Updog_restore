import { canonicalSha256 } from '../../shared/lib/canonical-hash';

export class IdempotentCommandError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Readonly<Record<string, unknown>>
  ) {
    super(message);
    this.name = 'IdempotentCommandError';
  }
}

export interface IdempotentCommandReplayOptions<TRow> {
  db: unknown;
  fundId: number;
  idempotencyKey: string;
  request: Record<string, unknown>;
  contractVersion: string;
  loadExisting: () => Promise<{ row: TRow; requestHash: string } | null>;
}

export interface IdempotentCommandOptions<TRow> extends IdempotentCommandReplayOptions<TRow> {
  insert: (requestHash: string) => Promise<TRow | null>;
}

function assertAuthoritativeFields<TRow>(opts: IdempotentCommandReplayOptions<TRow>): void {
  if (
    opts.request['fundId'] !== opts.fundId ||
    opts.request['contractVersion'] !== opts.contractVersion
  ) {
    throw new IdempotentCommandError(
      400,
      'IDEMPOTENCY_REQUEST_MISMATCH',
      'The request fundId and contractVersion must match the authoritative command values.',
      {
        fundId: opts.fundId,
        contractVersion: opts.contractVersion,
      }
    );
  }
}

function replayExisting<TRow>(
  existing: { row: TRow; requestHash: string },
  requestHash: string,
  idempotencyKey: string
): { row: TRow; replayed: true } {
  if (existing.requestHash !== requestHash) {
    throw new IdempotentCommandError(
      409,
      'IDEMPOTENCY_KEY_REUSE',
      'Idempotency-Key was already used for a different request.',
      { idempotencyKey }
    );
  }

  return { row: existing.row, replayed: true };
}

function requestHashFor<TRow>(opts: IdempotentCommandReplayOptions<TRow>): string {
  return canonicalSha256({
    ...opts.request,
    fundId: opts.fundId,
    contractVersion: opts.contractVersion,
  });
}

export async function replayIdempotentCommandIfPresent<TRow>(
  opts: IdempotentCommandReplayOptions<TRow>
): Promise<{ row: TRow; replayed: true } | null> {
  assertAuthoritativeFields(opts);
  const existing = await opts.loadExisting();
  if (existing === null) return null;

  return replayExisting(existing, requestHashFor(opts), opts.idempotencyKey);
}

export async function runIdempotentCommand<TRow>(
  opts: IdempotentCommandOptions<TRow>
): Promise<{ row: TRow; replayed: boolean }> {
  assertAuthoritativeFields(opts);
  const requestHash = requestHashFor(opts);

  const inserted = await opts.insert(requestHash);
  if (inserted !== null) {
    return { row: inserted, replayed: false };
  }

  const existing = await opts.loadExisting();
  if (existing === null) {
    throw new IdempotentCommandError(
      409,
      'IDEMPOTENCY_RACE_UNRESOLVED',
      'The idempotency conflict could not be resolved after reloading the stored command.',
      { idempotencyKey: opts.idempotencyKey }
    );
  }

  return replayExisting(existing, requestHash, opts.idempotencyKey);
}
