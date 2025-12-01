#!/usr/bin/env node

/**
 * QA Startup Script
 *
 * Streamlined development server startup for manual QA testing.
 * Handles environment validation, dependency checks, and browser launch.
 *
 * Usage:
 *   npm run qa:startup                    # Start server + open browser
 *   npm run qa:startup -- --no-browser    # Start server only
 *   npm run qa:startup -- --help          # Show options
 *
 * Features:
 *   - Environment validation (Docker, dependencies)
 *   - Multiple startup strategies (full/lightweight/quick)
 *   - Automatic browser navigation to wizard
 *   - DevTools preferences for QA workflow
 *   - Health check before opening browser
 *   - Clear startup messaging
 */

import fs from 'fs';
import path from 'path';
import { spawn, spawnSync, execSync } from 'child_process';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROOT_DIR = path.resolve(__dirname, '..');
const PACKAGE_JSON = path.join(ROOT_DIR, 'package.json');

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  red: '\x1b[31m',
};

const log = {
  info: (msg) => console.log(`${colors.blue}[INFO]${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}[SUCCESS]${colors.reset} ${msg}`),
  warn: (msg) => console.log(`${colors.yellow}[WARN]${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}[ERROR]${colors.reset} ${msg}`),
  step: (num, msg) => console.log(`${colors.bright}${colors.green}[STEP ${num}]${colors.reset} ${msg}`),
  section: (msg) => console.log(`\n${colors.bright}${colors.blue}=== ${msg} ===${colors.reset}\n`),
};

// Parse CLI arguments
const args = process.argv.slice(2);
const showHelp = args.includes('--help') || args.includes('-h');
const noBrowser = args.includes('--no-browser');
const lightweight = args.includes('--lightweight');
const quick = args.includes('--quick');

if (showHelp) {
  console.log(`
QA Startup Script for FeesExpensesStep Manual Testing

Usage:
  npm run qa:startup [options]

Options:
  --help              Show this help message
  --no-browser        Start server without opening browser
  --lightweight       Use lightweight mode (skip Docker)
  --quick             Use ultra-fast mode (skip queues)

Examples:
  npm run qa:startup                    # Full setup, open browser
  npm run qa:startup -- --no-browser    # Server only
  npm run qa:startup -- --lightweight   # Skip Docker services
  npm run qa:startup -- --quick         # Minimal dependencies

Notes:
  - DevTools Network tab is recommended (F12 > Network)
  - Default target URL: http://localhost:5000/modeling-wizard
  - Startup time: 15-45 seconds depending on options
  `);
  process.exit(0);
}

// Startup strategy selection
let npmCmd = 'npm run dev';
let strategy = 'Full (PostgreSQL + Redis)';

if (quick) {
  npmCmd = 'npm run dev:quick';
  strategy = 'Ultra-Fast (minimal dependencies)';
} else if (lightweight) {
  npmCmd = 'npm run dev';
  strategy = 'Lightweight (no Docker services)';
} else {
  npmCmd = 'npm run dev:infra && npm run dev';
  strategy = 'Full Stack (PostgreSQL + Redis)';
}

/**
 * Check if port is listening
 */
function isPortAvailable(port, timeout = 30000) {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      // Try to connect to the port
      const result = spawnSync('node', [
        '-e',
        `require('http').request({host:'localhost',port:${port}},r=>process.exit(r.statusCode<500?0:1)).on('error',()=>process.exit(1)).end()`
      ], { timeout: 2000 });

      if (result.status === 0) return true;
    } catch (e) {
      // Ignore and retry
    }

    // Wait 500ms before retrying
    execSync('sleep 0.5 || timeout /t 1 /nobreak', { stdio: 'ignore', shell: true });
  }

  return false;
}

/**
 * Check system prerequisites
 */
function checkPrerequisites() {
  log.section('CHECKING PREREQUISITES');

  let passed = 0;
  let warnings = 0;

  // 1. Check package.json exists
  log.step(1, 'Checking package.json...');
  if (!fs.existsSync(PACKAGE_JSON)) {
    log.error('package.json not found at ' + PACKAGE_JSON);
    process.exit(1);
  }
  log.success('package.json found');
  passed++;

  // 2. Check node_modules
  log.step(2, 'Checking node_modules...');
  if (!fs.existsSync(path.join(ROOT_DIR, 'node_modules'))) {
    log.warn('node_modules not found - running npm install');
    execSync('npm install', { cwd: ROOT_DIR, stdio: 'inherit' });
  }
  log.success('node_modules ready');
  passed++;

  // 3. Check sidecar tools (Windows-specific)
  if (os.platform() === 'win32') {
    log.step(3, 'Checking sidecar tools (Windows)...');
    try {
      execSync('npm run doctor:quick', { cwd: ROOT_DIR, stdio: 'pipe' });
      log.success('Sidecar tools verified');
      passed++;
    } catch (e) {
      log.warn('Sidecar tools need setup - installing');
      execSync('npm install', { cwd: ROOT_DIR, stdio: 'inherit' });
      warnings++;
    }
  } else {
    passed++;
  }

  // 4. Docker check (informational, not blocking)
  if (!quick && !lightweight) {
    log.step(4, 'Checking Docker (optional)...');
    try {
      const result = spawnSync('docker', ['ps'], { timeout: 5000 });
      if (result.status === 0) {
        log.success('Docker available - full stack mode');
        passed++;
      } else {
        log.warn('Docker not available - switching to lightweight mode');
        strategy = 'Lightweight (Docker unavailable)';
        warnings++;
      }
    } catch (e) {
      log.warn('Docker not found - will use lightweight mode');
      strategy = 'Lightweight (Docker not installed)';
      warnings++;
    }
  } else {
    passed++;
  }

  console.log(`\nPrerequisite check: ${colors.green}${passed}/4 passed${colors.reset}` +
              (warnings > 0 ? `, ${colors.yellow}${warnings} warnings${colors.reset}` : ''));

  return warnings === 0;
}

/**
 * Start development server
 */
function startDevServer() {
  log.section(`STARTING DEV SERVER (${strategy})`);

  log.step(1, `Running: ${colors.bright}${npmCmd}${colors.reset}`);
  console.log(`Strategy: ${colors.dim}${strategy}${colors.reset}\n`);

  // Spawn the development server
  const serverProcess = spawn('npm', ['run', ...npmCmd.split(' ').slice(2)], {
    cwd: ROOT_DIR,
    stdio: 'inherit',
    shell: true,
  });

  serverProcess.on('error', (err) => {
    log.error('Failed to start server: ' + err.message);
    process.exit(1);
  });

  return serverProcess;
}

/**
 * Wait for server to be ready
 */
async function waitForServer(port = 5000, timeout = 30000) {
  log.section('WAITING FOR SERVER');

  log.step(1, `Waiting for http://localhost:${port}...`);

  const startTime = Date.now();
  let attempt = 0;

  while (Date.now() - startTime < timeout) {
    attempt++;

    try {
      // Try a simple HTTP GET to verify server is running
      const result = spawnSync('curl', [
        '-s',
        '-f',
        '--connect-timeout', '2',
        `http://localhost:${port}/`
      ], { timeout: 3000 });

      if (result.status === 0) {
        log.success(`Server ready on port ${port} (${attempt} attempts)`);
        return true;
      }
    } catch (e) {
      // Expected - server not ready yet
    }

    // Show progress
    process.stdout.write('.');

    // Wait 1 second before retrying
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  log.error(`Server did not respond within ${timeout / 1000}s`);
  return false;
}

/**
 * Open browser to modeling wizard
 */
function openBrowser() {
  log.section('OPENING BROWSER');

  const url = 'http://localhost:5000/modeling-wizard';
  log.step(1, `Opening: ${colors.bright}${url}${colors.reset}`);

  const platform = os.platform();
  const commands = {
    darwin: ['open', [url]],
    win32: ['start', [url]],
    linux: ['xdg-open', [url]],
  };

  const [cmd, args] = commands[platform] || commands.linux;

  try {
    spawnSync(cmd, args, { stdio: 'ignore' });
    log.success('Browser opened');
  } catch (e) {
    log.warn(`Could not auto-open browser. Please visit: ${url}`);
  }
}

/**
 * Display QA instructions
 */
function showQAInstructions() {
  log.section('MANUAL QA READY');

  console.log(`
${colors.bright}FeesExpensesStep Auto-Save Manual QA${colors.reset}

${colors.green}Step 1: Open DevTools${colors.reset}
  - Press F12 (or Cmd+Option+I on Mac)
  - Go to ${colors.bright}Network${colors.reset} tab
  - Filter: Type "POST" or "PATCH" to watch save requests

${colors.green}Step 2: Navigate to Component${colors.reset}
  - You should be at: http://localhost:5000/modeling-wizard
  - Click "Next" to reach ${colors.bright}Step 4: Fees & Expenses${colors.reset}

${colors.green}Step 3: Begin Testing${colors.reset}
  - Follow: docs/qa/MANUAL-QA-SETUP-GUIDE.md
  - Test 21 cases covering:
    * Debounce timing (750ms)
    * Unmount protection
    * Error handling
    * Dirty state tracking
    * Browser compatibility

${colors.yellow}Key Test Scenarios:${colors.reset}
  1. Type "2.5" in Rate field -> wait 750ms -> verify save fires
  2. Type "2", wait 400ms, type "5" -> verify only 1 save request
  3. Type "10" (invalid) -> wait 750ms -> verify NO save fires
  4. Enter value, click Previous -> verify unmount save works
  5. Enter value, close tab -> verify beforeunload warning

${colors.dim}Expected timing: 45-60 minutes for full QA cycle
Browsers: Chrome, Firefox, Edge (minimum 2)${colors.reset}

${colors.blue}Documentation: docs/qa/MANUAL-QA-SETUP-GUIDE.md${colors.reset}
${colors.blue}Checklist: docs/qa/fees-expenses-step-manual-qa-checklist.md${colors.reset}

${colors.green}Server Status:${colors.reset}
  - API: http://localhost:5000/api/...
  - Frontend: http://localhost:5000
  - Wizard: http://localhost:5000/modeling-wizard

${colors.yellow}Tips:${colors.reset}
  - Keep Network tab open while testing
  - Use Console tab to monitor errors
  - Take screenshots of failures for debugging
  - Note browser-specific issues in the QA checklist

${colors.dim}Press Ctrl+C to stop the development server${colors.reset}
  `);
}

/**
 * Main execution
 */
async function main() {
  try {
    console.log(`\n${colors.bright}${colors.green}QA Startup Script${colors.reset}\n`);

    // Step 1: Check prerequisites
    const prereqOk = checkPrerequisites();
    if (!prereqOk && !lightweight && !quick) {
      log.warn('Some prerequisites failed, but continuing with warnings...');
    }

    // Step 2: Start server (non-blocking)
    const serverProcess = startDevServer();

    // Step 3: Wait for server to be ready
    const serverReady = await waitForServer(5000, 60000);
    if (!serverReady) {
      log.error('Server failed to start. Check npm output above.');
      process.exit(1);
    }

    // Step 4: Open browser (unless --no-browser)
    if (!noBrowser) {
      openBrowser();
    }

    // Step 5: Show QA instructions
    showQAInstructions();

    // Keep the server running
    serverProcess.on('exit', (code) => {
      if (code !== 0) {
        log.error(`Server exited with code ${code}`);
      }
      process.exit(code);
    });

  } catch (error) {
    log.error(error.message);
    process.exit(1);
  }
}

// Run main function
main();
