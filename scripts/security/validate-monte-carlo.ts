#!/usr/bin/env tsx
/**
 * Security Script: Monte Carlo Validation
 *
 * Validates Monte Carlo simulation security and input validation:
 * - Input parameter validation
 * - Rate limiting verification
 * - Security header checks
 * - Audit logging verification
 * - Performance monitoring
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { z } from 'zod';

interface ValidationResult {
  category: string;
  test: string;
  status: 'pass' | 'fail' | 'warning';
  message: string;
  recommendation?: string;
}

const results: ValidationResult[] = [];

function addResult(category: string, test: string, status: 'pass' | 'fail' | 'warning', message: string, recommendation?: string) {
  results.push({ category, test, status, message, recommendation });
}

// =============================================================================
// VALIDATION TESTS
// =============================================================================

function validateSchemaFiles(): void {
  console.log('🔍 Validating Zod schema files...');

  const schemaPath = join(process.cwd(), 'shared/validation/monte-carlo-schemas.ts');
  if (!existsSync(schemaPath)) {
    addResult('Schemas', 'Monte Carlo Schema File', 'fail',
      'Monte Carlo validation schemas not found',
      'Create comprehensive Zod schemas for Monte Carlo inputs');
    return;
  }

  try {
    const schemaContent = readFileSync(schemaPath, 'utf-8');

    // Check for required schemas
    const requiredSchemas = [
      'SimulationConfigSchema',
      'MarketEnvironmentSchema',
      'PortfolioInputsSchema',
      'DistributionParametersSchema',
      'MonteCarloRequestSchema',
      'MonteCarloResponseSchema'
    ];

    const missingSchemas = requiredSchemas.filter(schema =>
      !schemaContent.includes(schema)
    );

    if (missingSchemas.length > 0) {
      addResult('Schemas', 'Required Schemas', 'fail',
        `Missing schemas: ${missingSchemas.join(', ')}`,
        'Implement all required Zod validation schemas');
    } else {
      addResult('Schemas', 'Required Schemas', 'pass',
        'All required Monte Carlo schemas are present');
    }

    // Check for security validations
    const securityChecks = [
      'positive().finite()', // Positive number validation
      'min(0).max(', // Range validation
      'uuid()', // UUID validation
      'trim()', // String trimming
      '.strict()' // Strict object validation
    ];

    const missingSecurityChecks = securityChecks.filter(check =>
      !schemaContent.includes(check)
    );

    if (missingSecurityChecks.length > 0) {
      addResult('Schemas', 'Security Validations', 'warning',
        `Missing security validations: ${missingSecurityChecks.join(', ')}`,
        'Add comprehensive input validation and sanitization');
    } else {
      addResult('Schemas', 'Security Validations', 'pass',
        'Security validations are properly implemented');
    }

  } catch (error) {
    addResult('Schemas', 'Schema File Reading', 'fail',
      'Failed to read schema file',
      'Check file permissions and syntax');
  }
}

function validateSecurityMiddleware(): void {
  console.log('🔍 Validating security middleware...');

  const securityPath = join(process.cwd(), 'server/middleware/security.ts');
  if (!existsSync(securityPath)) {
    addResult('Security', 'Security Middleware', 'fail',
      'Security middleware file not found',
      'Create comprehensive security middleware');
    return;
  }

  try {
    const securityContent = readFileSync(securityPath, 'utf-8');

    // Check for required middleware
    const requiredMiddleware = [
      'securityHeaders',
      'generalRateLimit',
      'strictRateLimit',
      'monteCarloRateLimit',
      'inputSanitization',
      'suspiciousActivityDetection',
      'ipFilter'
    ];

    const missingMiddleware = requiredMiddleware.filter(middleware =>
      !securityContent.includes(middleware)
    );

    if (missingMiddleware.length > 0) {
      addResult('Security', 'Security Middleware Functions', 'fail',
        `Missing middleware: ${missingMiddleware.join(', ')}`,
        'Implement all required security middleware functions');
    } else {
      addResult('Security', 'Security Middleware Functions', 'pass',
        'All required security middleware functions are present');
    }

    // Check for rate limiting configuration
    if (securityContent.includes('monteCarloRateLimit')) {
      addResult('Security', 'Monte Carlo Rate Limiting', 'pass',
        'Monte Carlo specific rate limiting is implemented');
    } else {
      addResult('Security', 'Monte Carlo Rate Limiting', 'fail',
        'No Monte Carlo specific rate limiting found',
        'Implement strict rate limiting for compute-intensive operations');
    }

    // Check for security headers
    const securityHeaders = [
      'contentSecurityPolicy',
      'hsts',
      'frameguard',
      'noSniff',
      'xssFilter'
    ];

    const missingHeaders = securityHeaders.filter(header =>
      !securityContent.includes(header)
    );

    if (missingHeaders.length > 0) {
      addResult('Security', 'Security Headers', 'warning',
        `Missing headers: ${missingHeaders.join(', ')}`,
        'Implement comprehensive security headers');
    } else {
      addResult('Security', 'Security Headers', 'pass',
        'Security headers are properly configured');
    }

  } catch (error) {
    addResult('Security', 'Security Middleware Reading', 'fail',
      'Failed to read security middleware file');
  }
}

function validateAuditLogging(): void {
  console.log('🔍 Validating audit logging...');

  const auditPath = join(process.cwd(), 'server/middleware/enhanced-audit.ts');
  if (!existsSync(auditPath)) {
    addResult('Audit', 'Audit Middleware', 'fail',
      'Enhanced audit middleware not found',
      'Create comprehensive audit logging system');
    return;
  }

  try {
    const auditContent = readFileSync(auditPath, 'utf-8');

    // Check for financial audit functions
    const auditFeatures = [
      'enhancedAuditMiddleware',
      'financialAuditMiddleware',
      'AuditEncryption',
      'logFinancialOperation',
      'generateAuditHash'
    ];

    const missingFeatures = auditFeatures.filter(feature =>
      !auditContent.includes(feature)
    );

    if (missingFeatures.length > 0) {
      addResult('Audit', 'Audit Features', 'fail',
        `Missing audit features: ${missingFeatures.join(', ')}`,
        'Implement comprehensive audit logging features');
    } else {
      addResult('Audit', 'Audit Features', 'pass',
        'All required audit features are present');
    }

    // Check for encryption
    if (auditContent.includes('AuditEncryption') && auditContent.includes('encrypt')) {
      addResult('Audit', 'Data Encryption', 'pass',
        'Audit data encryption is implemented');
    } else {
      addResult('Audit', 'Data Encryption', 'warning',
        'Audit data encryption may not be implemented',
        'Implement encryption for sensitive audit data');
    }

  } catch (error) {
    addResult('Audit', 'Audit Middleware Reading', 'fail',
      'Failed to read audit middleware file');
  }
}

function validateInputSanitization(): void {
  console.log('🔍 Validating input sanitization...');

  const sanitizationPath = join(process.cwd(), 'server/utils/input-sanitization.ts');
  if (!existsSync(sanitizationPath)) {
    addResult('Sanitization', 'Input Sanitization', 'fail',
      'Input sanitization utilities not found',
      'Create comprehensive input sanitization utilities');
    return;
  }

  try {
    const sanitizationContent = readFileSync(sanitizationPath, 'utf-8');

    // Check for sanitization functions
    const sanitizationFunctions = [
      'sanitizeString',
      'sanitizeNumber',
      'sanitizeFinancialAmount',
      'sanitizePercentage',
      'sanitizeMonteCarloConfig',
      'sanitizeDistributionParams'
    ];

    const missingSanitization = sanitizationFunctions.filter(func =>
      !sanitizationContent.includes(func)
    );

    if (missingSanitization.length > 0) {
      addResult('Sanitization', 'Sanitization Functions', 'fail',
        `Missing functions: ${missingSanitization.join(', ')}`,
        'Implement all required sanitization functions');
    } else {
      addResult('Sanitization', 'Sanitization Functions', 'pass',
        'All required sanitization functions are present');
    }

    // Check for dangerous pattern detection
    if (sanitizationContent.includes('DANGEROUS_PATTERNS')) {
      addResult('Sanitization', 'Dangerous Pattern Detection', 'pass',
        'Dangerous pattern detection is implemented');
    } else {
      addResult('Sanitization', 'Dangerous Pattern Detection', 'warning',
        'Dangerous pattern detection may be missing',
        'Implement comprehensive dangerous pattern detection');
    }

  } catch (error) {
    addResult('Sanitization', 'Sanitization Reading', 'fail',
      'Failed to read sanitization file');
  }
}

function validateMonteCarloEngine(): void {
  console.log('🔍 Validating Monte Carlo engine security...');

  const enginePath = join(process.cwd(), 'server/services/monte-carlo-engine.ts');
  if (!existsSync(enginePath)) {
    addResult('Engine', 'Monte Carlo Engine', 'fail',
      'Monte Carlo engine not found');
    return;
  }

  try {
    const engineContent = readFileSync(enginePath, 'utf-8');

    // Check for structured logging
    if (engineContent.includes('logMonteCarloOperation') ||
        engineContent.includes('logMonteCarloError')) {
      addResult('Engine', 'Structured Logging', 'pass',
        'Structured logging is implemented in Monte Carlo engine');
    } else {
      addResult('Engine', 'Structured Logging', 'fail',
        'No structured logging found in Monte Carlo engine',
        'Replace console.log with structured Winston logging');
    }

    // Check for input validation
    if (engineContent.includes('validateConfig') ||
        engineContent.includes('validation')) {
      addResult('Engine', 'Input Validation', 'pass',
        'Input validation is present in Monte Carlo engine');
    } else {
      addResult('Engine', 'Input Validation', 'warning',
        'Input validation may be insufficient',
        'Add comprehensive input validation using Zod schemas');
    }

    // Check for performance monitoring
    if (engineContent.includes('PerformanceMonitor') ||
        engineContent.includes('executionTimeMs')) {
      addResult('Engine', 'Performance Monitoring', 'pass',
        'Performance monitoring is implemented');
    } else {
      addResult('Engine', 'Performance Monitoring', 'warning',
        'Performance monitoring may be missing',
        'Add performance monitoring for security and optimization');
    }

    // Check for console.log statements
    if (engineContent.includes('console.log')) {
      addResult('Engine', 'Console Log Statements', 'fail',
        'Console.log statements found in Monte Carlo engine',
        'Replace all console.log with structured logging');
    } else {
      addResult('Engine', 'Console Log Statements', 'pass',
        'No console.log statements found');
    }

  } catch (error) {
    addResult('Engine', 'Engine File Reading', 'fail',
      'Failed to read Monte Carlo engine file');
  }
}

function validateEnvironmentSecurity(): void {
  console.log('🔍 Validating environment security...');

  // Check for .env.example
  const envExamplePath = join(process.cwd(), '.env.example');
  if (existsSync(envExamplePath)) {
    try {
      const envContent = readFileSync(envExamplePath, 'utf-8');

      const requiredEnvVars = [
        'AUDIT_ENCRYPTION_KEY',
        'DATABASE_URL',
        'REDIS_URL',
        'LOG_LEVEL'
      ];

      const missingEnvVars = requiredEnvVars.filter(envVar =>
        !envContent.includes(envVar)
      );

      if (missingEnvVars.length > 0) {
        addResult('Environment', 'Required Environment Variables', 'warning',
          `Missing env vars in .env.example: ${missingEnvVars.join(', ')}`,
          'Add all required environment variables to .env.example');
      } else {
        addResult('Environment', 'Required Environment Variables', 'pass',
          'All required environment variables are documented');
      }

    } catch (error) {
      addResult('Environment', 'Environment File Reading', 'fail',
        'Failed to read .env.example file');
    }
  } else {
    addResult('Environment', 'Environment Example File', 'warning',
      '.env.example file not found',
      'Create .env.example with required environment variables');
  }
}

// =============================================================================
// REPORT GENERATION
// =============================================================================

function generateReport(): void {
  const passCount = results.filter(r => r.status === 'pass').length;
  const failCount = results.filter(r => r.status === 'fail').length;
  const warningCount = results.filter(r => r.status === 'warning').length;

  console.log();
  console.log('='.repeat(80));
  console.log('MONTE CARLO SECURITY VALIDATION REPORT');
  console.log('='.repeat(80));
  console.log();

  console.log(`Total Tests: ${results.length}`);
  console.log(`✅ Passed: ${passCount}`);
  console.log(`❌ Failed: ${failCount}`);
  console.log(`⚠️  Warnings: ${warningCount}`);
  console.log();

  // Group results by category
  const categories = [...new Set(results.map(r => r.category))];

  categories.forEach(category => {
    const categoryResults = results.filter(r => r.category === category);
    const categoryFails = categoryResults.filter(r => r.status === 'fail').length;
    const categoryWarnings = categoryResults.filter(r => r.status === 'warning').length;

    console.log(`📋 ${category.toUpperCase()}`);
    console.log('-'.repeat(50));

    categoryResults.forEach(result => {
      const icon = result.status === 'pass' ? '✅' :
                   result.status === 'fail' ? '❌' : '⚠️';
      console.log(`${icon} ${result.test}: ${result.message}`);

      if (result.recommendation) {
        console.log(`   💡 ${result.recommendation}`);
      }
    });
    console.log();
  });

  console.log('🎯 SECURITY SCORE');
  console.log('-'.repeat(50));
  const score = Math.round((passCount / results.length) * 100);
  console.log(`Security Score: ${score}%`);

  if (score >= 90) {
    console.log('🏆 Excellent security implementation!');
  } else if (score >= 75) {
    console.log('👍 Good security implementation with room for improvement');
  } else if (score >= 60) {
    console.log('⚠️  Moderate security implementation - address warnings');
  } else {
    console.log('🚨 Poor security implementation - immediate action required');
  }

  console.log();
  console.log('🔧 NEXT STEPS:');
  console.log('-'.repeat(50));

  if (failCount > 0) {
    console.log('1. Address all failed security tests immediately');
    console.log('2. Run security validation again to verify fixes');
  }

  if (warningCount > 0) {
    console.log('3. Review and address security warnings');
  }

  console.log('4. Run: npm run security:full (for complete security audit)');
  console.log('5. Monitor security logs in production');
  console.log();

  // Exit with appropriate code
  if (failCount > 0) {
    console.log('❌ SECURITY VALIDATION FAILED');
    process.exit(1);
  } else if (warningCount > 0) {
    console.log('⚠️  SECURITY VALIDATION PASSED WITH WARNINGS');
    process.exit(0);
  } else {
    console.log('✅ SECURITY VALIDATION PASSED');
    process.exit(0);
  }
}

// =============================================================================
// MAIN EXECUTION
// =============================================================================

function main(): void {
  console.log('🔒 Starting Monte Carlo Security Validation...');
  console.log();

  validateSchemaFiles();
  validateSecurityMiddleware();
  validateAuditLogging();
  validateInputSanitization();
  validateMonteCarloEngine();
  validateEnvironmentSecurity();

  generateReport();
}

// Run main function if this is the entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { validateSchemaFiles, validateSecurityMiddleware, ValidationResult };