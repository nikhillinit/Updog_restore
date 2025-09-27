/**
 * Security utilities for HTTP/HTTPS operations
 * Prevents insecure HTTP in production and enforces allowlists
 */

import { URL } from 'url';

const PROD = process.env['NODE_ENV'] === 'production';
const ALLOWED_HOSTS = new Set(
  (process.env['ALLOWED_OUTBOUND_HOSTS'] || 'localhost,127.0.0.1').split(',').map(s => s.trim())
);

/**
 * Validates a URL and enforces HTTPS in production
 */
export function validateUrl(url: string, options: {
  allowHttp?: boolean;
  allowedProtocols?: string[];
  allowedHosts?: string[];
} = {}): URL {
  const parsed = new URL(url);
  
  const allowedProtocols = options.allowedProtocols || ['https:', 'http:'];
  if (!allowedProtocols.includes(parsed.protocol)) {
    throw new Error(`Invalid protocol: ${parsed.protocol}`);
  }
  
  // Enforce HTTPS in production unless explicitly allowed
  if (PROD && !options.allowHttp && parsed.protocol === 'http:') {
    throw new Error('HTTP not allowed in production');
  }
  
  // Check host allowlist if provided
  const allowedHosts = options.allowedHosts || Array.from(ALLOWED_HOSTS);
  if (allowedHosts.length > 0 && !allowedHosts.includes(parsed.hostname)) {
    throw new Error(`Host not allowed: ${parsed.hostname}`);
  }
  
  return parsed;
}

/**
 * Safe fetch with URL validation
 */
export async function safeFetch(url: string, init?: RequestInit): Promise<Response> {
  const validUrl = validateUrl(url);
  
  // Use native fetch or node-fetch depending on environment
  const fetchFn = typeof fetch !== 'undefined' ? fetch : require('node-fetch').default;
  
  return fetchFn(validUrl.toString(), {
    ...init,
    // Add security headers
    headers: {
      'User-Agent': 'POVC-Fund-Platform/1.0',
      ...init?.headers,
    },
  });
}

/**
 * CORS configuration helper
 */
export function getCorsConfig() {
  const allowedOrigins = (process.env['CORS_ORIGINS'] || '').split(',')
    .map(s => s.trim())
    .filter(Boolean);
  
  return {
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      // Allow requests with no origin (e.g., mobile apps, Postman)
      if (!origin) {
        return callback(null, true);
      }
      
      // Check against allowlist
      if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('CORS policy violation'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Requested-With'],
    maxAge: 86400, // 24 hours
  };
}

/**
 * Express middleware for CORS
 */
export function corsMiddleware(allowedOrigins?: string[]) {
  const origins = allowedOrigins || (process.env['CORS_ORIGINS'] || '').split(',')
    .map(s => s.trim())
    .filter(Boolean);
  
  return (req: any, res: any, next: any) => {
    const origin = req.headers.origin;
    
    if (!origin || origins.length === 0 || origins.includes(origin)) {
      res['setHeader']('Access-Control-Allow-Origin', origin || '*');
      res['setHeader']('Access-Control-Allow-Credentials', 'true');
      res['setHeader']('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
      res['setHeader']('Access-Control-Allow-Headers', 'Authorization,Content-Type,X-Requested-With');
      res['setHeader']('Access-Control-Max-Age', '86400');
    }
    
    // Always set Vary header for proper caching
    res['setHeader']('Vary', 'Origin');
    
    if (req.method === 'OPTIONS') {
      res.status(204).end();
    } else {
      next();
    }
  };
}