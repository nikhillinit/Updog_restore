import { Router } from 'express';
import { validateReserveInput } from '../../../shared/schemas.js';
import { ConstrainedReserveEngine } from '../../../shared/core/reserves/ConstrainedReserveEngine.js';

export const reservesV1Router = Router();
const engine = new ConstrainedReserveEngine();

reservesV1Router.post('/calculate', (req, res) => {
  const rid = (req as any).rid;
  try {
    const val = validateReserveInput(req.body);
    if (!val.ok) return res.status(val.status).json({ error: 'validation', issues: val.issues, rid });

    const out = engine.calculate(val.data);
    if (!out.conservationOk) return res.status(500).json({ error: 'conservation_failed', rid });

    res.json({ 
      allocations: out.allocations, 
      totalAllocated: out.totalAllocated, 
      remaining: out.remaining,
      rid 
    });
  } catch (e: any) {
    console.error('reserve calc error:', e);
    res.status(e?.status ?? 500).json({ error: e?.message ?? 'internal', rid });
  }
});

reservesV1Router.get('/config', (_req, res) => {
  res.json({
    '/healthz': 'http://localhost:3001',
    '/readyz': 'http://localhost:3001'
  });
});