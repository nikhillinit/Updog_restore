/**
 * Security Headers Test Suite
 * Validates that all security headers are properly configured
 */
import { describe, it, expect, beforeAll } from 'vitest';
import express, { Express } from 'express';
import request from 'supertest';
import { securityHeaders, cspReportHandler, getEnvironmentHeaders } from '../../server/middleware/security-headers';

describe('Security Headers Middleware', () => {
  let app: Express;
  
  beforeAll(() => {
    app = express();
    app.use(express.json());
    
    // Apply security headers
    app.use(securityHeaders());
    
    // Test routes
    app.get('/test', (req, res) => {
      res.json({ message: 'Test response' });
    });
    
    app.get('/health', (req, res) => {
      res.json({ status: 'ok' });
    });
    
    // CSP report endpoint
    app.post('/csp-report', cspReportHandler());
  });
  
  describe('Core Security Headers', () => {
    it('should set Content-Security-Policy header', async () => {
      const response = await request(app).get('/test');
      
      expect(response.headers['content-security-policy']).toBeDefined();
      expect(response.headers['content-security-policy']).toContain("default-src 'self'");
      expect(response.headers['content-security-policy']).toContain("script-src");
      expect(response.headers['content-security-policy']).toContain("style-src");
    });
    
    it('should set X-Frame-Options to DENY', async () => {
      const response = await request(app).get('/test');
      
      expect(response.headers['x-frame-options']).toBe('DENY');
    });
    
    it('should set X-Content-Type-Options to nosniff', async () => {
      const response = await request(app).get('/test');
      
      expect(response.headers['x-content-type-options']).toBe('nosniff');
    });
    
    it('should set Referrer-Policy', async () => {
      const response = await request(app).get('/test');
      
      expect(response.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    });
    
    it('should set Permissions-Policy', async () => {
      const response = await request(app).get('/test');
      
      expect(response.headers['permissions-policy']).toBeDefined();
      expect(response.headers['permissions-policy']).toContain('camera=()');
      expect(response.headers['permissions-policy']).toContain('microphone=()');
    });
  });
  
  describe('Cross-Origin Headers', () => {
    it('should set Cross-Origin-Embedder-Policy', async () => {
      const response = await request(app).get('/test');
      
      expect(response.headers['cross-origin-embedder-policy']).toBe('require-corp');
    });
    
    it('should set Cross-Origin-Opener-Policy', async () => {
      const response = await request(app).get('/test');
      
      expect(response.headers['cross-origin-opener-policy']).toBe('same-origin');
    });
    
    it('should set Cross-Origin-Resource-Policy', async () => {
      const response = await request(app).get('/test');
      
      expect(response.headers['cross-origin-resource-policy']).toBe('same-origin');
    });
  });
  
  describe('Additional Security Headers', () => {
    it('should set X-XSS-Protection', async () => {
      const response = await request(app).get('/test');
      
      expect(response.headers['x-xss-protection']).toBe('1; mode=block');
    });
    
    it('should set X-DNS-Prefetch-Control', async () => {
      const response = await request(app).get('/test');
      
      expect(response.headers['x-dns-prefetch-control']).toBe('off');
    });
    
    it('should set X-Permitted-Cross-Domain-Policies', async () => {
      const response = await request(app).get('/test');
      
      expect(response.headers['x-permitted-cross-domain-policies']).toBe('none');
    });
    
    it('should set X-Download-Options for IE', async () => {
      const response = await request(app).get('/test');
      
      expect(response.headers['x-download-options']).toBe('noopen');
    });
    
    it('should set Origin-Agent-Cluster', async () => {
      const response = await request(app).get('/test');
      
      expect(response.headers['origin-agent-cluster']).toBe('?1');
    });
  });
  
  describe('Path Exclusions', () => {
    it('should skip security headers for health endpoint', async () => {
      const response = await request(app).get('/health');
      
      // Health endpoint should not have CSP
      expect(response.headers['content-security-policy']).toBeUndefined();
    });
  });
  
  describe('CSP Report Handler', () => {
    it('should accept CSP violation reports', async () => {
      const violationReport = {
        'csp-report': {
          'document-uri': 'http://example.com',
          'violated-directive': 'script-src',
          'blocked-uri': 'http://evil.com/script.js',
          'original-policy': "default-src 'self'"
        }
      };
      
      const response = await request(app)
        .post('/csp-report')
        .send(violationReport);
      
      expect(response.status).toBe(204);
    });
  });
  
  describe('Environment-Specific Headers', () => {
    it('should return development headers', () => {
      process.env.NODE_ENV = 'development';
      const headers = getEnvironmentHeaders();
      
      expect(headers.csp?.scriptSrc).toContain("'unsafe-inline'");
      expect(headers.csp?.scriptSrc).toContain("'unsafe-eval'");
      expect(headers.hsts).toBeUndefined();
    });
    
    it('should return production headers', () => {
      process.env.NODE_ENV = 'production';
      const headers = getEnvironmentHeaders();
      
      expect(headers.csp?.scriptSrc).not.toContain("'unsafe-inline'");
      expect(headers.csp?.upgradeInsecureRequests).toBe(true);
      expect(headers.hsts).toBeDefined();
    });
  });
  
  describe('HSTS Configuration', () => {
    it('should set HSTS in production only', () => {
      const originalEnv = process.env.NODE_ENV;
      
      // Test production
      process.env.NODE_ENV = 'production';
      const prodApp = express();
      prodApp.use(securityHeaders());
      prodApp.get('/test', (req, res) => res.json({}));
      
      // HSTS should be set in production
      request(prodApp)
        .get('/test')
        .then(response => {
          expect(response.headers['strict-transport-security']).toBeDefined();
          expect(response.headers['strict-transport-security']).toContain('max-age=31536000');
        });
      
      // Restore environment
      process.env.NODE_ENV = originalEnv;
    });
  });
});

describe('Security Headers Compliance', () => {
  let app: Express;
  
  beforeAll(() => {
    app = express();
    app.use(securityHeaders());
    app.get('/test', (req, res) => res.json({ test: true }));
  });
  
  it('should meet Mozilla Observatory A rating requirements', async () => {
    const response = await request(app).get('/test');
    const headers = response.headers;
    
    // Required for A rating
    expect(headers['content-security-policy']).toBeDefined();
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options']).toBeDefined();
    expect(headers['referrer-policy']).toBeDefined();
    
    // CSP should have essential directives
    const csp = headers['content-security-policy'];
    expect(csp).toContain('default-src');
    expect(csp).toContain('script-src');
    expect(csp).toContain('style-src');
    expect(csp).toContain('img-src');
    expect(csp).toContain('connect-src');
    expect(csp).toContain('frame-ancestors');
    expect(csp).toContain('base-uri');
  });
  
  it('should prevent common attacks', async () => {
    const response = await request(app).get('/test');
    const headers = response.headers;
    
    // Clickjacking protection
    expect(headers['x-frame-options']).toBe('DENY');
    
    // MIME type sniffing protection
    expect(headers['x-content-type-options']).toBe('nosniff');
    
    // XSS protection (for older browsers)
    expect(headers['x-xss-protection']).toBe('1; mode=block');
    
    // Prevent Flash/PDF cross-domain attacks
    expect(headers['x-permitted-cross-domain-policies']).toBe('none');
  });
});