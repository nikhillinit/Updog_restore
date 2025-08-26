/**
 * Content Security Policy Configuration
 * Centralized source of truth for CSP directives
 */

export interface CSPDirectives {
  defaultSrc: string[];
  scriptSrc: string[];
  styleSrc: string[];
  imgSrc: string[];
  connectSrc: string[];
  frameAncestors: string[];
  objectSrc: string[];
  mediaSrc: string[];
  fontSrc: string[];
  formAction: string[];
  baseUri: string[];
}

export const cspDirectives: CSPDirectives = {
  defaultSrc: ["'self'"],
  scriptSrc: [
    "'self'",
    // Add 'unsafe-inline' only for development - remove in production
    ...(process.env.NODE_ENV === 'development' ? ["'unsafe-inline'"] : [])
  ],
  styleSrc: [
    "'self'", 
    "'unsafe-inline'" // Required for many CSS-in-JS libraries
  ],
  imgSrc: [
    "'self'", 
    "data:", 
    "https:"
  ],
  connectSrc: [
    "'self'",
    // Add development ports if needed
    ...(process.env.NODE_ENV === 'development' ? [
      "ws://localhost:*",
      "http://localhost:*",
      "https://localhost:*"
    ] : [])
  ],
  frameAncestors: ["'none'"],
  objectSrc: ["'none'"],
  mediaSrc: ["'self'"],
  fontSrc: ["'self'", "https:", "data:"],
  formAction: ["'self'"],
  baseUri: ["'self'"]
};

/**
 * Convert CSP directives object to header value string
 */
export function buildCSPHeader(directives: CSPDirectives = cspDirectives): string {
  return Object.entries(directives)
    .map(([key, values]) => {
      // Convert camelCase to kebab-case
      const directive = key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
      return `${directive} ${values.join(' ')}`;
    })
    .join('; ');
}

/**
 * Security headers configuration
 */
export const securityHeaders = {
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: process.env.NODE_ENV === 'production'
  },
  referrerPolicy: 'strict-origin-when-cross-origin',
  xContentTypeOptions: 'nosniff',
  xFrameOptions: 'DENY',
  xXSSProtection: '1; mode=block'
};