import type { Server as HTTPServer } from 'http';
import DevDashboardWebSocket from './dev-dashboard.js';

let devDashboardWS: DevDashboardWebSocket | null = null;

export function setupWebSocketServers(server: HTTPServer) {
  console.log('[websocket] Setting up WebSocket servers...');

  // Setup dev dashboard WebSocket only in development
  if (process.env["NODE_ENV"] === 'development') {
    devDashboardWS = new DevDashboardWebSocket(server);
    console.log('[websocket] Dev dashboard WebSocket enabled');
  }

  return {
    devDashboard: devDashboardWS
  };
}

export function cleanupWebSocketServers() {
  console.log('[websocket] Cleaning up WebSocket servers...');

  if (devDashboardWS) {
    devDashboardWS.cleanup();
    devDashboardWS = null;
    console.log('[websocket] Dev dashboard WebSocket cleaned up');
  }
}

export { DevDashboardWebSocket };