#!/usr/bin/env node

/**
 * Development Dashboard Launcher
 *
 * This script provides easy access to the development dashboard and related tools.
 * It can start the dashboard server, show health metrics, and perform quick fixes.
 */

import { spawn, exec } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const COLORS = {
  GREEN: '\x1b[32m',
  YELLOW: '\x1b[33m',
  RED: '\x1b[31m',
  BLUE: '\x1b[34m',
  RESET: '\x1b[0m',
  BOLD: '\x1b[1m'
};

function log(message, color = COLORS.RESET) {
  console.log(`${color}${message}${COLORS.RESET}`);
}

function logSuccess(message) {
  log(`✅ ${message}`, COLORS.GREEN);
}

function logError(message) {
  log(`❌ ${message}`, COLORS.RED);
}

function logInfo(message) {
  log(`ℹ️  ${message}`, COLORS.BLUE);
}

function logWarning(message) {
  log(`⚠️  ${message}`, COLORS.YELLOW);
}

async function checkServerHealth() {
  try {
    const response = await fetch('http://localhost:5000/api/dev-dashboard/health');
    const data = await response.json();

    log('\n📊 Development Health Summary', COLORS.BOLD);
    log('─'.repeat(50));

    const overallColor = data.overall === 'healthy' ? COLORS.GREEN :
                        data.overall === 'warning' ? COLORS.YELLOW : COLORS.RED;
    log(`Overall Status: ${data.overall.toUpperCase()}`, overallColor);

    log(`\n🔤 TypeScript: ${data.metrics.typescript.errorCount} errors`);
    log(`🧪 Tests: ${data.metrics.tests.passCount} passing, ${data.metrics.tests.failCount} failing`);
    log(`🏗️  Build: ${data.metrics.build.status}`);
    log(`💾 Database: ${data.metrics.database.status} (${data.metrics.database.latency}ms)`);
    log(`📦 Dev Server: ${data.metrics.devServer.status} on :${data.metrics.devServer.port}`);
    log(`📝 Git: ${data.metrics.git.branch} (${data.metrics.git.uncommittedChanges} uncommitted)`);

    if (data.metrics.typescript.errors.length > 0) {
      log('\n🔍 Recent TypeScript Errors:', COLORS.YELLOW);
      data.metrics.typescript.errors.slice(0, 3).forEach(error => {
        log(`   ${error.file}:${error.line} - ${error.message}`);
      });
    }

  } catch (error) {
    logError('Could not fetch health data. Is the development server running?');
    logInfo('Try running: npm run dev');
  }
}

async function openDashboard() {
  const dashboardUrl = 'http://localhost:5173/dev-dashboard';

  logInfo('Opening development dashboard...');

  try {
    const { default: open } = await import('open');
    await open(dashboardUrl);
    logSuccess(`Dashboard opened at ${dashboardUrl}`);
  } catch (error) {
    logWarning(`Could not auto-open browser. Please visit: ${dashboardUrl}`);
  }
}

async function runQuickFix(type) {
  logInfo(`Running quick fix for ${type}...`);

  try {
    const response = await fetch(`http://localhost:5000/api/dev-dashboard/fix/${type}`, {
      method: 'POST'
    });
    const result = await response.json();

    if (result.success) {
      logSuccess(result.message);
    } else {
      logError(result.message);
    }
  } catch (error) {
    logError(`Failed to run fix: ${error.message}`);
  }
}

async function startDevEnvironment() {
  logInfo('Starting development environment with dashboard...');

  // Start the dev server with dashboard enabled
  const devProcess = spawn('npm', ['run', 'dev'], {
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      ENABLE_DEV_DASHBOARD: '1'
    }
  });

  devProcess.on('error', (error) => {
    logError(`Failed to start dev server: ${error.message}`);
  });

  // Auto-open dashboard after a delay
  setTimeout(() => {
    openDashboard();
  }, 5000);
}

async function showHelp() {
  log('\n🛠️  Development Dashboard CLI', COLORS.BOLD);
  log('─'.repeat(50));
  log('Commands:');
  log('  health     - Show current development health status');
  log('  open       - Open the development dashboard in browser');
  log('  start      - Start dev environment with dashboard');
  log('  fix <type> - Run quick fix (typescript, tests, build)');
  log('  help       - Show this help message');
  log('\nExamples:');
  log('  node scripts/dev-dashboard.js health');
  log('  node scripts/dev-dashboard.js fix typescript');
  log('  node scripts/dev-dashboard.js start');
}

async function main() {
  const command = process.argv[2];
  const arg = process.argv[3];

  switch (command) {
    case 'health':
      await checkServerHealth();
      break;

    case 'open':
      await openDashboard();
      break;

    case 'start':
      await startDevEnvironment();
      break;

    case 'fix':
      if (!arg) {
        logError('Please specify fix type: typescript, tests, or build');
        process.exit(1);
      }
      await runQuickFix(arg);
      break;

    case 'help':
    case '--help':
    case '-h':
      await showHelp();
      break;

    default:
      if (!command) {
        await showHelp();
      } else {
        logError(`Unknown command: ${command}`);
        await showHelp();
        process.exit(1);
      }
  }
}

// Add to package.json scripts
async function addToPackageJson() {
  const packageJsonPath = path.join(__dirname, '..', 'package.json');

  try {
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));

    const devDashboardScripts = {
      'dev:dashboard': 'node scripts/dev-dashboard.js start',
      'dev:health': 'node scripts/dev-dashboard.js health',
      'dev:fix': 'node scripts/dev-dashboard.js fix'
    };

    // Check if scripts already exist
    const hasScripts = Object.keys(devDashboardScripts).some(script =>
      packageJson.scripts && packageJson.scripts[script]
    );

    if (!hasScripts) {
      packageJson.scripts = {
        ...packageJson.scripts,
        ...devDashboardScripts
      };

      await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2));
      logSuccess('Added dev dashboard scripts to package.json');
    }
  } catch (error) {
    logWarning('Could not update package.json scripts');
  }
}

if (process.argv[1] === __filename) {
  main().catch(error => {
    logError(`Script failed: ${error.message}`);
    process.exit(1);
  });
}

export {
  checkServerHealth,
  openDashboard,
  runQuickFix,
  startDevEnvironment
};