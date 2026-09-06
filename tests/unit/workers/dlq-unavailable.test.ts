import { describe, expect, it } from 'vitest';

import { deleteDLQEntry, enqueueDLQ, getDLQStats, readDLQ } from '../../../workers/dlq';

describe('AI DLQ unavailable contract', () => {
  it.each([
    [
      'enqueue',
      () =>
        enqueueDLQ({
          id: '1',
          operation: 'test',
          reason: 'test',
          payload: {},
          timestamp: 1,
        }),
    ],
    ['read', () => readDLQ()],
    ['delete', () => deleteDLQEntry('1')],
    ['stats', () => getDLQStats()],
  ])('reports %s as unavailable', async (_operation, run) => {
    await expect(run()).rejects.toThrow('not implemented');
  });
});
