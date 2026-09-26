import { canonicalSha256 } from '../../shared/lib/canonical-hash';
import type { Response } from 'express';
import { sendApiError } from './apiError';

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

export function sendIdempotentCommandLockError(
  res: Response,
  error: unknown,
  message = 'Retry the same fund command'
): boolean {
  let cause = error;
  while (cause && typeof cause === 'object') {
    if ('code' in cause && ['55P03', '40P01', '40001'].includes(String(cause.code))) {
      const locked = cause.code === '55P03';
      res.setHeader('Retry-After', '2');
      sendApiError(res, locked ? 409 : 503, {
        error: message,
        code: locked ? 'REQUEST_IN_PROGRESS' : 'COMMAND_RETRY_REQUIRED',
      });
      return true;
    }
    cause = 'cause' in cause ? cause.cause : undefined;
  }
  return false;
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
