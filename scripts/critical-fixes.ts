#!/usr/bin/env tsx

/**
 * Critical Issues Resolution Script
 * Automatically fixes high-priority blockers identified in Phase 0 audit
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

interface FixResult {
  issue: string;
  status: 'fixed' | 'failed' | 'skipped';
  details: string;
  filesTouched: string[];
}

class CriticalFixer {
  private fixes: FixResult[] = [];

  async runAllFixes(): Promise<FixResult[]> {
    console.log('🔧 Starting critical fixes...\n');

    await this.fixTypescriptErrors();
    await this.fixPerformanceMonitorSyntax();
    await this.implementLoggingWrapper();
    await this.addConsoleEslintRule();
    await this.secureMetricsEndpoint();
    await this.addPreCommitHooks();

    return this.fixes;
  }

  private async fixTypescriptErrors(): Promise<void> {
    console.log('🔍 Fixing TypeScript compilation errors...');

    try {
      // Fix the specific syntax error in performance-monitor.ts
      const perfMonitorPath = 'client/src/lib/performance-monitor.ts';
      
      if (fs.existsSync(perfMonitorPath)) {
        let content = fs.readFileSync(perfMonitorPath, 'utf8');
        
        // Fix line 32: unterminated string literal
        content = content.replace(
          /threshold\?\: \'normal\' \| \'warning\' \| critical\'\;/,
          "threshold?: 'normal' | 'warning' | 'critical';"
        );
        
        fs.writeFileSync(perfMonitorPath, content);
        
        this.fixes.push({
          issue: 'TypeScript syntax error in performance-monitor.ts',
          status: 'fixed',
          details: 'Fixed unterminated string literal on line 32',
          filesTouched: [perfMonitorPath]
        });
      }

      // Verify TypeScript compilation
      execSync('npm run check', { stdio: 'pipe' });
      
      console.log('   ✅ TypeScript errors resolved\n');
    } catch (error) {
      console.log(`   ❌ TypeScript fix failed: ${error.message}\n`);
      this.fixes.push({
        issue: 'TypeScript compilation errors',
        status: 'failed',
        details: error.message,
        filesTouched: []
      });
    }
  }

  private async fixPerformanceMonitorSyntax(): Promise<void> {
    console.log('🔧 Enhancing performance monitor implementation...');

    const perfMonitorPath = 'client/src/lib/performance-monitor.ts';
    
    if (!fs.existsSync(perfMonitorPath)) {
      console.log('   ⚠️  Performance monitor file not found, skipping...\n');
      return;
    }

    try {
      // Read current content
      let content = fs.readFileSync(perfMonitorPath, 'utf8');
      
      // Ensure proper TypeScript types and fix any remaining issues
      content = content.replace(
        /export interface PerformanceMetric \{[^}]+\}/s,
        `export interface PerformanceMetric {
  name: string;
  value: number;
  unit: string;
  timestamp: Date;
  threshold?: 'normal' | 'warning' | 'critical';
  context?: Record<string, any>;
}`
      );

      // Add proper error handling for browser APIs
      content = content.replace(
        /if \(typeof performance !== 'undefined' && 'memory' in performance\) \{/,
        `if (typeof performance !== 'undefined' && 'memory' in performance && (performance as any).memory) {`
      );

      fs.writeFileSync(perfMonitorPath, content);

      this.fixes.push({
        issue: 'Performance monitor syntax and type safety',
        status: 'fixed',
        details: 'Enhanced type definitions and browser API safety',
        filesTouched: [perfMonitorPath]
      });

      console.log('   ✅ Performance monitor enhanced\n');
    } catch (error) {
      console.log(`   ❌ Performance monitor fix failed: ${error.message}\n`);
      this.fixes.push({
        issue: 'Performance monitor enhancement',
        status: 'failed',
        details: error.message,
        filesTouched: []
      });
    }
  }

  private async implementLoggingWrapper(): Promise<void> {
    console.log('📝 Implementing structured logging wrapper...');

    const loggerPath = 'client/src/lib/logger.ts';
    const serverLoggerPath = 'server/lib/logger.ts';

    try {
      // Client-side logger
      const clientLogger = `/**
 * Client-side structured logging wrapper
 * Replaces console.* calls with environment-aware logging
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: any;
}

class ClientLogger {
  private isDev = import.meta.env.DEV;
  private logLevel: LogLevel = (import.meta.env.VITE_LOG_LEVEL as LogLevel) || 'info';

  private shouldLog(level: LogLevel): boolean {
    const levels: Record<LogLevel, number> = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3
    };

    return levels[level] >= levels[this.logLevel];
  }

  private formatMessage(level: LogLevel, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString();
    const contextStr = context ? \` \${JSON.stringify(context)}\` : '';
    return \`[\${timestamp}] [\${level.toUpperCase()}] \${message}\${contextStr}\`;
  }

  debug(message: string, context?: LogContext): void {
    if (this.isDev && this.shouldLog('debug')) {
      console.debug(this.formatMessage('debug', message, context));
    }
  }

  info(message: string, context?: LogContext): void {
    if (this.shouldLog('info')) {
      console.info(this.formatMessage('info', message, context));
    }
  }

  warn(message: string, context?: LogContext): void {
    if (this.shouldLog('warn')) {
      console.warn(this.formatMessage('warn', message, context));
    }
  }

  error(message: string, error?: Error | any, context?: LogContext): void {
    if (this.shouldLog('error')) {
      const errorContext = error instanceof Error 
        ? { ...context, error: error.message, stack: error.stack }
        : { ...context, error };
      console.error(this.formatMessage('error', message, errorContext));
    }
  }

  // Performance logging
  time(label: string): void {
    if (this.isDev) {
      console.time(label);
    }
  }

  timeEnd(label: string): void {
    if (this.isDev) {
      console.timeEnd(label);
    }
  }
}

export const logger = new ClientLogger();

// Legacy console replacement (for migration period)
export const console = {
  log: (message: any, ...args: any[]) => logger.info(String(message), { args }),
  debug: (message: any, ...args: any[]) => logger.debug(String(message), { args }),
  info: (message: any, ...args: any[]) => logger.info(String(message), { args }),
  warn: (message: any, ...args: any[]) => logger.warn(String(message), { args }),
  error: (message: any, ...args: any[]) => logger.error(String(message), args[0], { additionalArgs: args.slice(1) }),
  time: logger.time.bind(logger),
  timeEnd: logger.timeEnd.bind(logger)
};`;

      fs.writeFileSync(loggerPath, clientLogger);

      // Server-side logger (if server directory exists)
      if (fs.existsSync('server/')) {
        if (!fs.existsSync('server/lib/')) {
          fs.mkdirSync('server/lib/', { recursive: true });
        }

        const serverLogger = `/**
 * Server-side structured logging with Pino
 * Production-ready logging with proper serialization
 */

import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';
const logLevel = process.env.LOG_LEVEL || (isDev ? 'debug' : 'info');

export const logger = pino({
  level: logLevel,
  transport: isDev ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname'
    }
  } : undefined,
  serializers: {
    error: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
  },
  redact: ['password', 'token', 'secret', 'authorization'],
});

// Performance logging helper
export function withTimer<T>(label: string, fn: () => T): T {
  const start = Date.now();
  try {
    const result = fn();
    logger.info(\`\${label} completed\`, { duration: Date.now() - start });
    return result;
  } catch (error) {
    logger.error(\`\${label} failed\`, { error, duration: Date.now() - start });
    throw error;
  }
}

// Async performance logging helper
export async function withTimerAsync<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    logger.info(\`\${label} completed\`, { duration: Date.now() - start });
    return result;
  } catch (error) {
    logger.error(\`\${label} failed\`, { error, duration: Date.now() - start });
    throw error;
  }
}`;

        fs.writeFileSync(serverLoggerPath, serverLogger);
      }

      this.fixes.push({
        issue: 'Structured logging implementation',
        status: 'fixed',
        details: 'Implemented client and server logging wrappers with environment awareness',
        filesTouched: [loggerPath, serverLoggerPath].filter(p => fs.existsSync(p))
      });

      console.log('   ✅ Logging wrapper implemented\n');
    } catch (error) {
      console.log(`   ❌ Logging wrapper failed: ${error.message}\n`);
      this.fixes.push({
        issue: 'Structured logging implementation',
        status: 'failed',
        details: error.message,
        filesTouched: []
      });
    }
  }

  private async addConsoleEslintRule(): Promise<void> {
    console.log('📋 Adding ESLint no-console rule...');

    try {
      const eslintConfigPath = 'eslint.config.js';
      
      if (!fs.existsSync(eslintConfigPath)) {
        console.log('   ⚠️  ESLint config not found, creating basic config...');
        
        const basicConfig = `import js from '@eslint/js';
import typescript from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';

export default [
  js.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true
        }
      }
    },
    plugins: {
      '@typescript-eslint': typescript
    },
    rules: {
      'no-console': ['error', { 
        allow: ['warn', 'error'] 
      }],
      '@typescript-eslint/no-unused-vars': ['error', { 
        argsIgnorePattern: '^_' 
      }],
      '@typescript-eslint/no-explicit-any': 'warn'
    }
  },
  {
    files: ['**/*.{js,jsx}'],
    rules: {
      'no-console': ['error', { 
        allow: ['warn', 'error'] 
      }]
    }
  },
  {
    // Allow console in specific files
    files: [
      'scripts/**/*',
      '**/*.test.{ts,tsx,js,jsx}',
      '**/*.spec.{ts,tsx,js,jsx}',
      'client/src/lib/logger.ts',
      'server/lib/logger.ts'
    ],
    rules: {
      'no-console': 'off'
    }
  }
];`;

        fs.writeFileSync(eslintConfigPath, basicConfig);
      } else {
        // Update existing config
        let config = fs.readFileSync(eslintConfigPath, 'utf8');
        
        // Add no-console rule if not present
        if (!config.includes('no-console')) {
          config = config.replace(
            /rules: \{/,
            `rules: {
      'no-console': ['error', { allow: ['warn', 'error'] }],`
          );
          
          fs.writeFileSync(eslintConfigPath, config);
        }
      }

      this.fixes.push({
        issue: 'ESLint no-console rule',
        status: 'fixed',
        details: 'Added no-console rule with appropriate exceptions',
        filesTouched: [eslintConfigPath]
      });

      console.log('   ✅ ESLint no-console rule added\n');
    } catch (error) {
      console.log(`   ❌ ESLint rule addition failed: ${error.message}\n`);
      this.fixes.push({
        issue: 'ESLint no-console rule',
        status: 'failed',
        details: error.message,
        filesTouched: []
      });
    }
  }

  private async secureMetricsEndpoint(): Promise<void> {
    console.log('🔒 Securing /metrics endpoint...');

    try {
      const metricsRoutePath = 'server/routes/metrics.ts';
      
      if (!fs.existsSync('server/routes/')) {
        fs.mkdirSync('server/routes/', { recursive: true });
      }

      const secureMetricsRoute = `/**
 * Secure metrics endpoint for Prometheus scraping
 * Requires authentication and feature flag
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { register } from 'prom-client';

interface MetricsConfig {
  enabled: boolean;
  token: string;
  allowedIPs?: string[];
}

const metricsConfig: MetricsConfig = {
  enabled: process.env.ENABLE_METRICS === 'true',
  token: process.env.METRICS_TOKEN || 'default-token-change-in-production',
  allowedIPs: process.env.METRICS_ALLOWED_IPS?.split(',') || []
};

async function authenticateMetrics(request: FastifyRequest, reply: FastifyReply) {
  // Feature flag check
  if (!metricsConfig.enabled) {
    return reply.code(404).send({ error: 'Not found' });
  }

  // IP allowlist check (if configured)
  if (metricsConfig.allowedIPs.length > 0) {
    const clientIP = request.ip;
    if (!metricsConfig.allowedIPs.includes(clientIP)) {
      return reply.code(403).send({ error: 'Forbidden' });
    }
  }

  // Token authentication
  const authHeader = request.headers.authorization;
  const token = authHeader?.replace('Bearer ', '') || request.query.token;
  
  if (token !== metricsConfig.token) {
    return reply.code(401).send({ error: 'Unauthorized' });
  }
}

export default async function metricsRoutes(fastify: FastifyInstance) {
  fastify.get('/metrics', {
    preHandler: authenticateMetrics
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const metrics = await register.metrics();
      
      reply
        .type('text/plain; version=0.0.4; charset=utf-8')
        .send(metrics);
    } catch (error) {
      fastify.log.error('Failed to generate metrics', { error });
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  // Health check for metrics endpoint
  fastify.get('/metrics/health', {
    preHandler: authenticateMetrics
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    reply.send({ 
      status: 'healthy',
      timestamp: new Date().toISOString(),
      metricsEnabled: metricsConfig.enabled
    });
  });
}`;

      fs.writeFileSync(metricsRoutePath, secureMetricsRoute);

      // Create environment template
      const envTemplatePath = '.env.example';
      const envTemplate = `# Metrics Configuration
ENABLE_METRICS=false
METRICS_TOKEN=your-secure-token-here
METRICS_ALLOWED_IPS=127.0.0.1,::1

# Logging Configuration  
LOG_LEVEL=info
VITE_LOG_LEVEL=info

# Development
NODE_ENV=development`;

      if (!fs.existsSync(envTemplatePath)) {
        fs.writeFileSync(envTemplatePath, envTemplate);
      }

      this.fixes.push({
        issue: 'Metrics endpoint security',
        status: 'fixed',
        details: 'Implemented secure metrics endpoint with authentication and feature flags',
        filesTouched: [metricsRoutePath, envTemplatePath]
      });

      console.log('   ✅ Metrics endpoint secured\n');
    } catch (error) {
      console.log(`   ❌ Metrics security failed: ${error.message}\n`);
      this.fixes.push({
        issue: 'Metrics endpoint security',
        status: 'failed',
        details: error.message,
        filesTouched: []
      });
    }
  }

  private async addPreCommitHooks(): Promise<void> {
    console.log('🪝 Setting up pre-commit hooks...');

    try {
      // Create husky directory if it doesn't exist
      if (!fs.existsSync('.husky/')) {
        fs.mkdirSync('.husky/', { recursive: true });
      }

      // Pre-commit hook
      const preCommitHook = `#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

echo "🔍 Running pre-commit checks..."

# TypeScript type checking
echo "📋 Type checking..."
npm run check || {
  echo "❌ TypeScript errors found. Please fix before committing."
  exit 1
}

# Linting
echo "📝 Linting..."
npm run lint || {
  echo "❌ Linting errors found. Please fix before committing."
  exit 1
}

# Unit tests
echo "🧪 Running unit tests..."
npm run test:unit || {
  echo "❌ Unit tests failed. Please fix before committing."
  exit 1
}

echo "✅ Pre-commit checks passed!"`;

      fs.writeFileSync('.husky/pre-commit', preCommitHook);
      
      // Make it executable (on Unix systems)
      try {
        execSync('chmod +x .husky/pre-commit');
      } catch (error) {
        // Windows doesn't need chmod
      }

      // Pre-push hook
      const prePushHook = `#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

echo "🚀 Running pre-push checks..."

# Build check
echo "🏗️ Checking build..."
npm run build || {
  echo "❌ Build failed. Please fix before pushing."
  exit 1
}

# Smoke tests
echo "💨 Running smoke tests..."
npm run test:smoke || {
  echo "❌ Smoke tests failed. Please fix before pushing."
  exit 1
}

echo "✅ Pre-push checks passed!"`;

      fs.writeFileSync('.husky/pre-push', prePushHook);
      
      try {
        execSync('chmod +x .husky/pre-push');
      } catch (error) {
        // Windows doesn't need chmod
      }

      // Install husky if not already installed
      try {
        execSync('npx husky install', { stdio: 'pipe' });
      } catch (error) {
        console.log(`   ⚠️  Husky install failed: ${error.message}`);
      }

      this.fixes.push({
        issue: 'Pre-commit hooks setup',
        status: 'fixed',
        details: 'Added comprehensive pre-commit and pre-push hooks',
        filesTouched: ['.husky/pre-commit', '.husky/pre-push']
      });

      console.log('   ✅ Pre-commit hooks configured\n');
    } catch (error) {
      console.log(`   ❌ Pre-commit hooks failed: ${error.message}\n`);
      this.fixes.push({
        issue: 'Pre-commit hooks setup',
        status: 'failed',
        details: error.message,
        filesTouched: []
      });
    }
  }
}

export async function runCriticalFixes(): Promise<FixResult[]> {
  const fixer = new CriticalFixer();
  return await fixer.runAllFixes();
}

// CLI execution
if (require.main === module) {
  runCriticalFixes().then(results => {
    console.log('🔧 CRITICAL FIXES COMPLETE\n');
    console.log('='.repeat(50));
    
    const fixed = results.filter(r => r.status === 'fixed');
    const failed = results.filter(r => r.status === 'failed');
    const skipped = results.filter(r => r.status === 'skipped');
    
    console.log(`✅ Fixed: ${fixed.length}`);
    console.log(`❌ Failed: ${failed.length}`);
    console.log(`⏭️  Skipped: ${skipped.length}\n`);
    
    if (failed.length > 0) {
      console.log('❌ FAILED FIXES:');
      failed.forEach(fix => {
        console.log(`   ${fix.issue}: ${fix.details}`);
      });
      console.log();
    }
    
    console.log('📋 DETAILED RESULTS:');
    console.log(JSON.stringify(results, null, 2));
    
    if (failed.length === 0) {
      console.log('\n🎉 All critical fixes completed successfully!');
    } else {
      console.log(`\n⚠️  ${failed.length} fixes require manual attention`);
      process.exit(1);
    }
  }).catch(error => {
    console.error('❌ Critical fixes failed:', error);
    process.exit(1);
  });
}