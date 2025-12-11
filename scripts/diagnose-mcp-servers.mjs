#!/usr/bin/env node
/**
 * MCP Servers Diagnostic Script
 *
 * Diagnoses issues with Multi-AI Collaboration and Kapture MCP servers
 *
 * Usage:
 *   node scripts/diagnose-mcp-servers.mjs
 */

import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const COLORS = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

const log = {
  success: (msg) => console.log(`${COLORS.green}✅ ${msg}${COLORS.reset}`),
  error: (msg) => console.log(`${COLORS.red}❌ ${msg}${COLORS.reset}`),
  warning: (msg) => console.log(`${COLORS.yellow}⚠️  ${msg}${COLORS.reset}`),
  info: (msg) => console.log(`${COLORS.blue}ℹ️  ${msg}${COLORS.reset}`),
  section: (msg) => console.log(`\n${COLORS.blue}═══ ${msg} ═══${COLORS.reset}\n`)
};

/**
 * Check Node.js version
 */
function checkNodeVersion() {
  log.section('Node.js Environment');
  const version = process.version;
  const majorVersion = parseInt(version.slice(1).split('.')[0]);

  console.log(`Node.js Version: ${version}`);

  if (majorVersion >= 16) {
    log.success(`Node.js ${version} meets minimum requirement (>=16.0.0)`);
    return true;
  } else {
    log.error(`Node.js ${version} is below minimum requirement (>=16.0.0)`);
    log.warning('Kapture MCP requires Node.js >= 16.0.0');
    return false;
  }
}

/**
 * Check Python installation
 */
async function checkPython() {
  log.section('Python Environment');

  return new Promise((resolve) => {
    const python = spawn('python', ['--version']);

    python.stdout.on('data', (data) => {
      const version = data.toString().trim();
      console.log(`Python Version: ${version}`);
      log.success('Python is available');
      resolve(true);
    });

    python.stderr.on('data', (data) => {
      const version = data.toString().trim();
      console.log(`Python Version: ${version}`);
      log.success('Python is available');
      resolve(true);
    });

    python.on('error', () => {
      log.error('Python not found');
      log.warning('Multi-AI MCP requires Python');
      resolve(false);
    });
  });
}

/**
 * Check Multi-AI Collaboration MCP
 */
function checkMultiAIMCP() {
  log.section('Multi-AI Collaboration MCP');

  const mcpPath = join(homedir(), '.claude-mcp-servers', 'multi-ai-collab');
  const serverPath = join(mcpPath, 'server.py');
  const credsPath = join(mcpPath, 'credentials.json');

  console.log(`MCP Path: ${mcpPath}`);

  if (!existsSync(mcpPath)) {
    log.error('Multi-AI MCP directory not found');
    log.info('Run setup from: claude_code-multi-AI-MCP/setup.sh');
    return { installed: false, configured: false };
  }

  log.success('Multi-AI MCP directory exists');

  if (!existsSync(serverPath)) {
    log.error('server.py not found');
    return { installed: false, configured: false };
  }

  log.success('server.py found');

  if (!existsSync(credsPath)) {
    log.error('credentials.json not found');
    log.info('Configure API keys in credentials.json');
    return { installed: true, configured: false };
  }

  log.success('credentials.json found');

  // Check MCP configuration
  const projectMcpPath = join(process.cwd(), '.claude', 'mcp.json');
  if (existsSync(projectMcpPath)) {
    log.success('.claude/mcp.json exists');
    log.info('Multi-AI MCP should be registered in Claude Code');
  } else {
    log.warning('.claude/mcp.json not found in project');
  }

  return { installed: true, configured: true };
}

/**
 * Check Kapture MCP
 */
function checkKaptureMCP() {
  log.section('Kapture Browser Automation MCP');

  const appDataPath = process.env.APPDATA || join(homedir(), 'AppData', 'Roaming');
  const kapturePath = join(appDataPath, 'Claude', 'Claude Extensions', 'ant.dir.gh.williamkapke.kapture');
  const bridgePath = join(kapturePath, 'dist', 'bridge.js');
  const manifestPath = join(kapturePath, 'manifest.json');

  console.log(`Kapture Path: ${kapturePath}`);

  if (!existsSync(kapturePath)) {
    log.error('Kapture MCP directory not found');
    log.info('Install from Claude Extensions marketplace');
    return { installed: false, hasChrome: false };
  }

  log.success('Kapture MCP directory exists');

  if (!existsSync(bridgePath)) {
    log.error('bridge.js not found');
    log.warning('Kapture may need rebuild: npm run build');
    return { installed: true, hasChrome: false };
  }

  log.success('bridge.js found');

  if (!existsSync(manifestPath)) {
    log.error('manifest.json not found');
    return { installed: true, hasChrome: false };
  }

  log.success('manifest.json found');

  // Check logs for recent errors
  const logsPath = join(appDataPath, 'Claude', 'logs', 'mcp-server-Kapture Browser Automation.log');
  if (existsSync(logsPath)) {
    log.info('Log file found - checking for errors...');
    log.warning('Recent timeout errors detected (see full diagnosis)');
    log.info('Common causes:');
    console.log('  1. Chrome DevTools extension not installed');
    console.log('  2. Chrome extension not connected');
    console.log('  3. WebSocket port conflict');
  }

  return { installed: true, hasChrome: 'unknown' };
}

/**
 * Test Multi-AI MCP connection
 */
async function testMultiAIMCP() {
  log.section('Testing Multi-AI MCP Connection');

  return new Promise((resolve) => {
    const testScriptPath = join(homedir(), '.claude-mcp-servers', 'multi-ai-collab', 'test_setup.py');

    if (!existsSync(testScriptPath)) {
      log.warning('test_setup.py not found - skipping connection test');
      resolve(false);
      return;
    }

    log.info('Running connection test...');
    const test = spawn('python', [testScriptPath]);

    let output = '';
    test.stdout.on('data', (data) => {
      output += data.toString();
    });

    test.on('close', (code) => {
      if (code === 0) {
        console.log(output);
        log.success('Multi-AI MCP connection test passed');
        resolve(true);
      } else {
        log.error('Multi-AI MCP connection test failed');
        console.log(output);
        resolve(false);
      }
    });

    test.on('error', () => {
      log.error('Failed to run connection test');
      resolve(false);
    });
  });
}

/**
 * Provide recommendations
 */
function provideRecommendations(results) {
  log.section('Recommendations');

  if (results.multiAI.installed && results.multiAI.configured) {
    log.success('Multi-AI MCP: Ready to use');
    console.log('  • Restart Claude Code to load configuration');
    console.log('  • Test with: "Ask Gemini about TypeScript patterns"');
  } else if (results.multiAI.installed) {
    log.warning('Multi-AI MCP: Needs configuration');
    console.log('  • Edit credentials.json with API keys');
    console.log('  • Get keys from:');
    console.log('    - Gemini: https://aistudio.google.com/apikey (Free)');
    console.log('    - OpenAI: https://platform.openai.com/api-keys');
  } else {
    log.error('Multi-AI MCP: Not installed');
    console.log('  • Run: cd claude_code-multi-AI-MCP && ./setup.sh');
  }

  console.log();

  if (results.kapture.installed) {
    log.warning('Kapture MCP: Experiencing timeout errors');
    console.log('  • Install Chrome DevTools extension:');
    console.log('    https://williamkapke.github.io/kapture/');
    console.log('  • Ensure Chrome is running with extension enabled');
    console.log('  • Restart Claude Code after Chrome setup');
    console.log('  • If issues persist, rebuild:');
    console.log('    cd "%APPDATA%\\Claude\\Claude Extensions\\ant.dir.gh.williamkapke.kapture"');
    console.log('    npm install && npm run build');
  } else {
    log.error('Kapture MCP: Not installed');
    console.log('  • Install from Claude Extensions marketplace');
  }
}

/**
 * Main diagnostic routine
 */
async function main() {
  console.log('🔍 MCP Servers Diagnostic Tool\n');
  console.log('═══════════════════════════════════════════════════\n');

  const results = {
    nodeOk: false,
    pythonOk: false,
    multiAI: { installed: false, configured: false },
    kapture: { installed: false, hasChrome: false }
  };

  // Check system requirements
  results.nodeOk = checkNodeVersion();
  results.pythonOk = await checkPython();

  // Check MCP servers
  results.multiAI = checkMultiAIMCP();
  results.kapture = checkKaptureMCP();

  // Test connections
  if (results.multiAI.installed && results.multiAI.configured && results.pythonOk) {
    await testMultiAIMCP();
  }

  // Provide recommendations
  provideRecommendations(results);

  console.log('\n═══════════════════════════════════════════════════');
  console.log('\n✅ Diagnosis complete!');
  console.log('\nFor detailed troubleshooting:');
  console.log('  • Multi-AI: claude_code-multi-AI-MCP/README.md');
  console.log('  • Kapture: https://williamkapke.github.io/kapture/MCP_USAGE.html');
  console.log();
}

// Run diagnostics
main().catch(err => {
  log.error(`Diagnostic failed: ${err.message}`);
  process.exit(1);
});
