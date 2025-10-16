#!/usr/bin/env tsx
/**
 * AI Security Validation Script
 *
 * Validates the security implementation for the Multi-Agent Workflow system.
 * Run this to verify training opt-out, rate limiting, and audit trail setup.
 *
 * Usage:
 *   npm run validate:ai-security
 *   # or
 *   npx tsx scripts/validate-ai-security.ts
 */

import {
  getAIProvidersConfig,
  getProviderConfig,
  isProviderAvailable,
  validateTrainingOptOut,
  type ProviderName
} from '../server/config/ai-providers.js';
import { createAuditEntry, validateAuditEntry, calculateUsageStats } from '../server/lib/ai-audit.js';

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

function success(msg: string) {
  console.log(`${colors.green}✓${colors.reset} ${msg}`);
}

function error(msg: string) {
  console.log(`${colors.red}✗${colors.reset} ${msg}`);
}

function warning(msg: string) {
  console.log(`${colors.yellow}⚠${colors.reset} ${msg}`);
}

function info(msg: string) {
  console.log(`${colors.blue}ℹ${colors.reset} ${msg}`);
}

function section(title: string) {
  console.log(`\n${colors.bright}${title}${colors.reset}`);
  console.log('='.repeat(title.length));
}

let hasErrors = false;

// ============================================================================
// 1. Validate AI Provider Configuration
// ============================================================================

section('1. AI Provider Configuration');

try {
  const config = getAIProvidersConfig();
  success('AI provider configuration loaded');

  // Check immutability
  try {
    (config as any).security.proposalRateLimit.maxPerHour = 999;
    error('Configuration is NOT immutable (security risk!)');
    hasErrors = true;
  } catch (e) {
    success('Configuration is immutable (read-only)');
  }

  // Validate rate limit settings
  if (config.security.proposalRateLimit.maxPerHour === 10) {
    success('Proposal rate limit: 10 per hour');
  } else {
    error(`Proposal rate limit incorrect: ${config.security.proposalRateLimit.maxPerHour}`);
    hasErrors = true;
  }

  // Validate retention period (7 years = 2555 days)
  if (config.security.auditRetention.retentionDays === 2555) {
    success('Audit retention: 2555 days (7 years)');
  } else {
    warning(`Audit retention: ${config.security.auditRetention.retentionDays} days (expected 2555)`);
  }
} catch (err) {
  error(`Failed to load configuration: ${err}`);
  hasErrors = true;
}

// ============================================================================
// 2. Validate Training Opt-Out
// ============================================================================

section('2. Training Opt-Out Verification');

try {
  const validation = validateTrainingOptOut();
  let allVerified = true;

  for (const [providerName, result] of Object.entries(validation)) {
    if (result.verified) {
      success(`${providerName}: ${result.message}`);
    } else {
      error(`${providerName}: ${result.message}`);
      allVerified = false;
      hasErrors = true;
    }
  }

  if (allVerified) {
    success('All providers have verified training opt-out');
  }
} catch (err) {
  error(`Training opt-out validation failed: ${err}`);
  hasErrors = true;
}

// ============================================================================
// 3. Validate Provider Availability
// ============================================================================

section('3. Provider Availability');

const providerNames: ProviderName[] = ['openai', 'anthropic', 'deepseek', 'gemini'];

for (const name of providerNames) {
  try {
    const config = getProviderConfig(name);
    if (!config) {
      error(`${name}: Configuration not found`);
      hasErrors = true;
      continue;
    }

    const available = isProviderAvailable(name);
    if (available) {
      success(`${name}: Available (${config.defaultModel})`);
    } else {
      warning(`${name}: Not available (API key not configured)`);
      info(`  Set ${config.apiKeyEnvVar} environment variable to enable`);
    }

    // Validate TOS URL
    if (config.trainingOptOut.tosUrl.startsWith('https://')) {
      success(`${name}: TOS URL is HTTPS`);
    } else {
      error(`${name}: TOS URL is not HTTPS (security risk!)`);
      hasErrors = true;
    }

    // Validate verification date
    const verifiedDate = new Date(config.trainingOptOut.verifiedDate);
    if (!isNaN(verifiedDate.getTime())) {
      const daysSince = Math.floor((Date.now() - verifiedDate.getTime()) / (1000 * 60 * 60 * 24));
      if (daysSince > 90) {
        warning(`${name}: TOS verified ${daysSince} days ago (recommend quarterly review)`);
      } else {
        success(`${name}: TOS verified ${daysSince} days ago`);
      }
    } else {
      error(`${name}: Invalid verification date: ${config.trainingOptOut.verifiedDate}`);
      hasErrors = true;
    }
  } catch (err) {
    error(`${name}: Validation error - ${err}`);
    hasErrors = true;
  }
}

// ============================================================================
// 4. Validate Audit Utilities
// ============================================================================

section('4. Audit Trail Utilities');

try {
  // Test createAuditEntry
  const testEntry = createAuditEntry({
    requestId: 'test-123',
    providerName: 'openai',
    modelName: 'gpt-4o-mini',
    prompt: 'Test prompt for validation'.repeat(100), // Long prompt to test truncation
    response: 'Test response'.repeat(100), // Long response
    proposalType: 'fund_strategy',
    userId: 1,
    fundId: 1,
    latencyMs: 1500,
    providerLatencyMs: 1200,
    costUsd: 0.05,
    inputCostUsd: 0.02,
    outputCostUsd: 0.03,
    promptTokens: 100,
    responseTokens: 200
  });

  success('createAuditEntry() works');

  // Validate truncation
  if (testEntry.promptTruncated.length <= 1003) { // 1000 + "..."
    success('Prompt truncation working (≤1003 chars)');
  } else {
    error(`Prompt truncation failed: ${testEntry.promptTruncated.length} chars`);
    hasErrors = true;
  }

  // Validate hashing
  if (testEntry.promptHash.match(/^[a-f0-9]{64}$/)) {
    success('SHA-256 hashing working');
  } else {
    error(`Invalid hash format: ${testEntry.promptHash}`);
    hasErrors = true;
  }

  // Validate retention date (should be ~7 years from now)
  if (testEntry.retentionUntil) {
    const retention = new Date(testEntry.retentionUntil);
    const yearsFromNow = (retention.getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 365);
    if (yearsFromNow >= 6.9 && yearsFromNow <= 7.1) {
      success(`Retention date set to ~7 years from now (${yearsFromNow.toFixed(1)} years)`);
    } else {
      warning(`Retention date is ${yearsFromNow.toFixed(1)} years from now (expected ~7)`);
    }
  } else {
    error('Retention date not set');
    hasErrors = true;
  }

  // Validate entry
  const validation = validateAuditEntry(testEntry);
  if (validation.valid) {
    success('Audit entry validation passed');
  } else {
    error(`Audit entry validation failed: ${validation.errors.join(', ')}`);
    hasErrors = true;
  }

  // Test usage stats calculation
  const stats = calculateUsageStats([testEntry]);
  if (stats.totalRequests === 1 && stats.successfulRequests === 1) {
    success('Usage statistics calculation working');
  } else {
    error('Usage statistics calculation failed');
    hasErrors = true;
  }
} catch (err) {
  error(`Audit utilities validation failed: ${err}`);
  hasErrors = true;
}

// ============================================================================
// 5. Security Checklist
// ============================================================================

section('5. Security Checklist');

const checklist = [
  {
    item: 'Training opt-out verified for all providers',
    check: () => {
      const validation = validateTrainingOptOut();
      return Object.values(validation).every(v => v.verified);
    }
  },
  {
    item: 'Provider configuration is immutable',
    check: () => {
      try {
        const config = getAIProvidersConfig();
        (config as any).providers.openai.enabled = false;
        return false; // Should have thrown error
      } catch {
        return true; // Good - config is frozen
      }
    }
  },
  {
    item: 'Rate limiting configured (10/hour)',
    check: () => {
      const config = getAIProvidersConfig();
      return config.security.proposalRateLimit.maxPerHour === 10;
    }
  },
  {
    item: 'Audit retention set to 7 years',
    check: () => {
      const config = getAIProvidersConfig();
      return config.security.auditRetention.retentionDays === 2555;
    }
  },
  {
    item: 'All TOS URLs use HTTPS',
    check: () => {
      const config = getAIProvidersConfig();
      return Object.values(config.providers).every(
        p => p.trainingOptOut.tosUrl.startsWith('https://')
      );
    }
  },
  {
    item: 'Audit entry creation works',
    check: () => {
      try {
        const entry = createAuditEntry({
          requestId: 'test',
          providerName: 'openai',
          modelName: 'test',
          prompt: 'test',
          proposalType: 'test'
        });
        return validateAuditEntry(entry).valid;
      } catch {
        return false;
      }
    }
  }
];

let passedChecks = 0;
for (const { item, check } of checklist) {
  try {
    if (check()) {
      success(item);
      passedChecks++;
    } else {
      error(item);
      hasErrors = true;
    }
  } catch (err) {
    error(`${item} - Error: ${err}`);
    hasErrors = true;
  }
}

// ============================================================================
// Summary
// ============================================================================

section('Summary');

console.log(`\nChecks passed: ${passedChecks}/${checklist.length}`);

if (hasErrors) {
  error('\nSecurity validation FAILED - please review errors above');
  process.exit(1);
} else {
  success('\nSecurity validation PASSED - all checks successful! 🔒');
  console.log('\nNext steps:');
  info('1. Apply rate limiter to proposal routes');
  info('2. Integrate audit logging in AI call handlers');
  info('3. Run database migrations for audit tables');
  info('4. Test end-to-end audit logging');
  process.exit(0);
}
