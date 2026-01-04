import { Router } from 'express';
import snapshotsRouter from './snapshots.js';
import lotsRouter from './lots.js';
import versionsRouter from './versions.js';

const router = Router();

// Mount sub-routers
router.use(snapshotsRouter);
router.use(lotsRouter);

// Version routes mounted under /api/snapshots/:snapshotId/versions
router.use('/snapshots/:snapshotId/versions', versionsRouter);

export default router;
