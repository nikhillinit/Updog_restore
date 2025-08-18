/**
 * Chaos Engineering Tests for PostgreSQL
 * Tests resilience under various failure scenarios using Toxiproxy
 */
import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Configuration
const TOXIPROXY_API = 'http://localhost:8474';
const APP_URL = process.env.APP_URL || 'http://localhost:5000';
const PG_PROXY_PORT = 5433;
const REDIS_PROXY_PORT = 6380;

// Toxiproxy client
class ToxiproxyClient {
  private baseUrl: string;

  constructor(baseUrl: string = TOXIPROXY_API) {
    this.baseUrl = baseUrl;
  }

  async reset() {
    await axios.post(`${this.baseUrl}/reset`);
  }

  async createProxy(name: string, listen: string, upstream: string) {
    try {
      await axios.post(`${this.baseUrl}/proxies`, {
        name,
        listen,
        upstream,
        enabled: true
      });
    } catch (error: any) {
      if (error.response?.status !== 409) { // Ignore if proxy already exists
        throw error;
      }
    }
  }

  async addLatency(proxyName: string, latency: number, jitter: number = 0) {
    await axios.post(`${this.baseUrl}/proxies/${proxyName}/toxics`, {
      type: 'latency',
      name: 'latency_downstream',
      stream: 'downstream',
      toxicity: 1.0,
      attributes: {
        latency,
        jitter
      }
    });
  }

  async addTimeout(proxyName: string, timeout: number) {
    await axios.post(`${this.baseUrl}/proxies/${proxyName}/toxics`, {
      type: 'timeout',
      name: 'timeout_downstream',
      stream: 'downstream',
      toxicity: 1.0,
      attributes: {
        timeout
      }
    });
  }

  async addBandwidthLimit(proxyName: string, rate: number) {
    await axios.post(`${this.baseUrl}/proxies/${proxyName}/toxics`, {
      type: 'bandwidth',
      name: 'bandwidth_downstream',
      stream: 'downstream',
      toxicity: 1.0,
      attributes: {
        rate // bytes per second
      }
    });
  }

  async addPacketLoss(proxyName: string, lossPercentage: number) {
    await axios.post(`${this.baseUrl}/proxies/${proxyName}/toxics`, {
      type: 'limit_data',
      name: 'packet_loss',
      stream: 'downstream',
      toxicity: lossPercentage / 100,
      attributes: {
        bytes: 0
      }
    });
  }

  async removeAllToxics(proxyName: string) {
    const response = await axios.get(`${this.baseUrl}/proxies/${proxyName}/toxics`);
    for (const toxic of response.data) {
      await axios.delete(`${this.baseUrl}/proxies/${proxyName}/toxics/${toxic.name}`);
    }
  }

  async disableProxy(proxyName: string) {
    await axios.post(`${this.baseUrl}/proxies/${proxyName}`, {
      enabled: false
    });
  }

  async enableProxy(proxyName: string) {
    await axios.post(`${this.baseUrl}/proxies/${proxyName}`, {
      enabled: true
    });
  }
}

// Metrics collector
class MetricsCollector {
  private samples: number[] = [];
  private errors: number = 0;
  private circuitBreakerOpenCount: number = 0;

  recordLatency(latency: number) {
    this.samples.push(latency);
  }

  recordError() {
    this.errors++;
  }

  recordCircuitBreakerOpen() {
    this.circuitBreakerOpenCount++;
  }

  getP95() {
    if (this.samples.length === 0) return 0;
    const sorted = [...this.samples].sort((a, b) => a - b);
    const index = Math.floor(sorted.length * 0.95);
    return sorted[index];
  }

  getP99() {
    if (this.samples.length === 0) return 0;
    const sorted = [...this.samples].sort((a, b) => a - b);
    const index = Math.floor(sorted.length * 0.99);
    return sorted[index];
  }

  getMedian() {
    if (this.samples.length === 0) return 0;
    const sorted = [...this.samples].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  getErrorRate() {
    const total = this.samples.length + this.errors;
    return total === 0 ? 0 : this.errors / total;
  }

  getStats() {
    return {
      p50: this.getMedian(),
      p95: this.getP95(),
      p99: this.getP99(),
      errorRate: this.getErrorRate(),
      totalRequests: this.samples.length + this.errors,
      circuitBreakerOpenCount: this.circuitBreakerOpenCount
    };
  }

  reset() {
    this.samples = [];
    this.errors = 0;
    this.circuitBreakerOpenCount = 0;
  }
}

describe('PostgreSQL Chaos Testing', () => {
  let toxiproxy: ToxiproxyClient;
  let metrics: MetricsCollector;

  beforeAll(async () => {
    // Start chaos infrastructure
    console.log('Starting chaos infrastructure...');
    await execAsync('docker-compose -f docker-compose.chaos.yml up -d');
    
    // Wait for services to be ready
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    toxiproxy = new ToxiproxyClient();
    metrics = new MetricsCollector();
    
    // Ensure proxies are created
    await toxiproxy.createProxy('postgres-proxy', '0.0.0.0:5433', 'postgres:5432');
    await toxiproxy.createProxy('redis-proxy', '0.0.0.0:6380', 'redis:6379');
  });

  afterAll(async () => {
    // Clean up chaos infrastructure
    console.log('Cleaning up chaos infrastructure...');
    await execAsync('docker-compose -f docker-compose.chaos.yml down');
  });

  beforeEach(async () => {
    // Reset toxiproxy and metrics
    await toxiproxy.reset();
    metrics.reset();
  });

  afterEach(async () => {
    // Remove all toxics
    await toxiproxy.removeAllToxics('postgres-proxy');
    await toxiproxy.removeAllToxics('redis-proxy');
  });

  test('Should handle 500ms PostgreSQL latency without violating SLOs', async () => {
    // Inject 500ms latency
    await toxiproxy.addLatency('postgres-proxy', 500, 100);
    
    // Run load test
    const duration = 30000; // 30 seconds
    const startTime = Date.now();
    
    while (Date.now() - startTime < duration) {
      const requestStart = Date.now();
      
      try {
        const response = await axios.get(`${APP_URL}/api/funds`, {
          timeout: 5000,
          validateStatus: (status) => status < 500
        });
        
        const latency = Date.now() - requestStart;
        metrics.recordLatency(latency);
        
        // Check if circuit breaker opened
        if (response.status === 503) {
          metrics.recordCircuitBreakerOpen();
        }
      } catch (error) {
        metrics.recordError();
      }
      
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Verify SLOs
    const stats = metrics.getStats();
    console.log('Test results with 500ms PG latency:', stats);
    
    // P95 should remain under 2 seconds (with circuit breaker and caching)
    expect(stats.p95).toBeLessThan(2000);
    
    // Error rate should be under 5%
    expect(stats.errorRate).toBeLessThan(0.05);
    
    // Circuit breaker should have opened
    expect(stats.circuitBreakerOpenCount).toBeGreaterThan(0);
  });

  test('Should handle PostgreSQL connection failures gracefully', async () => {
    // Disable proxy to simulate connection failure
    await toxiproxy.disableProxy('postgres-proxy');
    
    // Make requests and verify circuit breaker opens quickly
    const requests = 10;
    let circuitBreakerOpened = false;
    
    for (let i = 0; i < requests; i++) {
      try {
        const response = await axios.get(`${APP_URL}/api/funds`, {
          timeout: 2000,
          validateStatus: () => true
        });
        
        if (response.status === 503) {
          circuitBreakerOpened = true;
          break;
        }
      } catch (error) {
        // Expected
      }
    }
    
    expect(circuitBreakerOpened).toBe(true);
    
    // Re-enable proxy
    await toxiproxy.enableProxy('postgres-proxy');
    
    // Wait for circuit breaker to recover
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Verify recovery
    const response = await axios.get(`${APP_URL}/api/funds`);
    expect(response.status).toBe(200);
  });

  test('Should handle network partition (timeout) scenarios', async () => {
    // Add timeout toxic to simulate network partition
    await toxiproxy.addTimeout('postgres-proxy', 10000); // 10 second timeout
    
    const startTime = Date.now();
    
    try {
      await axios.get(`${APP_URL}/api/funds`, {
        timeout: 3000
      });
    } catch (error: any) {
      const duration = Date.now() - startTime;
      
      // Should timeout quickly due to circuit breaker
      expect(duration).toBeLessThan(3500);
      expect(error.code).toMatch(/ECONNABORTED|ETIMEDOUT|503/);
    }
  });

  test('Should maintain read availability during PostgreSQL degradation', async () => {
    // Add moderate latency and packet loss
    await toxiproxy.addLatency('postgres-proxy', 200, 50);
    await toxiproxy.addPacketLoss('postgres-proxy', 10);
    
    // Verify cached reads still work
    const results = [];
    
    for (let i = 0; i < 20; i++) {
      const start = Date.now();
      
      try {
        const response = await axios.get(`${APP_URL}/api/funds`, {
          timeout: 2000,
          validateStatus: () => true
        });
        
        results.push({
          status: response.status,
          latency: Date.now() - start,
          cached: response.headers['x-cache-hit'] === 'true'
        });
      } catch (error) {
        results.push({
          status: 0,
          latency: Date.now() - start,
          cached: false
        });
      }
    }
    
    // At least 50% of requests should succeed (via cache or resilience)
    const successRate = results.filter(r => r.status === 200).length / results.length;
    expect(successRate).toBeGreaterThan(0.5);
    
    // Cached responses should be fast
    const cachedResults = results.filter(r => r.cached);
    if (cachedResults.length > 0) {
      const avgCachedLatency = cachedResults.reduce((sum, r) => sum + r.latency, 0) / cachedResults.length;
      expect(avgCachedLatency).toBeLessThan(100);
    }
  });

  test('Should handle gradual PostgreSQL degradation', async () => {
    const latencies = [0, 100, 200, 500, 1000, 2000];
    const results = [];
    
    for (const latency of latencies) {
      // Reset and add new latency
      await toxiproxy.removeAllToxics('postgres-proxy');
      await toxiproxy.addLatency('postgres-proxy', latency);
      
      // Measure performance
      const samples = [];
      for (let i = 0; i < 10; i++) {
        const start = Date.now();
        
        try {
          await axios.get(`${APP_URL}/api/funds`, {
            timeout: 5000,
            validateStatus: () => true
          });
          samples.push(Date.now() - start);
        } catch (error) {
          samples.push(5000);
        }
      }
      
      const avgLatency = samples.reduce((a, b) => a + b, 0) / samples.length;
      results.push({ pgLatency: latency, avgResponseTime: avgLatency });
    }
    
    console.log('Degradation test results:', results);
    
    // Response time should not increase linearly with PG latency (due to circuit breaker)
    const lastResult = results[results.length - 1];
    expect(lastResult.avgResponseTime).toBeLessThan(3000);
  });

  test('Should recover quickly after PostgreSQL recovers', async () => {
    // Start with high latency
    await toxiproxy.addLatency('postgres-proxy', 3000);
    
    // Wait for circuit breaker to open
    for (let i = 0; i < 5; i++) {
      try {
        await axios.get(`${APP_URL}/api/funds`, { timeout: 1000 });
      } catch (error) {
        // Expected
      }
    }
    
    // Remove latency (simulate recovery)
    await toxiproxy.removeAllToxics('postgres-proxy');
    
    // Measure recovery time
    const recoveryStart = Date.now();
    let recovered = false;
    
    while (Date.now() - recoveryStart < 30000) {
      try {
        const response = await axios.get(`${APP_URL}/api/funds`);
        if (response.status === 200) {
          recovered = true;
          break;
        }
      } catch (error) {
        // Still recovering
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    const recoveryTime = Date.now() - recoveryStart;
    expect(recovered).toBe(true);
    expect(recoveryTime).toBeLessThan(15000); // Should recover within 15 seconds
  });

  test('Should handle bandwidth limitations gracefully', async () => {
    // Limit bandwidth to 10KB/s
    await toxiproxy.addBandwidthLimit('postgres-proxy', 10240);
    
    // Test with timeout
    const start = Date.now();
    
    try {
      await axios.get(`${APP_URL}/api/funds`, {
        timeout: 2000
      });
    } catch (error: any) {
      const duration = Date.now() - start;
      
      // Should timeout or get circuit breaker response
      expect(duration).toBeLessThan(2500);
      expect([408, 503, 'ECONNABORTED']).toContain(error.response?.status || error.code);
    }
  });
});

describe('Redis Chaos Testing', () => {
  let toxiproxy: ToxiproxyClient;

  beforeAll(async () => {
    toxiproxy = new ToxiproxyClient();
  });

  beforeEach(async () => {
    await toxiproxy.reset();
  });

  test('Should handle Redis latency without affecting critical operations', async () => {
    // Add 200ms latency to Redis
    await toxiproxy.addLatency('redis-proxy', 200);
    
    // Critical operations should still work (may be slower)
    const response = await axios.get(`${APP_URL}/api/funds`, {
      timeout: 5000
    });
    
    expect(response.status).toBe(200);
  });

  test('Should fallback gracefully when Redis is unavailable', async () => {
    // Disable Redis proxy
    await toxiproxy.disableProxy('redis-proxy');
    
    // App should still function without cache
    const response = await axios.get(`${APP_URL}/api/funds`, {
      validateStatus: () => true
    });
    
    // Should work but may indicate cache miss
    expect([200, 206]).toContain(response.status);
    
    // Re-enable for cleanup
    await toxiproxy.enableProxy('redis-proxy');
  });
});