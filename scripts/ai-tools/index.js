#!/usr/bin/env node
import { readFileSync } from 'fs';
import { join, resolve } from 'path';
import { TestRunner } from './run-tests.js';
import { PatchApplicator } from './apply-patch.js';

/**
 * AI Tools CLI - Gateway for AI agents
 * Usage: npm run ai <command> [options]
 */

const PROJECT_ROOT = resolve(process.cwd());

function showHelp() {
  console.log(`
AI Tools CLI - Gateway for AI-augmented development

Usage:
  npm run ai <command> [options]

Commands:
  test [pattern]           Run tests with optional pattern
    --quick               Run quick tests (excludes API tests)
    --integration         Run integration tests
    --ui                  Run tests with UI
    --verbose             Show detailed output

  patch <file>            Apply patch from file
    --dry-run             Validate patch without applying
    --verbose             Show detailed output

  repair [pattern]        Repair failing tests automatically
    --max-repairs N       Maximum number of repairs (default: 5)
    --draft-pr            Create draft PR with repairs
    --verbose             Show detailed output

  zencoder <task>         AI-powered code fixes with Zencoder
    typescript            Fix TypeScript compilation errors
    test                  Fix failing tests
    eslint                Fix ESLint violations
    deps                  Update vulnerable dependencies
    --max-fixes N         Maximum fixes to apply (default: 10)
    --files <list>        Comma-separated list of target files
    --verbose             Show detailed output

  bundle-analyze          Analyze current bundle composition
    --format <type>       Output format (json|text)
    --output <file>       Save output to file
    
  bundle-optimize         Run bundle optimization agent  
    --target <kb>         Target bundle size in KB (default: 400)
    --strategy <type>     Optimization strategy (safe|balanced|aggressive)
    --preserve            Preserve functionality (run tests)
    
  deps-analyze            Analyze dependencies for optimization
    --unused              Check for unused dependencies
    --heavy               Check for heavy dependencies
    --duplicates          Check for duplicate dependencies
    
  routes-optimize         Optimize route loading
    --analyze-usage       Analyze route usage patterns
    --implement           Apply optimizations
    --preserve <routes>   Routes to keep eagerly loaded
    
  bundle-orchestrate      Run full optimization pipeline
    --target <kb>         Target bundle size in KB
    --strategy <type>     Strategy (safe|balanced|aggressive)
    --dry-run            Preview changes without applying

  status                  Show current project status
  
  metrics                 Show agent metrics endpoint
  
  help                    Show this help message

Examples:
  npm run ai test                    # Run all tests
  npm run ai test --quick            # Run quick tests
  npm run ai test "portfolio"        # Run tests matching pattern
  npm run ai patch changes.json      # Apply JSON patch
  npm run ai patch fix.patch --dry-run  # Validate git patch
  npm run ai repair                   # Repair all failing tests
  npm run ai repair "portfolio" --draft-pr  # Repair tests and create PR
  npm run ai zencoder typescript     # Fix TypeScript errors
  npm run ai zencoder eslint --max-fixes=20  # Fix up to 20 ESLint issues
  npm run ai zencoder test --files=src/auth.test.ts  # Fix specific test file
  npm run ai status                  # Show project status
  npm run ai metrics                 # Show metrics endpoint

Log files are stored in ai-logs/ directory.
`);
}

async function getProjectStatus() {
  try {
    const packageJson = JSON.parse(readFileSync(join(PROJECT_ROOT, 'package.json'), 'utf8'));

    // Check git status
    const { spawn } = await import('child_process');
    const gitStatus = await new Promise((resolve) => {
      const process = spawn('git', ['status', '--porcelain'], { cwd: PROJECT_ROOT, stdio: 'pipe' });
      let output = '';
      process.stdout.on('data', (data) => (output += data.toString()));
      process.on('close', () => resolve(output.trim()));
    });

    const gitBranch = await new Promise((resolve) => {
      const process = spawn('git', ['branch', '--show-current'], {
        cwd: PROJECT_ROOT,
        stdio: 'pipe',
      });
      let output = '';
      process.stdout.on('data', (data) => (output += data.toString()));
      process.on('close', () => resolve(output.trim()));
    });

    console.log('=== Project Status ===');
    console.log(`Name: ${packageJson.name}`);
    console.log(`Version: ${packageJson.version}`);
    console.log(`Branch: ${gitBranch}`);
    console.log(`Git Status: ${gitStatus ? 'Modified files' : 'Clean'}`);

    if (gitStatus) {
      console.log('\nModified files:');
      gitStatus.split('\n').forEach((line) => {
        if (line.trim()) console.log(`  ${line}`);
      });
    }

    console.log('\nAvailable Scripts:');
    Object.keys(packageJson.scripts).forEach((script) => {
      if (script.startsWith('test') || script.startsWith('ai')) {
        console.log(`  ${script}: ${packageJson.scripts[script]}`);
      }
    });

    console.log('=====================\n');
  } catch (error) {
    console.error('Failed to get project status:', error.message);
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === 'help') {
    showHelp();
    return;
  }

  const command = args[0];
  const commandArgs = args.slice(1);

  try {
    switch (command) {
      case 'test': {
        const pattern = commandArgs.find((arg) => !arg.startsWith('--')) || '';
        const options = {
          quick: commandArgs.includes('--quick'),
          integration: commandArgs.includes('--integration'),
          ui: commandArgs.includes('--ui'),
          verbose: commandArgs.includes('--verbose'),
        };

        const runner = new TestRunner({ verbose: options.verbose });
        const result = await runner.runTests(pattern, options);
        process.exit(result.success ? 0 : 1);
        break;
      }

      case 'patch': {
        const patchFile = commandArgs.find((arg) => !arg.startsWith('--'));
        if (!patchFile) {
          console.error('Error: patch command requires a file argument');
          console.log('Usage: npm run ai patch <file> [--dry-run] [--verbose]');
          process.exit(1);
        }

        const options = {
          dryRun: commandArgs.includes('--dry-run'),
          verbose: commandArgs.includes('--verbose'),
        };

        const applicator = new PatchApplicator(options);

        let patchData;
        if (patchFile.endsWith('.json')) {
          patchData = JSON.parse(readFileSync(patchFile, 'utf8'));
        } else {
          patchData = readFileSync(patchFile, 'utf8');
        }

        const result = await applicator.applyPatch(patchData);
        process.exit(result.success ? 0 : 1);
        break;
      }

      case 'repair': {
        const pattern = commandArgs.find((arg) => !arg.startsWith('--'));
        const maxRepairsArg = commandArgs.find((arg) => arg.startsWith('--max-repairs'));
        const maxRepairs = maxRepairsArg ? parseInt(maxRepairsArg.split('=')[1] || '5') : 5;

        const options = {
          maxRepairs,
          draftPR: commandArgs.includes('--draft-pr'),
          verbose: commandArgs.includes('--verbose'),
        };

        console.log('[AI-TOOLS] Starting test repair agent...');
        console.log(`Pattern: ${pattern || 'all tests'}`);
        console.log(`Max repairs: ${maxRepairs}`);
        console.log(`Draft PR: ${options.draftPR ? 'yes' : 'no'}`);

        try {
          // Import metrics collection
          const { collectBMADMetrics, saveBMADMetrics } = await import('./bmad-metrics.js');

          // Start metrics collection
          const metricsCollector = collectBMADMetrics();
          const startTime = Date.now();

          // Dynamically import TestRepairAgent
          const { TestRepairAgent } =
            await import('../../packages/test-repair-agent/src/TestRepairAgent.js');

          // Create agent instance
          const agent = new TestRepairAgent({
            logLevel: options.verbose ? 'debug' : 'info',
            maxRetries: 1,
            timeout: 180000, // 3 minutes
          });

          // Execute repair
          const result = await agent.execute({
            projectRoot: PROJECT_ROOT,
            testPattern: pattern,
            maxRepairs: options.maxRepairs,
            draftPR: options.draftPR,
          });

          // Collect metrics
          const duration = Date.now() - startTime;
          const metrics = {
            timestamp: new Date().toISOString(),
            repo: process.env.GITHUB_REPOSITORY || 'local',
            pattern: pattern || 'all',
            maxRepairs,
            failuresFound: result.failures.length,
            repairsAttempted: result.repairs.length,
            repairsSuccessful: result.repairs.filter((r) => r.success).length,
            prCreated: !!result.prUrl,
            prUrl: result.prUrl,
            duration,
            timeSavedSeconds: result.repairs.filter((r) => r.success).length * 600, // Estimate 10 min per fix
          };

          // Update Prometheus metrics
          metricsCollector.recordRepair(metrics);

          // Save metrics to file for CI
          await saveBMADMetrics(metrics, metricsCollector);

          // Display results
          console.log('\n=== Test Repair Results ===');
          console.log(`Failures found: ${result.failures.length}`);
          console.log(`Repairs attempted: ${result.repairs.length}`);
          console.log(`Successful repairs: ${result.repairs.filter((r) => r.success).length}`);
          console.log(`Time saved: ~${Math.round(metrics.timeSavedSeconds / 60)} minutes`);

          if (result.prUrl) {
            console.log(`\n✅ Draft PR created: ${result.prUrl}`);
          }

          if (options.verbose) {
            console.log('\nDetailed results:');
            console.log(JSON.stringify(result, null, 2));
            console.log('\nMetrics collected:');
            console.log(JSON.stringify(metrics, null, 2));
          }

          // Exit with appropriate code
          const hasFailures =
            result.failures.length > result.repairs.filter((r) => r.success).length;
          process.exit(hasFailures ? 1 : 0);
        } catch (error) {
          console.error('[AI-TOOLS] Test repair agent failed:', error.message);
          if (options.verbose) {
            console.error(error.stack);
          }
          process.exit(1);
        }
        break;
      }

      case 'zencoder': {
        const subCommand = commandArgs[0];
        if (!subCommand) {
          console.error('Error: zencoder requires a subcommand');
          console.log('Usage: npm run ai zencoder <typescript|test|eslint|deps> [options]');
          process.exit(1);
        }

        const { ZencoderAgent } = await import('../../packages/zencoder-integration/dist/index.js');
        const agent = new ZencoderAgent({
          logLevel: commandArgs.includes('--verbose') ? 'debug' : 'info',
        });

        const taskMap = {
          typescript: 'typescript-fix',
          test: 'test-fix',
          eslint: 'eslint-fix',
          deps: 'dependency-update',
        };

        const task = taskMap[subCommand];
        if (!task) {
          console.error(`Unknown zencoder subcommand: ${subCommand}`);
          process.exit(1);
        }

        const maxFixesArg = commandArgs.find((arg) => arg.startsWith('--max-fixes'));
        const maxFixes = maxFixesArg ? parseInt(maxFixesArg.split('=')[1] || '10') : 10;

        const targetFilesArg = commandArgs.find((arg) => arg.startsWith('--files'));
        const targetFiles = targetFilesArg ? targetFilesArg.split('=')[1].split(',') : undefined;

        console.log(`[ZENCODER] Starting ${task} analysis...`);
        const result = await agent.execute({
          projectRoot: PROJECT_ROOT,
          task,
          targetFiles,
          maxFixes,
        });

        console.log('\n=== Zencoder Results ===');
        console.log(`Task: ${result.task}`);
        console.log(`Files analyzed: ${result.filesAnalyzed}`);
        console.log(`Files fixed: ${result.filesFixed}`);
        console.log(`Time: ${result.timeMs}ms`);

        if (result.fixes.length > 0) {
          console.log('\nFixes applied:');
          result.fixes.forEach((fix) => {
            const status = fix.applied ? '✅' : '❌';
            console.log(`  ${status} ${fix.file}: ${fix.issue}`);
            if (!fix.applied && fix.error) {
              console.log(`     Error: ${fix.error}`);
            }
          });
        }

        process.exit(result.filesFixed > 0 ? 0 : 1);
        break;
      }

      case 'status': {
        await getProjectStatus();
        break;
      }

      case 'bundle-analyze': {
        const { spawn } = await import('child_process');
        const formatArg = commandArgs.find((arg) => arg.startsWith('--format'));
        const outputArg = commandArgs.find((arg) => arg.startsWith('--output'));

        const args = ['scripts/ai-tools/bundle-analyzer.mjs', 'analyze'];
        if (formatArg) args.push('--format', formatArg.split('=')[1] || 'json');
        if (outputArg) args.push('--output', outputArg.split('=')[1]);

        const child = spawn('node', args, { stdio: 'inherit' });
        child.on('exit', (code) => process.exit(code));
        break;
      }

      case 'bundle-optimize': {
        const { spawn } = await import('child_process');
        const targetArg = commandArgs.find((arg) => arg.startsWith('--target'));
        const strategyArg = commandArgs.find((arg) => arg.startsWith('--strategy'));

        const args = ['scripts/ai-tools/bundle-analyzer.mjs', 'optimize'];
        if (targetArg) args.push('--target', targetArg.split('=')[1] || '400');
        if (strategyArg) args.push('--strategy', strategyArg.split('=')[1] || 'balanced');
        if (commandArgs.includes('--preserve')) args.push('--preserve');

        const child = spawn('node', args, { stdio: 'inherit' });
        child.on('exit', (code) => process.exit(code));
        break;
      }

      case 'deps-analyze': {
        const { spawn } = await import('child_process');
        const args = ['scripts/ai-tools/bundle-analyzer.mjs', 'deps'];
        if (commandArgs.includes('--verbose')) args.push('--verbose');

        const child = spawn('node', args, { stdio: 'inherit' });
        child.on('exit', (code) => process.exit(code));
        break;
      }

      case 'routes-optimize': {
        const { spawn } = await import('child_process');
        const args = ['scripts/ai-tools/bundle-analyzer.mjs', 'routes'];
        if (commandArgs.includes('--analyze-usage')) args.push('--analyze-usage');
        if (commandArgs.includes('--implement')) args.push('--apply');
        if (commandArgs.includes('--verbose')) args.push('--verbose');

        const child = spawn('node', args, { stdio: 'inherit' });
        child.on('exit', (code) => process.exit(code));
        break;
      }

      case 'bundle-orchestrate': {
        const { spawn } = await import('child_process');
        const targetArg = commandArgs.find((arg) => arg.startsWith('--target'));
        const strategyArg = commandArgs.find((arg) => arg.startsWith('--strategy'));

        const args = ['scripts/ai-tools/orchestrate-bundle-optimization.mjs'];
        if (targetArg) args.push('--target', targetArg.split('=')[1] || '400');
        if (strategyArg) args.push('--strategy', strategyArg.split('=')[1] || 'balanced');
        if (commandArgs.includes('--dry-run')) args.push('--dry-run');

        const child = spawn('node', args, { stdio: 'inherit' });
        child.on('exit', (code) => process.exit(code));
        break;
      }

      case 'metrics': {
        console.log('=== AI Agent Metrics ===');
        console.log('Metrics endpoint: http://localhost:3000/metrics');
        console.log('Prometheus: http://localhost:9090');
        console.log('Grafana: http://localhost:3001 (admin/admin)');
        console.log('AlertManager: http://localhost:9093');
        console.log('');
        console.log(
          'Note: Local observability stack archived to _archive/2026-01-obsolete/observability/'
        );
        console.log('Production monitoring code is in server/observability/*');
        console.log('');
        // Archived: docker-compose -f docker-compose.observability.yml up -d
        console.log('To view metrics in terminal:');
        console.log('  curl http://localhost:3000/metrics');
        break;
      }

      default: {
        console.error(`Unknown command: ${command}`);
        console.log('Run "npm run ai help" for usage information.');
        process.exit(1);
      }
    }
  } catch (error) {
    console.error(`Fatal error: ${error.message}`);
    if (commandArgs.includes('--verbose')) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();
