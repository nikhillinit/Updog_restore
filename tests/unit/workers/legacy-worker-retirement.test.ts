import { describe, expect, it } from 'vitest';

import { startCohortWorker } from '../../../workers/cohort-worker';
import { startPacingWorker } from '../../../workers/pacing-worker';
import { startReserveWorker } from '../../../workers/reserve-worker';

describe('legacy calculation workers', () => {
  it.each([
    ['reserve', startReserveWorker],
    ['pacing', startPacingWorker],
    ['cohort', startCohortWorker],
  ])('fails explicitly for retired %s worker', async (_name, start) => {
    await expect(start()).rejects.toThrow(/retired/);
  });
});
