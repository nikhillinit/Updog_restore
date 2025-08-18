/**
 * Security Headers Middleware
 * Implements CSP, HSTS, and other security headers for Express
 * Targets Mozilla Observatory "A" rating
 */
import { Request, Response, NextFunction } from 'express';

interface SecurityHeadersOptions {
  csp?: ContentSecurityPolicyOptions;
  hsts?: HSTSOptions;
  frameOptions?: 'DENY' | 'SAMEORIGIN';
  contentTypeOptions?: boolean;
  referrerPolicy?: ReferrerPolicyValue;
  permissionsPolicy?: PermissionsPolicyOptions;
  crossOriginEmbedderPolicy?: boolean;
  crossOriginOpenerPolicy?: 'same-origin' | 'same-origin-allow-popups' | 'unsafe-none';
  crossOriginResourcePolicy?: 'same-origin' | 'same-site' | 'cross-origin';
  originAgentCluster?: boolean;
  xssProtection?: boolean;
  dnsPrefetchControl?: boolean;
}

interface ContentSecurityPolicyOptions {
  defaultSrc?: string[];
  scriptSrc?: string[];
  styleSrc?: string[];
  imgSrc?: string[];
  connectSrc?: string[];
  fontSrc?: string[];
  objectSrc?: string[];
  mediaSrc?: string[];
  frameSrc?: string[];
  frameAncestors?: string[];
  formAction?: string[];
  baseUri?: string[];
  reportUri?: string;
  reportTo?: string;
  upgradeInsecureRequests?: boolean;
  blockAllMixedContent?: boolean;
}

interface HSTSOptions {
  maxAge: number;
  includeSubDomains?: boolean;
  preload?: boolean;
}

interface PermissionsPolicyOptions {
  camera?: string[];
  microphone?: string[];
  geolocation?: string[];
  payment?: string[];
  usb?: string[];
  fullscreen?: string[];
  accelerometer?: string[];
  gyroscope?: string[];
  magnetometer?: string[];
  midi?: string[];
  notifications?: string[];
  push?: string[];
  vibrate?: string[];
}

type ReferrerPolicyValue = 
  | 'no-referrer'
  | 'no-referrer-when-downgrade'
  | 'origin'
  | 'origin-when-cross-origin'
  | 'same-origin'
  | 'strict-origin'
  | 'strict-origin-when-cross-origin'
  | 'unsafe-url';

/**
 * Default security headers configuration
 * Provides strong security while maintaining functionality
 */
const defaultOptions: SecurityHeadersOptions = {
  csp: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // May need adjustment for React
    styleSrc: ["'self'", "'unsafe-inline'"], // Needed for inline styles
    imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
    connectSrc: ["'self'", process.env.API_ORIGIN || 'http://localhost:5000', 'ws:', 'wss:'],
    fontSrc: ["'self'", 'data:'],
    objectSrc: ["'none'"],
    mediaSrc: ["'self'"],
    frameSrc: ["'none'"],
    frameAncestors: ["'none'"],
    formAction: ["'self'"],
    baseUri: ["'self'"],
    upgradeInsecureRequests: process.env.NODE_ENV === 'production',
    blockAllMixedContent: process.env.NODE_ENV === 'production'
  },
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true
  },
  frameOptions: 'DENY',
  contentTypeOptions: true,
  referrerPolicy: 'strict-origin-when-cross-origin',
  permissionsPolicy: {
    camera: [],
    microphone: [],
    geolocation: [],
    payment: [],
    usb: [],
    fullscreen: ["'self'"],
    accelerometer: [],
    gyroscope: [],
    magnetometer: [],
    midi: [],
    notifications: ["'self'"],
    push: ["'self'"],
    vibrate: []
  },
  crossOriginEmbedderPolicy: true,
  crossOriginOpenerPolicy: 'same-origin',
  crossOriginResourcePolicy: 'same-origin',
  originAgentCluster: true,
  xssProtection: true,
  dnsPrefetchControl: true
};

/**
 * Build Content Security Policy header value
 */
function buildCSP(options: ContentSecurityPolicyOptions): string {
  const directives: string[] = [];
  
  if (options.defaultSrc) {
    directives.push(`default-src ${options.defaultSrc.join(' ')}`);
  }
  
  if (options.scriptSrc) {
    directives.push(`script-src ${options.scriptSrc.join(' ')}`);
  }
  
  if (options.styleSrc) {
    directives.push(`style-src ${options.styleSrc.join(' ')}`);
  }
  
  if (options.imgSrc) {
    directives.push(`img-src ${options.imgSrc.join(' ')}`);
  }
  
  if (options.connectSrc) {
    directives.push(`connect-src ${options.connectSrc.join(' ')}`);
  }
  
  if (options.fontSrc) {
    directives.push(`font-src ${options.fontSrc.join(' ')}`);
  }
  
  if (options.objectSrc) {
    directives.push(`object-src ${options.objectSrc.join(' ')}`);
  }
  
  if (options.mediaSrc) {
    directives.push(`media-src ${options.mediaSrc.join(' ')}`);
  }
  
  if (options.frameSrc) {
    directives.push(`frame-src ${options.frameSrc.join(' ')}`);
  }
  
  if (options.frameAncestors) {
    directives.push(`frame-ancestors ${options.frameAncestors.join(' ')}`);
  }
  
  if (options.formAction) {
    directives.push(`form-action ${options.formAction.join(' ')}`);
  }
  
  if (options.baseUri) {
    directives.push(`base-uri ${options.baseUri.join(' ')}`);
  }
  
  if (options.upgradeInsecureRequests) {
    directives.push('upgrade-insecure-requests');
  }
  
  if (options.blockAllMixedContent) {
    directives.push('block-all-mixed-content');
  }
  
  if (options.reportUri) {
    directives.push(`report-uri ${options.reportUri}`);
  }
  
  if (options.reportTo) {
    directives.push(`report-to ${options.reportTo}`);
  }
  
  return directives.join('; ');
}

/**
 * Build HSTS header value
 */
function buildHSTS(options: HSTSOptions): string {
  const parts = [`max-age=${options.maxAge}`];
  
  if (options.includeSubDomains) {
    parts.push('includeSubDomains');
  }
  
  if (options.preload) {
    parts.push('preload');
  }
  
  return parts.join('; ');
}

/**
 * Build Permissions Policy header value
 */
function buildPermissionsPolicy(options: PermissionsPolicyOptions): string {
  const directives: string[] = [];
  
  for (const [feature, allowList] of Object.entries(options)) {
    if (allowList && Array.isArray(allowList)) {
      if (allowList.length === 0) {
        directives.push(`${feature}=()`);
      } else {
        directives.push(`${feature}=(${allowList.join(' ')})`);
      }
    }
  }
  
  return directives.join(', ');
}

/**
 * Apply security headers to Express response
 */
export function applySecurityHeaders(res: Response, options?: SecurityHeadersOptions): void {
  const config = { ...defaultOptions, ...options };
  
  // Content Security Policy
  if (config.csp) {
    const cspValue = buildCSP(config.csp);
    res.setHeader('Content-Security-Policy', cspValue);
    
    // Report-Only mode for testing
    if (process.env.CSP_REPORT_ONLY === 'true') {
      res.setHeader('Content-Security-Policy-Report-Only', cspValue);
    }
  }
  
  // Strict Transport Security (HSTS)
  if (config.hsts && process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', buildHSTS(config.hsts));
  }
  
  // X-Frame-Options (clickjacking protection)
  if (config.frameOptions) {
    res.setHeader('X-Frame-Options', config.frameOptions);
  }
  
  // X-Content-Type-Options (MIME sniffing protection)
  if (config.contentTypeOptions) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
  }
  
  // Referrer Policy
  if (config.referrerPolicy) {
    res.setHeader('Referrer-Policy', config.referrerPolicy);
  }
  
  // Permissions Policy (formerly Feature Policy)
  if (config.permissionsPolicy) {
    res.setHeader('Permissions-Policy', buildPermissionsPolicy(config.permissionsPolicy));
  }
  
  // Cross-Origin Embedder Policy
  if (config.crossOriginEmbedderPolicy) {
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  }
  
  // Cross-Origin Opener Policy
  if (config.crossOriginOpenerPolicy) {
    res.setHeader('Cross-Origin-Opener-Policy', config.crossOriginOpenerPolicy);
  }
  
  // Cross-Origin Resource Policy
  if (config.crossOriginResourcePolicy) {
    res.setHeader('Cross-Origin-Resource-Policy', config.crossOriginResourcePolicy);
  }
  
  // Origin-Agent-Cluster
  if (config.originAgentCluster) {
    res.setHeader('Origin-Agent-Cluster', '?1');
  }
  
  // X-XSS-Protection (legacy, but still useful for older browsers)
  if (config.xssProtection) {
    res.setHeader('X-XSS-Protection', '1; mode=block');
  }
  
  // X-DNS-Prefetch-Control
  if (config.dnsPrefetchControl) {
    res.setHeader('X-DNS-Prefetch-Control', 'off');
  }
  
  // X-Permitted-Cross-Domain-Policies
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  
  // X-Download-Options (IE specific)
  res.setHeader('X-Download-Options', 'noopen');
}

/**
 * Express middleware for security headers
 */
export function securityHeaders(options?: SecurityHeadersOptions) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Skip security headers for specific paths if needed
    const skipPaths = ['/health', '/metrics', '/readinessz'];
    if (skipPaths.includes(req.path)) {
      return next();
    }
    
    applySecurityHeaders(res, options);
    next();
  };
}

/**
 * CSP violation report handler
 */
export function cspReportHandler() {
  return (req: Request, res: Response) => {
    if (req.body) {
      console.warn('[CSP Violation]', JSON.stringify(req.body, null, 2));
      
      // You can send to monitoring service here
      // Example: sendToMonitoring('csp-violation', req.body);
    }
    
    res.status(204).end();
  };
}

/**
 * Get security headers for specific environments
 */
export function getEnvironmentHeaders(): SecurityHeadersOptions {
  const isDevelopment = process.env.NODE_ENV === 'development';
  const isProduction = process.env.NODE_ENV === 'production';
  
  if (isDevelopment) {
    // More permissive in development
    return {
      ...defaultOptions,
      csp: {
        ...defaultOptions.csp,
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'http://localhost:*'],
        connectSrc: ["'self'", 'http://localhost:*', 'ws://localhost:*', 'https://*.vitejs.dev'],
      },
      hsts: undefined // Skip HSTS in development
    };
  }
  
  if (isProduction) {
    // Strictest settings for production
    return {
      ...defaultOptions,
      csp: {
        ...defaultOptions.csp,
        scriptSrc: ["'self'"], // Remove unsafe-inline and unsafe-eval
        upgradeInsecureRequests: true,
        blockAllMixedContent: true,
        reportUri: process.env.CSP_REPORT_URI
      }
    };
  }
  
  return defaultOptions;
}

/**
 * Nonce generator for inline scripts (if needed)
 */
export function generateNonce(): string {
  const crypto = require('crypto');
  return crypto.randomBytes(16).toString('base64');
}

/**
 * Add nonce to CSP for specific inline scripts
 */
export function addNonceToCSP(res: Response, nonce: string): void {
  const currentCSP = res.getHeader('Content-Security-Policy') as string;
  if (currentCSP && currentCSP.includes('script-src')) {
    const updatedCSP = currentCSP.replace(
      /script-src ([^;]+)/,
      `script-src $1 'nonce-${nonce}'`
    );
    res.setHeader('Content-Security-Policy', updatedCSP);
  }
}

// Export default middleware
export default securityHeaders;