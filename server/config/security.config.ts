/**
 * Security Configuration
 * Environment-specific security settings
 */

export interface SecurityConfig {
  csp: {
    enabled: boolean;
    reportOnly: boolean;
    reportUri?: string;
    nonce: boolean;
  };
  hsts: {
    enabled: boolean;
    maxAge: number;
    includeSubDomains: boolean;
    preload: boolean;
  };
  cors: {
    origin: string | string[] | boolean;
    credentials: boolean;
    methods: string[];
    allowedHeaders: string[];
    exposedHeaders: string[];
    maxAge: number;
  };
  rateLimit: {
    enabled: boolean;
    windowMs: number;
    max: number;
  };
  helmet: {
    contentSecurityPolicy: boolean;
    crossOriginEmbedderPolicy: boolean;
    crossOriginOpenerPolicy: boolean;
    crossOriginResourcePolicy: boolean;
    dnsPrefetchControl: boolean;
    frameguard: boolean;
    hidePoweredBy: boolean;
    hsts: boolean;
    ieNoOpen: boolean;
    noSniff: boolean;
    originAgentCluster: boolean;
    permittedCrossDomainPolicies: boolean;
    referrerPolicy: boolean;
    xssFilter: boolean;
  };
}

/**
 * Development security configuration
 * More permissive for local development
 */
export const developmentConfig: SecurityConfig = {
  csp: {
    enabled: true,
    reportOnly: true, // Report only in development
    nonce: false
  },
  hsts: {
    enabled: false, // Disabled in development
    maxAge: 0,
    includeSubDomains: false,
    preload: false
  },
  cors: {
    origin: ['http://localhost:3000', 'http://localhost:5173', 'http://localhost:5000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Health-Key', 'Idempotency-Key'],
    exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset', 'Retry-After'],
    maxAge: 86400
  },
  rateLimit: {
    enabled: false, // Disabled in development
    windowMs: 60000,
    max: 1000
  },
  helmet: {
    contentSecurityPolicy: true,
    crossOriginEmbedderPolicy: false, // Can break in development
    crossOriginOpenerPolicy: false,
    crossOriginResourcePolicy: false,
    dnsPrefetchControl: true,
    frameguard: true,
    hidePoweredBy: true,
    hsts: false,
    ieNoOpen: true,
    noSniff: true,
    originAgentCluster: true,
    permittedCrossDomainPolicies: false,
    referrerPolicy: true,
    xssFilter: true
  }
};

/**
 * Staging security configuration
 * Close to production but with debugging enabled
 */
export const stagingConfig: SecurityConfig = {
  csp: {
    enabled: true,
    reportOnly: false,
    reportUri: process.env.CSP_REPORT_URI,
    nonce: true
  },
  hsts: {
    enabled: true,
    maxAge: 86400, // 1 day for staging
    includeSubDomains: true,
    preload: false
  },
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || ['https://staging.example.com'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
    maxAge: 3600
  },
  rateLimit: {
    enabled: true,
    windowMs: 60000,
    max: 100
  },
  helmet: {
    contentSecurityPolicy: true,
    crossOriginEmbedderPolicy: true,
    crossOriginOpenerPolicy: true,
    crossOriginResourcePolicy: true,
    dnsPrefetchControl: true,
    frameguard: true,
    hidePoweredBy: true,
    hsts: true,
    ieNoOpen: true,
    noSniff: true,
    originAgentCluster: true,
    permittedCrossDomainPolicies: true,
    referrerPolicy: true,
    xssFilter: true
  }
};

/**
 * Production security configuration
 * Strictest security settings
 */
export const productionConfig: SecurityConfig = {
  csp: {
    enabled: true,
    reportOnly: false,
    reportUri: process.env.CSP_REPORT_URI,
    nonce: true
  },
  hsts: {
    enabled: true,
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true
  },
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || false,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: [],
    maxAge: 3600
  },
  rateLimit: {
    enabled: true,
    windowMs: 60000,
    max: 60
  },
  helmet: {
    contentSecurityPolicy: true,
    crossOriginEmbedderPolicy: true,
    crossOriginOpenerPolicy: true,
    crossOriginResourcePolicy: true,
    dnsPrefetchControl: true,
    frameguard: true,
    hidePoweredBy: true,
    hsts: true,
    ieNoOpen: true,
    noSniff: true,
    originAgentCluster: true,
    permittedCrossDomainPolicies: true,
    referrerPolicy: true,
    xssFilter: true
  }
};

/**
 * Get security configuration based on environment
 */
export function getSecurityConfig(): SecurityConfig {
  const env = process.env.NODE_ENV || 'development';
  
  switch (env) {
    case 'production':
      return productionConfig;
    case 'staging':
      return stagingConfig;
    case 'development':
    default:
      return developmentConfig;
  }
}

/**
 * CSP Directives for specific page types
 */
export const cspPresets = {
  // Standard application pages
  default: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'"], // May need for React
    imgSrc: ["'self'", 'data:', 'https:'],
    connectSrc: ["'self'"],
    fontSrc: ["'self'", 'data:'],
    objectSrc: ["'none'"],
    mediaSrc: ["'self'"],
    frameSrc: ["'none'"],
    frameAncestors: ["'none'"],
    formAction: ["'self'"],
    baseUri: ["'self'"]
  },
  
  // Pages with embedded content
  embed: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "'unsafe-inline'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", 'data:', 'https:'],
    connectSrc: ["'self'", 'https:'],
    fontSrc: ["'self'", 'data:', 'https:'],
    objectSrc: ["'self'"],
    mediaSrc: ["'self'", 'https:'],
    frameSrc: ["'self'", 'https:'],
    frameAncestors: ["'self'"],
    formAction: ["'self'"],
    baseUri: ["'self'"]
  },
  
  // API endpoints (minimal CSP)
  api: {
    defaultSrc: ["'none'"],
    frameAncestors: ["'none'"],
    formAction: ["'none'"],
    baseUri: ["'none'"]
  }
};

/**
 * Security monitoring configuration
 */
export const monitoringConfig = {
  // CSP violation reporting
  cspReporting: {
    enabled: process.env.CSP_REPORTING_ENABLED === 'true',
    endpoint: process.env.CSP_REPORT_URI || '/api/csp-report',
    sampleRate: parseFloat(process.env.CSP_REPORT_SAMPLE_RATE || '1.0')
  },
  
  // Security metrics
  metrics: {
    trackCspViolations: true,
    trackFailedAuth: true,
    trackRateLimits: true,
    trackSuspiciousActivity: true
  },
  
  // Alerting thresholds
  alerts: {
    cspViolationsPerMinute: 10,
    failedAuthPerMinute: 20,
    rateLimitHitsPerMinute: 100,
    suspiciousRequestsPerMinute: 5
  }
};

export default getSecurityConfig();