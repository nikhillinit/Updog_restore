import express from 'express';
import type { Server } from 'http';
import { registerRoutes } from '../../server/routes';
import { cleanupWebSocketServers } from '../../server/websocket/index';
import {
  resetCompletionHandlerRegistration,
} from '../../server/services/calc-run-completion-handlers';
import { varianceAlertAutomationService } from '../../server/services/variance-alert-automation';

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

export async function createInProcessRouteHarness() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

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
