import type { Server as HTTPServer } from 'http';
import PortfolioMetricsWebSocket, { setPortfolioMetricsWS } from './portfolio-metrics.js';
import { logger } from '../logger';

let portfolioMetricsWS: PortfolioMetricsWebSocket | null = null;

export function setupWebSocketServers(server: HTTPServer) {
  logger.info('[websocket] Setting up WebSocket servers');

  portfolioMetricsWS = new PortfolioMetricsWebSocket(server);
  setPortfolioMetricsWS(portfolioMetricsWS);
  logger.info('[websocket] Portfolio metrics WebSocket enabled');

  return {
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
}

export { PortfolioMetricsWebSocket };
