import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';

// Task 8 Slice 2: dual-surface parity. A request corpus (representative governed
// routes) must get the SAME mount decision from BOTH surfaces -- makeApp (the
// Vercel serverless surface) AND registerRoutes (the Docker surface). Mount proofs
// are DB-free: a malformed fundId carried by an admin token reaches the mounted
// handler's own guard and returns 400 "Invalid fund ID" before any DB access; a
// non-existent path returns 404. A divergence (one 400, one 404) is a real
// mount-parity gap between the surfaces, which this test exists to catch.

let makeAppSurface: Express;
let dockerHarness: { app: Express; cleanup: () => Promise<void> };
let adminAuth: string;

interface CorpusEntry {
  label: string;
  path: string;
  expectStatus: number;
}

// Corpus of governed routes confirmed mounted on both surfaces, plus a negative
// control. dashboard-summary is mounted on makeApp (app.ts) AND registerRoutes
// (routes.ts). Extend as more dual-surface routes are confirmed.
const CORPUS: CorpusEntry[] = [
  {
    label: 'dashboard-summary malformed fundId reaches the mounted handler',
    path: '/api/dashboard-summary/abc',
    expectStatus: 400,
  },
  {
    label: 'unknown api path falls through to the catch-all',
    path: '/api/__no_such_dual_surface_route__/1',
    expectStatus: 404,
  },
];

describe('dual-surface mount parity (makeApp vs registerRoutes)', () => {
  beforeAll(async () => {
    const { makeApp } = await import('../../server/app');
    const { createInProcessRouteHarness, createSyntheticAdminAuth } =
      await import('./in-process-route-harness');
    const { signToken } = await import('../../server/lib/auth/jwt');

    makeAppSurface = makeApp();
    dockerHarness = await createInProcessRouteHarness({ authenticateApi: true });
    adminAuth = createSyntheticAdminAuth(signToken);
  }, 60_000);

  afterAll(async () => {
    await dockerHarness?.cleanup();
  });

  for (const entry of CORPUS) {
    it(`parity: ${entry.label} (both surfaces -> ${entry.expectStatus})`, async () => {
      const onMakeApp = await request(makeAppSurface)
        .get(entry.path)
        .set('Authorization', adminAuth);
      const onDocker = await request(dockerHarness.app)
        .get(entry.path)
        .set('Authorization', adminAuth);

      // Each surface gives the expected mount decision...
      expect(onMakeApp.status).toBe(entry.expectStatus);
      expect(onDocker.status).toBe(entry.expectStatus);
      // ...and the two surfaces agree (the parity guarantee).
      expect(onMakeApp.status).toBe(onDocker.status);
    }, 30_000);
  }
});
