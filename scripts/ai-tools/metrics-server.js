#!/usr/bin/env node
import express from 'express';
import { register } from 'prom-client';

/**
 * Simple metrics server for AI agents
 * Serves Prometheus metrics on /metrics endpoint
 */

const app = express();
const PORT = process.env.METRICS_PORT || 3000;

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'ai-agent-metrics'
  });
});

// Metrics endpoint for Prometheus
app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    const metrics = await register.metrics();
    res.end(metrics);
  } catch (error) {
    console.error('Error generating metrics:', error);
    res.status(500).end('Error generating metrics');
  }
});

// Basic info endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'AI Agent Metrics Server',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      metrics: '/metrics'
    },
    observability: {
      prometheus: 'http://localhost:9090',
      grafana: 'http://localhost:3001',
      alertmanager: 'http://localhost:9093'
    }
  });
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`🔍 AI Agent Metrics Server running on port ${PORT}`);
  console.log(`📊 Metrics endpoint: http://localhost:${PORT}/metrics`);
  console.log(`💚 Health check: http://localhost:${PORT}/health`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  server.close(() => {
    console.log('Metrics server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully...');
  server.close(() => {
    console.log('Metrics server closed');
    process.exit(0);
  });
});

export default app;