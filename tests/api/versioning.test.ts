/**
 * Tests for API versioning and feature flags
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express, { Express } from 'express';
import request from 'supertest';
import { apiVersioning, versionRoute, requireVersion } from '../../server/middleware/api-version';
import { features, resetFeatures, overrideFeatures } from '../../shared/config/features';

describe('Feature Flags', () => {
  beforeEach(() => {
    resetFeatures();
  });
  
  afterEach(() => {
    resetFeatures();
  });
  
  it('should have default feature flags', () => {
    expect(features.CIRCUIT_BREAKER).toBe(true);
    expect(features.API_VERSIONING).toBe(true);
    expect(features.RATE_LIMITING).toBe(true);
    expect(features.DEBUG_MODE).toBe(false);
  });
  
  it('should override feature flags', () => {
    overrideFeatures({ DEBUG_MODE: true });
    expect(features.DEBUG_MODE).toBe(true);
  });
  
  it('should reset feature flags to defaults', () => {
    overrideFeatures({ DEBUG_MODE: true });
    expect(features.DEBUG_MODE).toBe(true);
    
    resetFeatures();
    expect(features.DEBUG_MODE).toBe(false);
  });
});

describe('API Versioning Middleware', () => {
  let app: Express;
  
  beforeEach(() => {
    app = express();
    app.use(express.json());
    
    // Enable versioning
    overrideFeatures({ API_VERSIONING: true, DEPRECATION_WARNINGS: true });
    app.use(apiVersioning());
    
    // Test endpoints
    app.get('/test', (req, res) => {
      res.json({ version: (req as any).apiVersion });
    });
    
    app.get('/api/v1/test', (req, res) => {
      res.json({ version: (req as any).apiVersion, path: 'v1' });
    });
    
    app.get('/api/v2/test', (req, res) => {
      res.json({ version: (req as any).apiVersion, path: 'v2' });
    });
  });
  
  afterEach(() => {
    resetFeatures();
  });
  
  describe('Version Detection', () => {
    it('should detect version from URL path', async () => {
      const res1 = await request(app).get('/api/v1/test');
      expect(res1.body.version).toBe('v1');
      
      const res2 = await request(app).get('/api/v2/test');
      expect(res2.body.version).toBe('v2');
    });
    
    it('should detect version from API-Version header', async () => {
      const res = await request(app)
        .get('/test')
        .set('API-Version', 'v1');
      
      expect(res.body.version).toBe('v1');
      expect(res.headers['api-version']).toBe('v1');
    });
    
    it('should detect version from X-API-Version header', async () => {
      const res = await request(app)
        .get('/test')
        .set('X-API-Version', 'v2');
      
      expect(res.body.version).toBe('v2');
    });
    
    it('should detect version from Accept header', async () => {
      const res = await request(app)
        .get('/test')
        .set('Accept', 'application/vnd.api+v1');
      
      expect(res.body.version).toBe('v1');
    });
    
    it('should detect version from query parameter', async () => {
      const res1 = await request(app).get('/test?api_version=v1');
      expect(res1.body.version).toBe('v1');
      
      const res2 = await request(app).get('/test?v=2');
      expect(res2.body.version).toBe('v2');
    });
    
    it('should use default version when not specified', async () => {
      const res = await request(app).get('/test');
      expect(res.body.version).toBe('v2'); // Default version
    });
  });
  
  describe('Deprecation Headers', () => {
    it('should add deprecation headers for v1', async () => {
      const res = await request(app)
        .get('/test')
        .set('API-Version', 'v1');
      
      expect(res.headers['deprecation']).toBe('true');
      expect(res.headers['deprecation-date']).toBe('2025-06-01');
      expect(res.headers['sunset']).toBe('2025-12-01');
      expect(res.headers['warning']).toContain('deprecated');
    });
    
    it('should not add deprecation headers for v2', async () => {
      const res = await request(app)
        .get('/test')
        .set('API-Version', 'v2');
      
      expect(res.headers['deprecation']).toBeUndefined();
      expect(res.headers['sunset']).toBeUndefined();
    });
    
    it('should add beta headers for v3', async () => {
      const res = await request(app)
        .get('/test')
        .set('API-Version', 'v3');
      
      expect(res.headers['x-beta']).toBe('true');
      expect(res.headers['warning']).toContain('beta');
    });
  });
  
  describe('Invalid Version Handling', () => {
    it('should reject invalid version', async () => {
      const res = await request(app)
        .get('/test')
        .set('API-Version', 'v99');
      
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid API version');
      expect(res.body.supported).toContain('v1');
      expect(res.body.supported).toContain('v2');
    });
  });
});

describe('Version-specific Routes', () => {
  let app: Express;
  
  beforeEach(() => {
    app = express();
    app.use(apiVersioning());
    
    // Version-specific handler
    app.get('/api/resource', versionRoute({
      v1: (req, res) => res.json({ data: 'v1 response' }),
      v2: (req, res) => res.json({ data: 'v2 response', enhanced: true }),
      default: (req, res) => res.json({ data: 'default response' }),
    }));
    
    // Version requirement
    app.get('/api/v2-only', requireVersion('v2'), (req, res) => {
      res.json({ message: 'This requires v2+' });
    });
    
    app.get('/api/v1-v2', requireVersion('v1', 'v2'), (req, res) => {
      res.json({ message: 'This works in v1 and v2' });
    });
  });
  
  it('should route to version-specific handler', async () => {
    const res1 = await request(app)
      .get('/api/resource')
      .set('API-Version', 'v1');
    expect(res1.body.data).toBe('v1 response');
    
    const res2 = await request(app)
      .get('/api/resource')
      .set('API-Version', 'v2');
    expect(res2.body.data).toBe('v2 response');
    expect(res2.body.enhanced).toBe(true);
  });
  
  it('should use default handler for unknown version', async () => {
    const res = await request(app)
      .get('/api/resource')
      .set('API-Version', 'v3');
    expect(res.body.data).toBe('default response');
  });
  
  it('should enforce minimum version requirement', async () => {
    const res1 = await request(app)
      .get('/api/v2-only')
      .set('API-Version', 'v1');
    expect(res1.status).toBe(400);
    expect(res1.body.error).toBe('Version Not Supported');
    
    const res2 = await request(app)
      .get('/api/v2-only')
      .set('API-Version', 'v2');
    expect(res2.status).toBe(200);
    expect(res2.body.message).toBe('This requires v2+');
  });
  
  it('should enforce version range requirement', async () => {
    const res1 = await request(app)
      .get('/api/v1-v2')
      .set('API-Version', 'v1');
    expect(res1.status).toBe(200);
    
    const res2 = await request(app)
      .get('/api/v1-v2')
      .set('API-Version', 'v2');
    expect(res2.status).toBe(200);
    
    const res3 = await request(app)
      .get('/api/v1-v2')
      .set('API-Version', 'v3');
    expect(res3.status).toBe(400);
  });
});