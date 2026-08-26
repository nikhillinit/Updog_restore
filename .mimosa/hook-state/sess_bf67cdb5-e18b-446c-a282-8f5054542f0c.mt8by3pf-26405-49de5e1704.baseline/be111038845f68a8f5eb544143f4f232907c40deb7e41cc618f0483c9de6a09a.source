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

  repair [pattern]        Retired package-backed repair command

  zencoder                Archived command stub for the retired Zencoder agent

  bundle-analyze          Analyze current bundle composition
    --format <type>       Output format (json|text)
    --output <file>       Save output to file
    
  bundle-optimize         Retired package-backed bundle optimizer
    
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
  npm run ai status                  # Show project status
  npm run ai metrics                 # Show metrics endpoint

Log files are stored in ai-logs/ directory.
`);
}

function exitRetiredPackageCommand(commandName, replacement) {
  console.error(`[AI-TOOLS] ${commandName} is retired in this app tooling tree.`);
  console.error('The old local agent package entrypoint is no longer wired into root scripts.');
  console.error(replacement);
  process.exit(1);
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
        exitRetiredPackageCommand(
          'repair',
          'Use `npm run test:unit` for current verification and make explicit repairs from the failing output.'
        );
        break;
      }

      case 'zencoder': {
        console.error('The zencoder agent was archived on March 25, 2026.');
        console.log(
          'Historical package: archive/2026-q1/unused-code/packages/zencoder-integration/'
        );
        console.log('Historical docs: archive/2026-q1/unused-code/docs/ZENCODER_INTEGRATION.md');
        console.log('Use `npm run ai repair` or the bundle analysis commands instead.');
        process.exit(1);
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
        exitRetiredPackageCommand(
          'bundle-optimize',
          'Use `npm run ai bundle-analyze`, `npm run ai deps-analyze`, or `npm run build:prod` for current bundle evidence.'
        );
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
        console.log('To start observability stack:');
        console.log('  docker-compose -f docker-compose.observability.yml up -d');
        console.log('');
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
