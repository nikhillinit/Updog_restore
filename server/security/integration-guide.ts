/**
 * Security Integration Guide
 *
 * Complete implementation guide showing how to integrate all security components
 * into the Updog VC fund modeling platform for production deployment.
 */

import type express from 'express';
type Application = ReturnType<typeof express>;
import type { Request, Response, NextFunction } from 'express';

// Security middleware imports
import {
  securityHeaders,
  generalRateLimit,
  strictRateLimit,
  monteCarloRateLimit,
  inputSanitization,
  suspiciousActivityDetection,
  securityEventLogger,
  initializeSecurityMiddleware
} from '../middleware/security.js';

import {
  enhancedAuditMiddleware,
  financialAuditMiddleware
} from '../middleware/enhanced-audit.js';

import {
  requestLogger,
  errorLogger,
  logMonteCarloOperation,
  logFinancialOperation
} from '../utils/logger.js';

import {
  createSanitizationMiddleware,
  sanitizeMonteCarloConfig,
  fieldSanitizers
} from '../utils/input-sanitization.js';

// Validation schemas
import {
  MonteCarloSchemas,
  FinancialSchemas,
  SecuritySchemas
} from '@shared/validation/monte-carlo-schemas';

/**
 * =============================================================================
 * SECURITY MIDDLEWARE STACK CONFIGURATION
 * =============================================================================
 */

export async function setupSecurityMiddleware(app: Application): Promise<void> {
  console.log('🔒 Initializing security middleware...');

  // Initialize Redis connection for rate limiting
  await initializeSecurityMiddleware();

  // 1. Basic security headers (apply to all routes)
  app.use(securityHeaders);

  // 2. Request logging with correlation IDs
  app.use(requestLogger);

  // 3. General rate limiting
  app.use(generalRateLimit);

  // 4. Input sanitization for all requests
  app.use(inputSanitization);

  // 5. Suspicious activity detection
  app.use(suspiciousActivityDetection);

  // 6. Security event logging
  app.use(securityEventLogger);

  // 7. Enhanced audit logging for all requests
  app.use(enhancedAuditMiddleware({
    includeRequestBody: true,
    includeResponseBody: false, // Too much data for most endpoints
    encryptSensitiveData: true,
    retentionDays: 2555 // 7 years for financial compliance
  }));

  // 8. Financial-specific audit logging
  app.use(financialAuditMiddleware);

  // 9. Error logging middleware (should be last)
  app.use(errorLogger);

  console.log('✅ Security middleware initialized');
}

/**
 * =============================================================================
 * ROUTE-SPECIFIC SECURITY CONFIGURATION
 * =============================================================================
 */

// High-security routes (admin, auth, financial operations)
export const highSecurityStack = [
  strictRateLimit,
  createSanitizationMiddleware({
    strictMode: true,
    customSanitizers: {
      fundId: fieldSanitizers.fundName,
      amount: fieldSanitizers.amount,
      email: fieldSanitizers.email
    }
  })
];

// Monte Carlo specific security
export const monteCarloSecurityStack = [
  monteCarloRateLimit,
  createSanitizationMiddleware({
    strictMode: true,
    customSanitizers: {
      config: sanitizeMonteCarloConfig
    }
  })
];

/**
 * =============================================================================
 * VALIDATION MIDDLEWARE CREATORS
 * =============================================================================
 */

export function createValidationMiddleware<T>(schema: any) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const validation = schema.safeParse(req.body);

      if (!validation.success) {
        const errors = validation.error.errors.map((err: any) => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code
        }));

        return res.status(400).json({
          error: 'Validation failed',
          details: errors
        });
      }

      // Replace request body with validated data
      req.body = validation.data;
      next();

    } catch (error) {
      return res.status(500).json({
        error: 'Validation error',
        message: 'Internal validation error occurred'
      });
    }
  };
}

/**
 * =============================================================================
 * EXAMPLE ROUTE IMPLEMENTATIONS
 * =============================================================================
 */

export function setupSecureRoutes(app: Application): void {
  console.log('🛡️  Setting up secure routes...');

  // Monte Carlo simulation endpoint with full security
  app.post('/api/monte-carlo/simulate',
    ...monteCarloSecurityStack,
    createValidationMiddleware(MonteCarloSchemas.Request),
    async (req: Request, res: Response) => {
      try {
        const { config, marketEnvironment, userContext } = req.body;

        // Log the operation start
        logMonteCarloOperation('Simulation request received', config.fundId, {
          runs: config.runs,
          timeHorizonYears: config.timeHorizonYears,
          userAgent: req['get']('User-Agent'),
          ipAddress: req.ip
        });

        // Import Monte Carlo engine dynamically to avoid circular dependencies
        const { monteCarloEngine } = await import('../services/monte-carlo-engine.js');

        // Run simulation with validated inputs
        const results = await monteCarloEngine.runPortfolioSimulation(config);

        // Log successful completion
        logFinancialOperation('Monte Carlo simulation completed', config.fundId, undefined, {
          simulationId: results.simulationId,
          executionTimeMs: results.executionTimeMs,
          scenarios: config.runs
        });

        res.json(results);

      } catch (error) {
        console.error('Monte Carlo simulation failed:', error);
        res.status(500).json({
          error: 'Simulation failed',
          message: 'An error occurred during simulation'
        });
      }
    }
  );

  // Fund creation endpoint with high security
  app.post('/api/funds',
    ...highSecurityStack,
    createValidationMiddleware(FinancialSchemas.FundBasics),
    async (req: Request, res: Response) => {
      try {
        const fundData = req.body;

        // Log fund creation attempt
        logFinancialOperation('Fund creation requested', 0, fundData.size, {
          fundName: fundData.name,
          vintageYear: fundData.vintageYear
        });

        // Implementation would create fund in database
        // const fund = await createFund(fundData);

        res.status(201).json({
          message: 'Fund created successfully',
          // fund
        });

      } catch (error) {
        console.error('Fund creation failed:', error);
        res.status(500).json({
          error: 'Fund creation failed',
          message: 'An error occurred during fund creation'
        });
      }
    }
  );

  // Investment entry endpoint
  app.post('/api/investments',
    ...highSecurityStack,
    createValidationMiddleware(FinancialSchemas.Investment),
    async (req: Request, res: Response) => {
      try {
        const investmentData = req.body;

        logFinancialOperation('Investment entry', investmentData.fundId, investmentData.investmentAmount, {
          companyName: investmentData.companyName,
          sector: investmentData.sector,
          stage: investmentData.stage
        });

        // Implementation would save investment
        // const investment = await saveInvestment(investmentData);

        res.status(201).json({
          message: 'Investment recorded successfully',
          // investment
        });

      } catch (error) {
        console.error('Investment entry failed:', error);
        res.status(500).json({
          error: 'Investment entry failed',
          message: 'An error occurred recording the investment'
        });
      }
    }
  );

  // Search endpoint with input validation
  app['get']('/api/search',
    createValidationMiddleware(SecuritySchemas.SearchQuery),
    async (req: Request, res: Response) => {
      try {
        const { query, filters, sortBy, sortOrder, page, limit } = req.query;

        // Implementation would perform search
        // const results = await searchDatabase(query, filters, { sortBy, sortOrder, page, limit });

        res.json({
          results: [],
          pagination: { page, limit },
          total: 0
        });

      } catch (error) {
        console.error('Search failed:', error);
        res.status(500).json({
          error: 'Search failed',
          message: 'An error occurred during search'
        });
      }
    }
  );

  console.log('✅ Secure routes configured');
}

/**
 * =============================================================================
 * SECURITY MONITORING AND HEALTH CHECKS
 * =============================================================================
 */

export function setupSecurityMonitoring(app: Application): void {
  // Security health check endpoint
  app['get']('/api/security/health', (req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      security: {
        headersEnabled: true,
        rateLimitingEnabled: true,
        auditLoggingEnabled: true,
        inputSanitizationEnabled: true,
        encryptionEnabled: !!process.env['AUDIT_ENCRYPTION_KEY']
      }
    });
  });

  // Security metrics endpoint (protected)
  app['get']('/api/security/metrics',
    strictRateLimit,
    (req: Request, res: Response) => {
      // This would return security metrics in production
      res.json({
        message: 'Security metrics endpoint',
        note: 'Implementation would return actual security metrics'
      });
    }
  );
}

/**
 * =============================================================================
 * ENVIRONMENT VALIDATION
 * =============================================================================
 */

export function validateSecurityEnvironment(): void {
  const requiredEnvVars = [
    'DATABASE_URL',
    'AUDIT_ENCRYPTION_KEY',
    'LOG_LEVEL'
  ];

  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

  if (missingVars.length > 0) {
    console.error('❌ Missing required environment variables:', missingVars);
    console.error('Please check your .env file and ensure all required variables are set');
    process.exit(1);
  }

  // Validate encryption key
  if (process.env['AUDIT_ENCRYPTION_KEY'] && process.env['AUDIT_ENCRYPTION_KEY'].length < 32) {
    console.error('❌ AUDIT_ENCRYPTION_KEY must be at least 32 characters long');
    process.exit(1);
  }

  console.log('✅ Security environment validation passed');
}

/**
 * =============================================================================
 * COMPLETE SECURITY SETUP
 * =============================================================================
 */

export async function initializeCompleteSecurity(app: Application): Promise<void> {
  console.log('🚀 Initializing complete security system...');

  // 1. Validate environment
  validateSecurityEnvironment();

  // 2. Setup security middleware
  await setupSecurityMiddleware(app);

  // 3. Setup secure routes
  setupSecureRoutes(app);

  // 4. Setup security monitoring
  setupSecurityMonitoring(app);

  console.log('🔒 Complete security system initialized successfully');
  console.log('   - Structured logging enabled');
  console.log('   - Input validation and sanitization active');
  console.log('   - Rate limiting configured');
  console.log('   - Audit logging with encryption enabled');
  console.log('   - Security headers applied');
  console.log('   - Suspicious activity detection active');
}

/**
 * =============================================================================
 * USAGE EXAMPLE
 * =============================================================================
 */

/*
// In your main server file (server.ts or app.ts):

import express from 'express';
import { initializeCompleteSecurity } from './security/integration-guide.js';

const app = express();

// Basic Express setup
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize complete security system
await initializeCompleteSecurity(app);

// Your other routes go here...

// Start server
const port = process.env['PORT'] || 5000;
app.listen(port, () => {
  console.log(`🚀 Secure server running on port ${port}`);
});
*/

export default {
  setupSecurityMiddleware,
  setupSecureRoutes,
  setupSecurityMonitoring,
  validateSecurityEnvironment,
  initializeCompleteSecurity,
  highSecurityStack,
  monteCarloSecurityStack,
  createValidationMiddleware
};