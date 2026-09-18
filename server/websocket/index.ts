import type { Server as HTTPServer } from 'http';
import DevDashboardWebSocket from './dev-dashboard.js';
import PortfolioMetricsWebSocket, { setPortfolioMetricsWS } from './portfolio-metrics.js';
import { logger } from '../logger';

let webSocketServers: {
  devDashboard: DevDashboardWebSocket | null;
  portfolioMetrics: PortfolioMetricsWebSocket | null;
} = { devDashboard: null, portfolioMetrics: null };

export function setupWebSocketServers(server: HTTPServer) {
  logger.info('[websocket] Setting up WebSocket servers');

  const servers: typeof webSocketServers = { devDashboard: null, portfolioMetrics: null };
  webSocketServers = servers;
  server.once('close', () => cleanupWebSocketServers(servers));

  // Setup portfolio metrics WebSocket (always enabled for real-time features)
  servers.portfolioMetrics = new PortfolioMetricsWebSocket(server);
  setPortfolioMetricsWS(servers.portfolioMetrics);
  logger.info('[websocket] Portfolio metrics WebSocket enabled');

  // Setup dev dashboard WebSocket only in development
  if (process.env['NODE_ENV'] === 'development') {
    servers.devDashboard = new DevDashboardWebSocket(server);
    logger.info('[websocket] Dev dashboard WebSocket enabled');
  }

  return servers;
}

export function cleanupWebSocketServers(servers = webSocketServers) {
  logger.info('[websocket] Cleaning up WebSocket servers');

  const { portfolioMetrics, devDashboard } = servers;
  servers.portfolioMetrics = null;
  servers.devDashboard = null;
  try {
    if (portfolioMetrics) {
      portfolioMetrics.cleanup();
      logger.info('[websocket] Portfolio metrics WebSocket cleaned up');
    }
  } finally {
    if (devDashboard) {
      devDashboard.cleanup();
      logger.info('[websocket] Dev dashboard WebSocket cleaned up');
    }
  }
}

export { DevDashboardWebSocket, PortfolioMetricsWebSocket };
