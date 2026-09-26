import type { Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import {
  IdempotentCommandError,
  replayIdempotentCommandIfPresent,
  retryableCommandErrorCode,
  runIdempotentCommand,
  sendIdempotentCommandLockError,
} from '../../../server/lib/idempotent-command';

interface StoredRow {
  id: number;
  fundId: number;
  idempotencyKey: string;
  requestHash: string;
  value: string;
}

class InMemoryCommandStore {
  readonly rows: StoredRow[] = [];
  private nextId = 1;

  options(input: {
    fundId: number;
    idempotencyKey: string;
    request: Record<string, unknown>;
    contractVersion?: string;
    insertRaceRow?: StoredRow;
  }) {
    const contractVersion = input.contractVersion ?? 'test-contract/1';
    return {
      db: this,
      fundId: input.fundId,
      idempotencyKey: input.idempotencyKey,
      request: input.request,
      contractVersion,
      loadExisting: async () => {
        const row = this.rows.find(
          (candidate) =>
            candidate.fundId === input.fundId && candidate.idempotencyKey === input.idempotencyKey
        );
        return row ? { row, requestHash: row.requestHash } : null;
      },
      insert: async (requestHash: string) => {
        const existing = this.rows.some(
          (candidate) =>
            candidate.fundId === input.fundId && candidate.idempotencyKey === input.idempotencyKey
        );
        if (existing) return null;

        if (input.insertRaceRow) {
          this.rows.push(input.insertRaceRow);
          return null;
        }

        const row: StoredRow = {
          id: this.nextId++,
          fundId: input.fundId,
          idempotencyKey: input.idempotencyKey,
          requestHash,
          value: String(input.request['value']),
        };
        this.rows.push(row);
        return row;
      },
    };
  }
}

function request(fundId: number, value: string) {
  return {
    fundId,
    contractVersion: 'test-contract/1',
    value,
  };
}

describe('runIdempotentCommand', () => {
  it('returns null when no command exists for an early replay check', async () => {
    const store = new InMemoryCommandStore();
    const replayOptions = store.options({
      fundId: 1,
      idempotencyKey: 'missing-command',
      request: request(1, 'alpha'),
    });

    await expect(replayIdempotentCommandIfPresent(replayOptions)).resolves.toBeNull();
  });

  it('replays a stored command before mutable inputs are dereferenced', async () => {
    const store = new InMemoryCommandStore();
    const options = store.options({
      fundId: 1,
      idempotencyKey: 'early-replay',
      request: request(1, 'alpha'),
    });
    const created = await runIdempotentCommand(options);

    await expect(replayIdempotentCommandIfPresent(options)).resolves.toEqual({
      row: created.row,
      replayed: true,
    });
  });

  it('rejects a changed preimage during an early replay check', async () => {
    const store = new InMemoryCommandStore();
    await runIdempotentCommand(
      store.options({
        fundId: 1,
        idempotencyKey: 'early-replay-conflict',
        request: request(1, 'alpha'),
      })
    );
    const replayOptions = store.options({
      fundId: 1,
      idempotencyKey: 'early-replay-conflict',
      request: request(1, 'beta'),
    });

    await expect(replayIdempotentCommandIfPresent(replayOptions)).rejects.toMatchObject({
      status: 409,
      code: 'IDEMPOTENCY_KEY_REUSE',
    });
  });

  it('returns the stored row when an identical request is replayed', async () => {
    const store = new InMemoryCommandStore();
    const options = store.options({
      fundId: 1,
      idempotencyKey: 'same-command',
      request: request(1, 'alpha'),
    });

    const created = await runIdempotentCommand(options);
    const replayed = await runIdempotentCommand(options);

    expect(created).toMatchObject({ replayed: false, row: { value: 'alpha' } });
    expect(replayed).toEqual({ row: created.row, replayed: true });
    expect(store.rows).toHaveLength(1);
  });

  it('rejects reuse of a key with a different request hash', async () => {
    const store = new InMemoryCommandStore();
    await runIdempotentCommand(
      store.options({
        fundId: 1,
        idempotencyKey: 'reused-command',
        request: request(1, 'alpha'),
      })
    );

    await expect(
      runIdempotentCommand(
        store.options({
          fundId: 1,
          idempotencyKey: 'reused-command',
          request: request(1, 'beta'),
        })
      )
    ).rejects.toMatchObject({
      status: 409,
      code: 'IDEMPOTENCY_KEY_REUSE',
    });
  });

  it('reloads the winning row after a concurrent insert race', async () => {
    const store = new InMemoryCommandStore();
    const firstOptions = store.options({
      fundId: 1,
      idempotencyKey: 'raced-command',
      request: request(1, 'alpha'),
    });
    const first = await runIdempotentCommand(firstOptions);
    store.rows.length = 0;

    const result = await runIdempotentCommand(
      store.options({
        fundId: 1,
        idempotencyKey: 'raced-command',
        request: request(1, 'alpha'),
        insertRaceRow: first.row,
      })
    );

    expect(result).toEqual({ row: first.row, replayed: true });
    expect(store.rows).toHaveLength(1);
  });

  it('isolates the same idempotency key across different funds', async () => {
    const store = new InMemoryCommandStore();

    const first = await runIdempotentCommand(
      store.options({
        fundId: 1,
        idempotencyKey: 'shared-key',
        request: request(1, 'fund-one'),
      })
    );
    const second = await runIdempotentCommand(
      store.options({
        fundId: 2,
        idempotencyKey: 'shared-key',
        request: request(2, 'fund-two'),
      })
    );

    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(false);
    expect(store.rows).toHaveLength(2);
  });

  it.each([
    {
      label: 'fundId',
      request: { fundId: 99, contractVersion: 'test-contract/1', value: 'alpha' },
    },
    {
      label: 'contractVersion',
      request: { fundId: 1, contractVersion: 'test-contract/2', value: 'alpha' },
    },
  ])('rejects a request whose $label is not authoritative', async ({ request: body }) => {
    const store = new InMemoryCommandStore();

    await expect(
      runIdempotentCommand(
        store.options({
          fundId: 1,
          idempotencyKey: 'mismatched-authority',
          request: body,
        })
      )
    ).rejects.toBeInstanceOf(IdempotentCommandError);
    await expect(
      runIdempotentCommand(
        store.options({
          fundId: 1,
          idempotencyKey: 'mismatched-authority',
          request: body,
        })
      )
    ).rejects.toMatchObject({
      status: 400,
      code: 'IDEMPOTENCY_REQUEST_MISMATCH',
    });
    expect(store.rows).toHaveLength(0);
  });
});

describe('retryable command errors', () => {
  const wrapped = (code: string) =>
    new Error('Failed query', { cause: Object.assign(new Error('pg'), { code }) });

  it('finds lock, deadlock, and serialization codes anywhere in the cause chain', () => {
    expect(retryableCommandErrorCode(wrapped('55P03'))).toBe('55P03');
    expect(retryableCommandErrorCode(wrapped('40P01'))).toBe('40P01');
    expect(retryableCommandErrorCode(wrapped('40001'))).toBe('40001');
    expect(retryableCommandErrorCode(wrapped('22003'))).toBeNull();
    expect(retryableCommandErrorCode(new Error('plain'))).toBeNull();
  });

  it('maps a deadlock to 503 COMMAND_RETRY_REQUIRED with Retry-After', () => {
    const res = { setHeader: vi.fn(), type: vi.fn(), status: vi.fn(), json: vi.fn() };
    res.type.mockReturnValue(res);
    res.status.mockReturnValue(res);

    expect(sendIdempotentCommandLockError(res as unknown as Response, wrapped('40P01'))).toBe(true);
    expect(res.setHeader).toHaveBeenCalledWith('Retry-After', '2');
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'COMMAND_RETRY_REQUIRED' })
    );
    expect(sendIdempotentCommandLockError(res as unknown as Response, wrapped('22003'))).toBe(
      false
    );
  });
});
