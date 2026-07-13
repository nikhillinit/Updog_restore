import express from 'express';
import jwt from 'jsonwebtoken';
import type { Server } from 'http';
import { registerRoutes } from '../../server/routes';
import { cleanupWebSocketServers } from '../../server/websocket/index';
import { resetCompletionHandlerRegistration } from '../../server/services/calc-run-completion-handlers';
import { varianceAlertAutomationService } from '../../server/services/variance-alert-automation';
import { requireAuth } from '../../server/lib/auth/jwt';
import { isPublicApiPath } from '../../server/lib/public-api-boundary';
import { requireSecureContext } from '../../server/lib/secure-context';

export function createSyntheticAdminAuth(
  signToken: typeof import('../../server/lib/auth/jwt').signToken
): string {
  const signed = signToken({
    sub: 'dual-surface-parity-admin',
    email: 'dual-surface-parity@example.com',
    role: 'admin',
    fundIds: [],
  });
  const claims = jwt.decode(signed);
  const secret = process.env['JWT_SECRET'];
  if (claims === null || typeof claims === 'string' || !secret) {
    throw new Error('Failed to build dual-surface integration bearer token');
  }

  delete claims.jti;
  return `Bearer ${jwt.sign(claims, secret, { algorithm: 'HS256' })}`;
}

async function closeServer(server: Server) {
  if (!server.listening) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

interface InProcessRouteHarnessOptions {
  normalizeAuthForMountProbes?: boolean;
}

export async function createInProcessRouteHarness(options: InProcessRouteHarnessOptions = {}) {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  if (options.normalizeAuthForMountProbes) {
    // These integration probes compare route reachability, not entrypoint auth
    // composition. Hold both secure-context and JWT prerequisites constant so
    // a route-local guard cannot masquerade as a missing mount.
    const authenticate = requireAuth();
    app.use('/api', (req, res, next) => {
      if (isPublicApiPath(req.method, req.path)) return next();
      return requireSecureContext(req, res, next);
    });
    app.use('/api', (req, res, next) => {
      if (isPublicApiPath(req.method, req.path)) return next();
      return authenticate(req, res, next);
    });
  }

  const server = await registerRoutes(app);

  return {
    app,
    async cleanup() {
      cleanupWebSocketServers();
      await varianceAlertAutomationService.stop();
      resetCompletionHandlerRegistration();
      await closeServer(server);
    },
  };
}
