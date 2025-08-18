/**
 * Security Setup Example
 * Shows how to integrate security headers into Express application
 */
import express, { Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { securityHeaders, cspReportHandler } from './security-headers';
import { getSecurityConfig } from '../config/security.config';

/**
 * Configure security middleware for Express app
 */
export function setupSecurity(app: Express): void {
  const config = getSecurityConfig();
  
  // 1. Basic security with Helmet (can be used alongside our custom headers)
  if (config.helmet.contentSecurityPolicy) {
    // Use our custom CSP instead of Helmet's
    app.use(helmet({
      contentSecurityPolicy: false, // We'll use our custom implementation
      crossOriginEmbedderPolicy: config.helmet.crossOriginEmbedderPolicy,
      crossOriginOpenerPolicy: config.helmet.crossOriginOpenerPolicy,
      crossOriginResourcePolicy: config.helmet.crossOriginResourcePolicy,
      dnsPrefetchControl: config.helmet.dnsPrefetchControl,
      frameguard: config.helmet.frameguard,
      hidePoweredBy: config.helmet.hidePoweredBy,
      hsts: false, // We'll use our custom implementation
      ieNoOpen: config.helmet.ieNoOpen,
      noSniff: config.helmet.noSniff,
      originAgentCluster: config.helmet.originAgentCluster,
      permittedCrossDomainPolicies: config.helmet.permittedCrossDomainPolicies,
      referrerPolicy: config.helmet.referrerPolicy,
      xssFilter: config.helmet.xssFilter
    }));
  }
  
  // 2. CORS configuration
  app.use(cors(config.cors));
  
  // 3. Custom security headers
  app.use(securityHeaders());
  
  // 4. CSP violation reporting endpoint
  if (config.csp.reportUri) {
    app.post(config.csp.reportUri, express.json({ type: 'application/csp-report' }), cspReportHandler());
  }
  
  // 5. Additional security middleware
  
  // Remove X-Powered-By header
  app.disable('x-powered-by');
  
  // Trust proxy for accurate IP addresses (important for rate limiting)
  if (process.env.TRUST_PROXY) {
    app.set('trust proxy', process.env.TRUST_PROXY);
  }
  
  console.log(`[Security] Configured for ${process.env.NODE_ENV || 'development'} environment`);
  console.log(`[Security] CSP: ${config.csp.enabled ? 'enabled' : 'disabled'} (report-only: ${config.csp.reportOnly})`);
  console.log(`[Security] HSTS: ${config.hsts.enabled ? 'enabled' : 'disabled'}`);
  console.log(`[Security] CORS origins: ${JSON.stringify(config.cors.origin)}`);
}

/**
 * Example Express application with security headers
 */
export function createSecureApp(): Express {
  const app = express();
  
  // Body parsing middleware (needed before security setup for CSP reports)
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  
  // Setup all security middleware
  setupSecurity(app);
  
  // Your application routes
  app.get('/', (req, res) => {
    res.json({ 
      message: 'Secure application',
      headers: res.getHeaders()
    });
  });
  
  // Health check endpoint (security headers are skipped for this)
  app.get('/health', (req, res) => {
    res.json({ status: 'healthy' });
  });
  
  return app;
}

/**
 * Standalone security header validation
 */
export function validateSecurityHeaders(headers: Record<string, string>): {
  valid: boolean;
  issues: string[];
  score: number;
} {
  const issues: string[] = [];
  let score = 100;
  
  // Check for required headers
  if (!headers['content-security-policy']) {
    issues.push('Missing Content-Security-Policy');
    score -= 25;
  }
  
  if (!headers['x-content-type-options'] || headers['x-content-type-options'] !== 'nosniff') {
    issues.push('Missing or incorrect X-Content-Type-Options');
    score -= 10;
  }
  
  if (!headers['x-frame-options']) {
    issues.push('Missing X-Frame-Options');
    score -= 15;
  }
  
  if (!headers['referrer-policy']) {
    issues.push('Missing Referrer-Policy');
    score -= 5;
  }
  
  // Check for HSTS in production
  if (process.env.NODE_ENV === 'production' && !headers['strict-transport-security']) {
    issues.push('Missing Strict-Transport-Security in production');
    score -= 20;
  }
  
  // Check for dangerous CSP directives
  const csp = headers['content-security-policy'];
  if (csp) {
    if (csp.includes("'unsafe-eval'") && process.env.NODE_ENV === 'production') {
      issues.push("CSP contains 'unsafe-eval' in production");
      score -= 15;
    }
    
    if (csp.includes("'unsafe-inline'") && csp.includes('script-src') && process.env.NODE_ENV === 'production') {
      issues.push("CSP script-src contains 'unsafe-inline' in production");
      score -= 10;
    }
    
    if (!csp.includes('frame-ancestors')) {
      issues.push('CSP missing frame-ancestors directive');
      score -= 5;
    }
    
    if (!csp.includes('base-uri')) {
      issues.push('CSP missing base-uri directive');
      score -= 5;
    }
  }
  
  return {
    valid: issues.length === 0,
    issues,
    score: Math.max(0, score)
  };
}

/**
 * Middleware to add security score to response headers (for debugging)
 */
export function securityScoreMiddleware() {
  return (req: any, res: any, next: any) => {
    const originalSend = res.send;
    
    res.send = function(data: any) {
      const headers = res.getHeaders();
      const validation = validateSecurityHeaders(headers as any);
      
      // Add security score as custom header (only in development)
      if (process.env.NODE_ENV === 'development') {
        res.setHeader('X-Security-Score', validation.score);
        
        if (validation.issues.length > 0) {
          console.warn('[Security] Issues detected:', validation.issues);
        }
      }
      
      return originalSend.call(this, data);
    };
    
    next();
  };
}

// Example usage:
if (require.main === module) {
  const app = createSecureApp();
  const PORT = process.env.PORT || 3000;
  
  app.listen(PORT, () => {
    console.log(`Secure server running on port ${PORT}`);
    console.log('Test security headers with:');
    console.log(`  curl -I http://localhost:${PORT}/`);
    console.log('');
    console.log('Check Mozilla Observatory compliance:');
    console.log('  https://observatory.mozilla.org/');
  });
}