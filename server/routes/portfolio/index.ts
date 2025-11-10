import { Router } from 'express';
import snapshotsRouter from './snapshots.js';
import lotsRouter from './lots.js';

const router = Router();

// Mount sub-routers
router.use(snapshotsRouter);
router.use(lotsRouter);

export default router;
