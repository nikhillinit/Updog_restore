#!/usr/bin/env node

/**
 * CLI Tool for Running Agent Backtests
 *
 * Usage:
 *   npm run backtest -- --cases test-cases.json --output report.json
 *   npm run backtest -- --cases test-cases.json --output report.json --verbose
 *   npm run backtest -- --cases test-cases.json --dry-run
 *
 * Test Cases JSON Format:
 * [
 *   {
 *     "id": "case-001",
 *     "commitHash": "abc123",
 *     "type": "test-failure",
 *     "description": "Fix failing unit test in ReserveEngine",
 *     "files": ["client/src/core/ReserveEngine.ts"],
 *     "errorMessage": "TypeError: Cannot read property 'amount' of undefined",
 *     "humanSolution": "Added null check before accessing amount property",
 *     "timeToResolve": 15,
 *     "complexity": 3
 *   }
 * ]
 */

import { BacktestRunner, BacktestCase } from './src/Backtest';
import { existsSync } from 'fs';
import { resolve, join } from 'path';

interface CLIOptions {
  cases: string;
  output?: string;
  projectRoot?: string;
  verbose?: boolean;
  dryRun?: boolean;
  maxConcurrent?: number;
  timeout?: number;
  noCleanup?: boolean;
  help?: boolean;
}

const DEFAULT_OUTPUT = 'backtest-report.json';
const DEFAULT_MAX_CONCURRENT = 3;
const DEFAULT_TIMEOUT = 300000; // 5 minutes

/**
 * Parse command line arguments
 */
function parseArgs(args: string[]): CLIOptions {
  const options: CLIOptions = {
    cases: '',
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--cases':
      case '-c':
        options.cases = args[++i];
        break;

      case '--output':
      case '-o':
        options.output = args[++i];
        break;

      case '--project-root':
      case '-p':
        options.projectRoot = args[++i];
        break;

      case '--verbose':
      case '-v':
        options.verbose = true;
        break;

      case '--dry-run':
      case '-d':
        options.dryRun = true;
        break;

      case '--max-concurrent':
      case '-m':
        options.maxConcurrent = parseInt(args[++i], 10);
        break;

      case '--timeout':
      case '-t':
        options.timeout = parseInt(args[++i], 10) * 1000; // Convert to ms
        break;

      case '--no-cleanup':
        options.noCleanup = true;
        break;

      case '--help':
      case '-h':
        options.help = true;
        break;

      default:
        if (arg.startsWith('-')) {
          console.warn(`Unknown option: ${arg}`);
        }
    }
  }

  return options;
}

/**
 * Print usage information
 */
function printHelp(): void {
  console.log(`
Backtest Runner - Agent Performance Evaluation Tool

USAGE:
  backtest-runner --cases <file> [options]

OPTIONS:
  -c, --cases <file>           Path to test cases JSON file (required)
  -o, --output <file>          Output report file (default: ${DEFAULT_OUTPUT})
  -p, --project-root <path>    Project root directory (default: current directory)
  -v, --verbose                Enable verbose logging
  -d, --dry-run                Run without executing agents (simulation mode)
  -m, --max-concurrent <n>     Max concurrent test cases (default: ${DEFAULT_MAX_CONCURRENT})
  -t, --timeout <seconds>      Timeout per case in seconds (default: 300)
  --no-cleanup                 Don't cleanup git worktrees after completion
  -h, --help                   Show this help message

EXAMPLES:
  # Basic usage
  backtest-runner --cases test-cases.json

  # With custom output and verbose logging
  backtest-runner --cases test-cases.json --output results.json --verbose

  # Dry run to test configuration
  backtest-runner --cases test-cases.json --dry-run

  # Limit concurrency and increase timeout
  backtest-runner --cases test-cases.json --max-concurrent 2 --timeout 600

TEST CASES FILE FORMAT:
  [
    {
      "id": "case-001",
      "commitHash": "abc123def456",
      "type": "test-failure",
      "description": "Fix failing unit test",
      "files": ["src/example.ts"],
      "errorMessage": "TypeError: Cannot read property...",
      "humanSolution": "Added null check",
      "timeToResolve": 15,
      "complexity": 3,
      "metadata": {
        "testCommand": "npm test",
        "category": "runtime-error"
      }
    }
  ]

TASK TYPES:
  typescript-error, react-component, performance, database-query,
  test-failure, api-design, refactoring, debugging, code-review,
  architecture, general

OUTPUT:
  The tool generates two files:
  - <output>.json: Full JSON report with all results
  - <output>-summary.txt: Human-readable summary

EXIT CODES:
  0: Success
  1: Error (invalid arguments, file not found, etc.)
  2: Backtest failures detected (cases failed)
`);
}

/**
 * Validate CLI options
 */
function validateOptions(options: CLIOptions): { valid: boolean; error?: string } {
  if (!options.cases) {
    return { valid: false, error: 'Test cases file is required (--cases)' };
  }

  if (!existsSync(options.cases)) {
    return { valid: false, error: `Test cases file not found: ${options.cases}` };
  }

  if (options.maxConcurrent && options.maxConcurrent < 1) {
    return { valid: false, error: 'Max concurrent must be at least 1' };
  }

  if (options.timeout && options.timeout < 1000) {
    return { valid: false, error: 'Timeout must be at least 1000ms (1 second)' };
  }

  return { valid: true };
}

/**
 * Main CLI execution
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  // Show help
  if (options.help || args.length === 0) {
    printHelp();
    process.exit(0);
  }

  // Validate options
  const validation = validateOptions(options);
  if (!validation.valid) {
    console.error(`Error: ${validation.error}\n`);
    console.error('Run with --help for usage information');
    process.exit(1);
  }

  // Resolve paths
  const casesPath = resolve(options.cases);
  const projectRoot = resolve(options.projectRoot || process.cwd());
  const outputPath = resolve(options.output || DEFAULT_OUTPUT);

  console.log('='.repeat(60));
  console.log('BACKTEST RUNNER');
  console.log('='.repeat(60));
  console.log(`Test Cases: ${casesPath}`);
  console.log(`Project Root: ${projectRoot}`);
  console.log(`Output: ${outputPath}`);
  console.log(`Mode: ${options.dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log('='.repeat(60));
  console.log();

  try {
    // Load test cases
    console.log('Loading test cases...');
    const testCases = BacktestRunner.loadTestCases(casesPath);
    console.log(`Loaded ${testCases.length} test cases`);
    console.log();

    // Create backtest runner
    const runner = new BacktestRunner({
      projectRoot,
      cleanupWorktree: !options.noCleanup,
      maxConcurrent: options.maxConcurrent || DEFAULT_MAX_CONCURRENT,
      timeout: options.timeout || DEFAULT_TIMEOUT,
      verbose: options.verbose || false,
      dryRun: options.dryRun || false,
    });

    // Run backtest
    console.log('Starting backtest...');
    console.log();
    const report = await runner.runBacktest(testCases);

    // Save report
    console.log();
    console.log('Saving report...');
    BacktestRunner.saveReport(report, outputPath);
    console.log(`Report saved to: ${outputPath}`);
    console.log(`Summary saved to: ${outputPath.replace('.json', '-summary.txt')}`);
    console.log();

    // Print summary
    printSummary(report);

    // Exit with appropriate code
    if (report.failedCases > 0) {
      console.log();
      console.warn(`Warning: ${report.failedCases} test cases failed`);
      process.exit(2);
    } else {
      console.log();
      console.log('All test cases completed successfully!');
      process.exit(0);
    }
  } catch (error) {
    console.error();
    console.error('FATAL ERROR:');
    console.error(error instanceof Error ? error.message : String(error));
    if (options.verbose && error instanceof Error && error.stack) {
      console.error();
      console.error('Stack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

/**
 * Print summary to console
 */
function printSummary(report: any): void {
  console.log('='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log();
  console.log(`Total Cases:          ${report.totalCases}`);
  console.log(`Successful:           ${report.successfulCases} (${(report.successRate * 100).toFixed(2)}%)`);
  console.log(`Failed:               ${report.failedCases}`);
  console.log();
  console.log('Performance Metrics:');
  console.log(`  Quality Score:      ${report.averageQualityScore.toFixed(2)}/100`);
  console.log(`  Similarity:         ${(report.averageSimilarityScore * 100).toFixed(2)}%`);
  console.log(`  Speedup:            ${report.averageSpeedup.toFixed(2)}x`);
  console.log(`  Avg Iterations:     ${report.averageIterations.toFixed(2)}`);
  console.log(`  Total Cost:         ${report.totalCost.toFixed(2)} units`);
  console.log();
  console.log(`Duration:             ${(report.summary.totalDuration / 1000).toFixed(2)}s`);
  console.log('='.repeat(60));
}

// Run CLI
if (require.main === module) {
  main().catch((error) => {
    console.error('Unexpected error:', error);
    process.exit(1);
  });
}

export { main, parseArgs, validateOptions, printHelp };
