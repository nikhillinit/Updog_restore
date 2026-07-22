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

export interface IdempotentCommandOptions<TRow> {
  db: unknown;
  fundId: number;
  idempotencyKey: string;
  request: Record<string, unknown>;
  contractVersion: string;
  loadExisting: () => Promise<{ row: TRow; requestHash: string } | null>;
  insert: (requestHash: string) => Promise<TRow | null>;
}

function assertAuthoritativeFields<TRow>(opts: IdempotentCommandOptions<TRow>): void {
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

export async function runIdempotentCommand<TRow>(
  opts: IdempotentCommandOptions<TRow>
): Promise<{ row: TRow; replayed: boolean }> {
  assertAuthoritativeFields(opts);
  const requestHash = canonicalSha256({
    ...opts.request,
    fundId: opts.fundId,
    contractVersion: opts.contractVersion,
  });

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
