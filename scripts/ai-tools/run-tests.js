#!/usr/bin/env node
import { spawn } from 'child_process';
import { writeFileSync } from 'fs';
import { join, resolve } from 'path';

/**
 * AI Gateway Script: Test Runner
 * Provides structured test execution for AI agents
 */

const PROJECT_ROOT = resolve(process.cwd());

class TestRunner {
  constructor(options = {}) {
    this.timeout = options.timeout || 120000; // 2 minutes
    this.logFile = options.logFile || join(PROJECT_ROOT, 'ai-logs', 'test-results.json');
    this.verbose = options.verbose || false;
  }

  async runTests(testPattern = '', options = {}) {
    const startTime = Date.now();
    const runId = `test-${Date.now()}`;
    
    console.log(`[AI-TOOLS] Starting test run: ${runId}`);
    if (testPattern) console.log(`[AI-TOOLS] Pattern: ${testPattern}`);

    const command = this.buildTestCommand(testPattern, options);
    
    try {
      const result = await this.executeCommand(command);
      const duration = Date.now() - startTime;
      
      const testResult = {
        runId,
        timestamp: new Date().toISOString(),
        command: command.join(' '),
        pattern: testPattern,
        duration,
        success: result.exitCode === 0,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        summary: this.parseTestSummary(result.stdout)
      };

      this.logResult(testResult);
      this.printSummary(testResult);
      
      return testResult;
    } catch (error) {
      const errorResult = {
        runId,
        timestamp: new Date().toISOString(),
        command: command.join(' '),
        pattern: testPattern,
        duration: Date.now() - startTime,
        success: false,
        error: error.message,
        exitCode: error.code || 1
      };
      
      this.logResult(errorResult);
      console.error(`[AI-TOOLS] Test run failed: ${error.message}`);
      return errorResult;
    }
  }

  buildTestCommand(pattern, options) {
    const baseCommand = ['npm', 'run'];
    
    // Determine test script based on pattern and options
    if (options.quick || pattern.includes('quick')) {
      baseCommand.push('test:quick');
    } else if (options.integration || pattern.includes('integration')) {
      baseCommand.push('test:integration');
    } else if (options.ui) {
      baseCommand.push('test:ui');
    } else {
      baseCommand.push('test:run'); // Use run for CI-friendly output
    }

    // Add pattern as argument if provided and not in script name
    if (pattern && !pattern.includes('quick') && !pattern.includes('integration')) {
      baseCommand.push('--', pattern);
    }

    return baseCommand;
  }

  executeCommand(command) {
    return new Promise((resolve, reject) => {
      // Security fix: Remove shell:true to prevent command injection
      const process = spawn(command[0], command.slice(1), {
        cwd: PROJECT_ROOT,
        stdio: 'pipe',
        shell: false // Security: Prevent command injection
      });

      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data) => {
        const chunk = data.toString();
        stdout += chunk;
        if (this.verbose) console.log(chunk);
      });

      process.stderr.on('data', (data) => {
        const chunk = data.toString();
        stderr += chunk;
        if (this.verbose) console.error(chunk);
      });

      const timeoutId = setTimeout(() => {
        process.kill('SIGTERM');
        reject(new Error(`Test timeout after ${this.timeout}ms`));
      }, this.timeout);

      process.on('close', (exitCode) => {
        clearTimeout(timeoutId);
        resolve({ exitCode, stdout, stderr });
      });

      process.on('error', (error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
    });
  }

  parseTestSummary(stdout) {
    const summary = { total: 0, passed: 0, failed: 0, skipped: 0 };
    
    // Parse Vitest output
    const lines = stdout.split('\n');
    for (const line of lines) {
      // Look for test summary patterns
      if (line.includes('Test Files')) {
        const match = line.match(/(\d+) passed.*?(\d+) failed.*?(\d+) skipped/);
        if (match) {
          summary.passed = parseInt(match[1]);
          summary.failed = parseInt(match[2]);
          summary.skipped = parseInt(match[3]);
          summary.total = summary.passed + summary.failed + summary.skipped;
        }
      }
    }
    
    return summary;
  }

  logResult(result) {
    try {
      // Ensure ai-logs directory exists
      const logDir = join(PROJECT_ROOT, 'ai-logs');
      try {
        writeFileSync(join(logDir, '.gitkeep'), '');
      } catch (e) {
        // Directory might not exist, that's ok
      }
      
      writeFileSync(this.logFile, JSON.stringify(result, null, 2));
    } catch (error) {
      console.warn(`[AI-TOOLS] Failed to write log: ${error.message}`);
    }
  }

  printSummary(result) {
    console.log('\n=== Test Summary ===');
    console.log(`Run ID: ${result.runId}`);
    console.log(`Duration: ${result.duration}ms`);
    console.log(`Success: ${result.success ? '✅' : '❌'}`);
    
    if (result.summary && result.summary.total > 0) {
      console.log(`Tests: ${result.summary.passed}/${result.summary.total} passed`);
      if (result.summary.failed > 0) console.log(`Failed: ${result.summary.failed}`);
      if (result.summary.skipped > 0) console.log(`Skipped: ${result.summary.skipped}`);
    }
    
    if (!result.success) {
      console.log(`Exit Code: ${result.exitCode}`);
    }
    console.log('===================\n');
  }
}

// CLI Interface
if (process.argv[1].endsWith('run-tests.js')) {
  const args = process.argv.slice(2);
  const pattern = args.find(arg => !arg.startsWith('--')) || '';
  const options = {
    quick: args.includes('--quick'),
    integration: args.includes('--integration'),
    ui: args.includes('--ui'),
    verbose: args.includes('--verbose')
  };

  const runner = new TestRunner({ verbose: options.verbose });
  runner.runTests(pattern, options)
    .then(result => {
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

export { TestRunner };