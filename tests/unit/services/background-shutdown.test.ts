import { afterEach, expect, it, vi } from 'vitest';
import { artifactRetentionService } from '../../../server/services/financial-observations/artifact-retention-service';

afterEach(async () => {
  await artifactRetentionService.stop();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it('stops scheduling immediately and drains the active planner before shutdown completes', async () => {
  vi.useFakeTimers();
  let finish!: () => void;
  const pending = new Promise<{ enqueued: number }>((resolve) => {
    finish = () => resolve({ enqueued: 0 });
  });
  const planner = vi.spyOn(artifactRetentionService, 'planRetentionJobs').mockReturnValue(pending);
  vi.spyOn(artifactRetentionService, 'claimNextRetentionJob').mockResolvedValue(null);
  artifactRetentionService.start({
    enabled: true,
    plannerIntervalMs: 100,
    processorIntervalMs: 100,
  });
  await vi.advanceTimersByTimeAsync(0);
  let stopped = false;
  const shutdown = artifactRetentionService.stop().then(() => {
    stopped = true;
  });
  await vi.advanceTimersByTimeAsync(200);
  expect(stopped).toBe(false);
  expect(planner).toHaveBeenCalledOnce();
  finish();
  await shutdown;
  expect(stopped).toBe(true);
  await artifactRetentionService.stop();
});
