import { describe, expect, it } from 'vitest';
import {
  buildRedeliveryPlan,
  parseRedeliveryArgs,
} from '../../../scripts/release/redeliver-capital-call-outbox.mjs';

describe('capital-call outbox redelivery command', () => {
  it('defaults to dry-run and accepts targeted exhausted row ids', () => {
    const options = parseRedeliveryArgs([
      '--ids=11111111-1111-4111-8111-111111111111,22222222-2222-4222-8222-222222222222',
    ]);

    expect(options).toEqual({
      apply: false,
      all: false,
      ids: ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'],
    });
  });

  it('plans exhausted rows for pending reset without mutating input', () => {
    const rows = [{ id: '11111111-1111-4111-8111-111111111111' }];

    expect(buildRedeliveryPlan(rows)).toEqual([
      {
        id: rows[0]!.id,
        status: 'exhausted',
        nextStatus: 'pending',
        attemptCount: 0,
        nextAttemptAt: 'clock_timestamp()',
      },
    ]);
    expect(rows).toEqual([{ id: '11111111-1111-4111-8111-111111111111' }]);
  });

  it('blocks apply mode before database dispatch', () => {
    expect(() =>
      parseRedeliveryArgs(['--apply', '--id=11111111-1111-4111-8111-111111111111'])
    ).toThrow(/production data mutation is mechanically blocked/i);
  });
});
