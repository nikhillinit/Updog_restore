import type { Server as HTTPServer } from 'http';
import DevDashboardWebSocket from './dev-dashboard.js';
import PortfolioMetricsWebSocket, { setPortfolioMetricsWS } from './portfolio-metrics.js';
import { logger } from '../logger';

let devDashboardWS: DevDashboardWebSocket | null = null;
let portfolioMetricsWS: PortfolioMetricsWebSocket | null = null;

export function setupWebSocketServers(server: HTTPServer) {
  logger.info('[websocket] Setting up WebSocket servers');

  // Setup portfolio metrics WebSocket (always enabled for real-time features)
  portfolioMetricsWS = new PortfolioMetricsWebSocket(server);
  setPortfolioMetricsWS(portfolioMetricsWS);
  logger.info('[websocket] Portfolio metrics WebSocket enabled');

  // Setup dev dashboard WebSocket only in development
  if (process.env['NODE_ENV'] === 'development') {
    devDashboardWS = new DevDashboardWebSocket(server);
    logger.info('[websocket] Dev dashboard WebSocket enabled');
  }

  return {
    devDashboard: devDashboardWS,
    portfolioMetrics: portfolioMetricsWS,
  };
}

export function cleanupWebSocketServers() {
  logger.info('[websocket] Cleaning up WebSocket servers');

  if (portfolioMetricsWS) {
    portfolioMetricsWS.cleanup();
    portfolioMetricsWS = null;
    logger.info('[websocket] Portfolio metrics WebSocket cleaned up');
  }

  if (devDashboardWS) {
    devDashboardWS.cleanup();
    devDashboardWS = null;
    logger.info('[websocket] Dev dashboard WebSocket cleaned up');
  }
}

export { DevDashboardWebSocket, PortfolioMetricsWebSocket };
