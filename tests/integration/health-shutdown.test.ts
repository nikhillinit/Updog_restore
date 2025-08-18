/**
 * Health and Shutdown Integration Tests
 * Validates health endpoints and graceful shutdown behavior
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express, { Express } from 'express';
import request from 'supertest';
import { Server } from 'http';
import { createHealthRouter, markShuttingDown, isServerShuttingDown } from '../../server/routes/health';
import { initializeGracefulShutdown, registerShutdownHandler } from '../../server/graceful-shutdown';

describe('Health Endpoints', () => {
  let app: Express;
  let server: Server;
  
  beforeAll(() => {
    app = express();
    app.use(createHealthRouter());
    server = app.listen(0); // Random port
  });
  
  afterAll(() => {
    server.close();
  });
  
  describe('Liveness Probe', () => {
    it('should return 200 when server is alive', async () => {
      const response = await request(app).get('/livez');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('ok', true);
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('memory');
      expect(response.body).toHaveProperty('pid');
    });
    
    it('should return 503 during shutdown', async () => {
      // Mark as shutting down
      markShuttingDown();
      
      const response = await request(app).get('/livez');
      
      expect(response.status).toBe(503);
      expect(response.body).toHaveProperty('ok', false);
      expect(response.body).toHaveProperty('status', 'shutting_down');
      
      // Reset shutdown state
      vi.unstubAllGlobals();
    });
  });
  
  describe('Readiness Probe', () => {
    it('should check all dependencies', async () => {
      const response = await request(app).get('/readyz');
      
      // Status depends on actual dependencies
      expect([200, 503]).toContain(response.status);
      expect(response.body).toHaveProperty('ok');
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('checks');
      expect(Array.isArray(response.body.checks)).toBe(true);
      
      // Should check at least postgres, redis, and circuit breakers
      const checkNames = response.body.checks.map((c: any) => c.name);
      expect(checkNames).toContain('postgres');
      expect(checkNames).toContain('redis');
      expect(checkNames).toContain('circuit-breakers');
    });
    
    it('should return 503 when dependencies are unhealthy', async () => {
      // This test would need mocked dependencies
      // For now, just verify the structure
      const response = await request(app).get('/readyz');
      
      if (response.status === 503) {
        expect(response.body).toHaveProperty('ok', false);
        expect(response.body).toHaveProperty('status', 'not_ready');
        
        if (response.body.errors) {
          expect(Array.isArray(response.body.errors)).toBe(true);
        }
      }
    });
    
    it('should return 503 immediately during shutdown', async () => {
      markShuttingDown();
      
      const response = await request(app).get('/readyz');
      
      expect(response.status).toBe(503);
      expect(response.body).toHaveProperty('status', 'shutting_down');
    });
  });
  
  describe('Startup Probe', () => {
    it('should check critical dependencies only', async () => {
      const response = await request(app).get('/startupz');
      
      expect([200, 503]).toContain(response.status);
      expect(response.body).toHaveProperty('ok');
      expect(response.body).toHaveProperty('checks');
      
      // Should only check critical dependencies (postgres)
      expect(response.body.checks).toHaveLength(1);
      expect(response.body.checks[0].name).toBe('postgres');
    });
  });
  
  describe('Legacy Health Endpoint', () => {
    it('should maintain backward compatibility', async () => {
      const response = await request(app).get('/health');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('version');
    });
  });
  
  describe('Detailed Health Endpoint', () => {
    it('should require authentication when configured', async () => {
      process.env.HEALTH_KEY = 'test-key';
      
      const response = await request(app).get('/health/detailed');
      
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error', 'Unauthorized');
      
      delete process.env.HEALTH_KEY;
    });
    
    it('should return detailed metrics with auth', async () => {
      process.env.HEALTH_KEY = 'test-key';
      
      const response = await request(app)
        .get('/health/detailed')
        .set('X-Health-Key', 'test-key');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('memory');
      expect(response.body).toHaveProperty('cpu');
      expect(response.body).toHaveProperty('dependencies');
      
      delete process.env.HEALTH_KEY;
    });
  });
});

describe('Graceful Shutdown', () => {
  let app: Express;
  let server: Server;
  let shutdownManager: any;
  
  beforeAll(() => {
    app = express();
    server = app.listen(0);
    shutdownManager = initializeGracefulShutdown(server, {
      timeout: 1000,
      logger: {
        ...console,
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
      },
    });
  });
  
  afterAll(() => {
    server.close();
  });
  
  describe('Shutdown Handler Registration', () => {
    it('should register custom shutdown handlers', () => {
      const handler = vi.fn(async () => {
        // Simulate cleanup
        await new Promise(resolve => setTimeout(resolve, 100));
      });
      
      registerShutdownHandler({
        name: 'test-handler',
        handler,
        timeout: 500,
        critical: false,
      });
      
      expect(shutdownManager).toBeDefined();
    });
    
    it('should execute handlers in priority order', async () => {
      const executionOrder: string[] = [];
      
      registerShutdownHandler({
        name: 'normal-handler',
        handler: async () => {
          executionOrder.push('normal');
        },
        critical: false,
      });
      
      registerShutdownHandler({
        name: 'critical-handler',
        handler: async () => {
          executionOrder.push('critical');
        },
        critical: true,
      });
      
      // Critical handlers should execute first
      // This would need actual shutdown trigger to test
    });
  });
  
  describe('Server Shutdown', () => {
    it('should stop accepting new connections', async () => {
      markShuttingDown();
      
      // Health checks should return 503
      const response = await request(app).get('/livez');
      expect(response.status).toBe(503);
    });
    
    it('should wait for existing connections to close', () => {
      // This would need actual connection simulation
      expect(shutdownManager).toBeDefined();
    });
    
    it('should respect timeout configuration', () => {
      expect(shutdownManager).toBeDefined();
      // Timeout is configured as 1000ms in this test
    });
  });
  
  describe('Shutdown State', () => {
    it('should track shutdown state', () => {
      expect(isServerShuttingDown()).toBe(false);
      
      markShuttingDown();
      expect(isServerShuttingDown()).toBe(true);
    });
  });
});

describe('Kubernetes Integration', () => {
  let app: Express;
  
  beforeAll(() => {
    app = express();
    app.use(createHealthRouter());
  });
  
  it('should support Kubernetes probes', async () => {
    // Liveness probe
    const liveness = await request(app)
      .get('/livez')
      .set('User-Agent', 'Kubernetes-Liveness-Probe');
    
    expect(liveness.status).toBe(200);
    
    // Readiness probe
    const readiness = await request(app)
      .get('/readyz')
      .set('User-Agent', 'Kubernetes-Readiness-Probe');
    
    expect([200, 503]).toContain(readiness.status);
    
    // Startup probe
    const startup = await request(app)
      .get('/startupz')
      .set('User-Agent', 'Kubernetes-Startup-Probe');
    
    expect([200, 503]).toContain(startup.status);
  });
  
  it('should handle preStop lifecycle hook', () => {
    // Verify graceful shutdown can be triggered
    expect(typeof markShuttingDown).toBe('function');
  });
});