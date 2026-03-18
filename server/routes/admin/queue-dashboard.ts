import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { Router } from 'express';
import { requireAuth, requireRole } from '../../lib/auth/jwt';
import { asyncHandler } from '../../middleware/async';
import { adminRateLimiter } from '../../middleware/rate-limit';
import { getQueueCatalog, getRegisteredQueueRuntime } from '../../queues/registry';

const router = Router();
const serverAdapter = new ExpressAdapter();

serverAdapter.setBasePath('/api/admin/queues');

const { setQueues } = createBullBoard({
  queues: [],
  serverAdapter,
});

function buildQueueAdapters(): BullMQAdapter[] {
  return getQueueCatalog()
    .map((entry) => {
      const queue = getRegisteredQueueRuntime(entry.key)?.getQueue();
      if (!queue) {
        return null;
      }

      return new BullMQAdapter(queue, {
        description: `${entry.displayName} (${entry.owner}/${entry.healthMode})`,
      });
    })
    .filter((adapter): adapter is BullMQAdapter => adapter !== null);
}

router.use(adminRateLimiter);
router.use(requireAuth(), requireRole('admin'));
router.use(
  asyncHandler(async (_req, _res, next) => {
    setQueues(buildQueueAdapters());
    next();
  })
);
router.use('/', serverAdapter.getRouter());

export default router;
