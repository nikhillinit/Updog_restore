// REFLECTION_ID: REFL-010
// This test is linked to: docs/skills/REFL-010-trust-proxy-configuration-for-rate-limiters.md
// Do not rename without updating the reflection's test_file field.

import { describe, it, expect } from 'vitest';

/**
 * REFL-010: Trust Proxy Configuration for Rate Limiters
 *
 * Rate limiters behind reverse proxies see the proxy's IP instead of
 * the client's real IP, causing all requests to be rate-limited as one user.
 */
describe('REFL-010: Trust Proxy Configuration for Rate Limiters', () => {
  // Simulated request object
  interface MockRequest {
    socket: { remoteAddress: string };
    headers: Record<string, string | undefined>;
    ip?: string;
  }

  // Anti-pattern: Get IP without trust proxy
  function getClientIpNoTrustProxy(req: MockRequest): string {
    // Without trust proxy, always returns socket address (proxy IP)
    return req.socket.remoteAddress;
  }

  // Verified fix: Get IP with trust proxy configuration
  function getClientIpWithTrustProxy(
    req: MockRequest,
    trustProxy: boolean | number
  ): string {
    if (!trustProxy) {
      return req.socket.remoteAddress;
    }

    const forwardedFor = req.headers['x-forwarded-for'];
    if (!forwardedFor) {
      return req.socket.remoteAddress;
    }

    // Parse X-Forwarded-For header
    const ips = forwardedFor.split(',').map((ip) => ip.trim());

    if (typeof trustProxy === 'number') {
      // Trust N proxies from the right
      const index = Math.max(0, ips.length - trustProxy);
      return ips[index] || req.socket.remoteAddress;
    }

    // Trust all proxies, return leftmost (original client)
    return ips[0] || req.socket.remoteAddress;
  }

  // Simulated rate limiter
  class RateLimiter {
    private requests: Map<string, number[]> = new Map();
    private windowMs: number;
    private max: number;

    constructor(options: { windowMs: number; max: number }) {
      this.windowMs = options.windowMs;
      this.max = options.max;
    }

    isRateLimited(ip: string): boolean {
      const now = Date.now();
      const windowStart = now - this.windowMs;

      const requests = this.requests.get(ip) || [];
      const recentRequests = requests.filter((t) => t > windowStart);

      if (recentRequests.length >= this.max) {
        return true;
      }

      recentRequests.push(now);
      this.requests.set(ip, recentRequests);
      return false;
    }

    getRequestCount(ip: string): number {
      return this.requests.get(ip)?.length || 0;
    }
  }

  describe('Anti-pattern: Rate limiter without trust proxy', () => {
    it('should rate limit all users together when behind proxy', () => {
      const limiter = new RateLimiter({ windowMs: 60000, max: 5 });
      const proxyIp = '10.0.0.1'; // Nginx/LB IP

      // Different clients behind the same proxy
      const requests: MockRequest[] = [
        {
          socket: { remoteAddress: proxyIp },
          headers: { 'x-forwarded-for': '203.0.113.1' }, // Client A
        },
        {
          socket: { remoteAddress: proxyIp },
          headers: { 'x-forwarded-for': '203.0.113.2' }, // Client B
        },
        {
          socket: { remoteAddress: proxyIp },
          headers: { 'x-forwarded-for': '203.0.113.3' }, // Client C
        },
        {
          socket: { remoteAddress: proxyIp },
          headers: { 'x-forwarded-for': '203.0.113.4' }, // Client D
        },
      ];

      // Without trust proxy, all requests use proxy IP
      for (const req of requests) {
        const ip = getClientIpNoTrustProxy(req);
        limiter.isRateLimited(ip);
      }

      // All 4 different clients counted as 1 IP (the proxy)
      expect(limiter.getRequestCount(proxyIp)).toBe(4);

      // After 5 more requests, client will get rate limited even though
      // it's their "first request" from their perspective
      limiter.isRateLimited(proxyIp);
      expect(limiter.getRequestCount(proxyIp)).toBe(5);
      expect(limiter.isRateLimited(proxyIp)).toBe(true);
    });

    it('should show all clients sharing rate limit bucket', () => {
      const proxyIp = '10.0.0.1';

      const req1: MockRequest = {
        socket: { remoteAddress: proxyIp },
        headers: { 'x-forwarded-for': '1.1.1.1' },
      };

      const req2: MockRequest = {
        socket: { remoteAddress: proxyIp },
        headers: { 'x-forwarded-for': '2.2.2.2' },
      };

      // Without trust proxy, both return proxy IP
      expect(getClientIpNoTrustProxy(req1)).toBe(proxyIp);
      expect(getClientIpNoTrustProxy(req2)).toBe(proxyIp);
      expect(getClientIpNoTrustProxy(req1)).toBe(getClientIpNoTrustProxy(req2));
    });
  });

  describe('Verified fix: Trust proxy configuration', () => {
    it('should extract client IP from X-Forwarded-For', () => {
      const req: MockRequest = {
        socket: { remoteAddress: '10.0.0.1' },
        headers: { 'x-forwarded-for': '203.0.113.50' },
      };

      const ip = getClientIpWithTrustProxy(req, true);

      expect(ip).toBe('203.0.113.50');
      expect(ip).not.toBe('10.0.0.1');
    });

    it('should handle multiple proxies in chain', () => {
      // Request through: Client -> Cloudflare -> Nginx -> App
      const req: MockRequest = {
        socket: { remoteAddress: '10.0.0.1' }, // Nginx
        headers: {
          'x-forwarded-for': '203.0.113.50, 172.16.0.1', // Client, Cloudflare
        },
      };

      // Trust 1 proxy (Nginx) - get Cloudflare IP
      const ip1 = getClientIpWithTrustProxy(req, 1);
      expect(ip1).toBe('172.16.0.1');

      // Trust 2 proxies (Nginx + Cloudflare) - get client IP
      const ip2 = getClientIpWithTrustProxy(req, 2);
      expect(ip2).toBe('203.0.113.50');
    });

    it('should rate limit clients independently', () => {
      const limiter = new RateLimiter({ windowMs: 60000, max: 3 });

      const requests: MockRequest[] = [
        {
          socket: { remoteAddress: '10.0.0.1' },
          headers: { 'x-forwarded-for': '203.0.113.1' },
        },
        {
          socket: { remoteAddress: '10.0.0.1' },
          headers: { 'x-forwarded-for': '203.0.113.2' },
        },
        {
          socket: { remoteAddress: '10.0.0.1' },
          headers: { 'x-forwarded-for': '203.0.113.1' },
        },
        {
          socket: { remoteAddress: '10.0.0.1' },
          headers: { 'x-forwarded-for': '203.0.113.1' },
        },
      ];

      // With trust proxy, each client has their own bucket
      for (const req of requests) {
        const ip = getClientIpWithTrustProxy(req, true);
        limiter.isRateLimited(ip);
      }

      // Client 203.0.113.1 made 3 requests
      expect(limiter.getRequestCount('203.0.113.1')).toBe(3);

      // Client 203.0.113.2 made 1 request
      expect(limiter.getRequestCount('203.0.113.2')).toBe(1);

      // Client 203.0.113.2 is NOT rate limited
      const newReq: MockRequest = {
        socket: { remoteAddress: '10.0.0.1' },
        headers: { 'x-forwarded-for': '203.0.113.2' },
      };
      const ip = getClientIpWithTrustProxy(newReq, true);
      expect(limiter.isRateLimited(ip)).toBe(false);
    });

    it('should fall back to socket address when no X-Forwarded-For', () => {
      const req: MockRequest = {
        socket: { remoteAddress: '192.168.1.100' },
        headers: {},
      };

      const ip = getClientIpWithTrustProxy(req, true);

      // No forwarded header, use direct connection IP
      expect(ip).toBe('192.168.1.100');
    });
  });
});
