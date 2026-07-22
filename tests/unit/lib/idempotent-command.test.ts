import { describe, expect, it } from 'vitest';

import {
  IdempotentCommandError,
  runIdempotentCommand,
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
            candidate.fundId === input.fundId &&
            candidate.idempotencyKey === input.idempotencyKey
        );
        return row ? { row, requestHash: row.requestHash } : null;
      },
      insert: async (requestHash: string) => {
        const existing = this.rows.some(
          (candidate) =>
            candidate.fundId === input.fundId &&
            candidate.idempotencyKey === input.idempotencyKey
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
