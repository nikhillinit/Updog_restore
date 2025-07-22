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

  status                  Show current project status
  
  help                    Show this help message

Examples:
  npm run ai test                    # Run all tests
  npm run ai test --quick            # Run quick tests
  npm run ai test "portfolio"        # Run tests matching pattern
  npm run ai patch changes.json      # Apply JSON patch
  npm run ai patch fix.patch --dry-run  # Validate git patch
  npm run ai status                  # Show project status

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
      process.stdout.on('data', (data) => output += data.toString());
      process.on('close', () => resolve(output.trim()));
    });

    const gitBranch = await new Promise((resolve) => {
      const process = spawn('git', ['branch', '--show-current'], { cwd: PROJECT_ROOT, stdio: 'pipe' });
      let output = '';
      process.stdout.on('data', (data) => output += data.toString());
      process.on('close', () => resolve(output.trim()));
    });

    console.log('=== Project Status ===');
    console.log(`Name: ${packageJson.name}`);
    console.log(`Version: ${packageJson.version}`);
    console.log(`Branch: ${gitBranch}`);
    console.log(`Git Status: ${gitStatus ? 'Modified files' : 'Clean'}`);
    
    if (gitStatus) {
      console.log('\nModified files:');
      gitStatus.split('\n').forEach(line => {
        if (line.trim()) console.log(`  ${line}`);
      });
    }
    
    console.log('\nAvailable Scripts:');
    Object.keys(packageJson.scripts).forEach(script => {
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
        const pattern = commandArgs.find(arg => !arg.startsWith('--')) || '';
        const options = {
          quick: commandArgs.includes('--quick'),
          integration: commandArgs.includes('--integration'),
          ui: commandArgs.includes('--ui'),
          verbose: commandArgs.includes('--verbose')
        };
        
        const runner = new TestRunner({ verbose: options.verbose });
        const result = await runner.runTests(pattern, options);
        process.exit(result.success ? 0 : 1);
        break;
      }

      case 'patch': {
        const patchFile = commandArgs.find(arg => !arg.startsWith('--'));
        if (!patchFile) {
          console.error('Error: patch command requires a file argument');
          console.log('Usage: npm run ai patch <file> [--dry-run] [--verbose]');
          process.exit(1);
        }
        
        const options = {
          dryRun: commandArgs.includes('--dry-run'),
          verbose: commandArgs.includes('--verbose')
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

      case 'status': {
        await getProjectStatus();
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