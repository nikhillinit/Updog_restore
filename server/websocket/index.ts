import type { Server as HTTPServer } from 'http';
import DevDashboardWebSocket from './dev-dashboard.js';
import PortfolioMetricsWebSocket, { setPortfolioMetricsWS } from './portfolio-metrics.js';

let devDashboardWS: DevDashboardWebSocket | null = null;
let portfolioMetricsWS: PortfolioMetricsWebSocket | null = null;

export function setupWebSocketServers(server: HTTPServer) {
  console.log('[websocket] Setting up WebSocket servers...');

  // Setup portfolio metrics WebSocket (always enabled for real-time features)
  portfolioMetricsWS = new PortfolioMetricsWebSocket(server);
  setPortfolioMetricsWS(portfolioMetricsWS);
  console.log('[websocket] Portfolio metrics WebSocket enabled');

  // Setup dev dashboard WebSocket only in development
  if (process.env["NODE_ENV"] === 'development') {
    devDashboardWS = new DevDashboardWebSocket(server);
    console.log('[websocket] Dev dashboard WebSocket enabled');
  }

  return {
    devDashboard: devDashboardWS,
    portfolioMetrics: portfolioMetricsWS,
  };
}

export function cleanupWebSocketServers() {
  console.log('[websocket] Cleaning up WebSocket servers...');

  if (portfolioMetricsWS) {
    portfolioMetricsWS.cleanup();
    portfolioMetricsWS = null;
    console.log('[websocket] Portfolio metrics WebSocket cleaned up');
  }

  if (devDashboardWS) {
    devDashboardWS.cleanup();
    devDashboardWS = null;
    console.log('[websocket] Dev dashboard WebSocket cleaned up');
  }
}

export { DevDashboardWebSocket, PortfolioMetricsWebSocket };