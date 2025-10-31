#!/usr/bin/env node
/**
 * Pre-Commit Validation Script for Documentation & Tooling
 *
 * Usage: node scripts/validate-docs-and-tooling.mjs
 */

import { readFileSync } from 'fs';
import { globSync } from 'glob';

// ------------------- Configuration -------------------
const SECRET_SCAN_GLOBS = ['.claude/**/*', 'docs/**/*', 'cheatsheets/**/*', 'scripts/**/*'];
const SECRET_PATTERN = /sk-[a-zA-Z0-9]{20,}|AIza[a-zA-Z0-9_-]{35}/; // Common API key patterns
const MCP_CONFIG_PATH = '.claude/mcp.json';
const FILE_ENCODING_GLOBS = ['.claude/agents/*.md', '.claude/commands/*.md'];
// -----------------------------------------------------

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
  info: (msg) => console.log(`${COLORS.blue}ℹ️  ${msg}${COLORS.reset}`),
  section: (msg) => console.log(`\n${COLORS.blue}═══ ${msg} ═══${COLORS.reset}\n`)
};

let failures = 0;

function runCheck(name, checkFn) {
  log.info(`Running: ${name}`);
  try {
    const result = checkFn();
    if (result) {
      log.success(`${name} passed.`);
    } else {
      log.error(`${name} failed.`);
      failures++;
    }
  } catch (e) {
    log.error(`Error during ${name}: ${e.message}`);
    failures++;
  }
}

function checkNoSecrets() {
  const files = globSync(SECRET_SCAN_GLOBS, { nodir: true });
  let foundSecrets = false;

  for (const file of files) {
    // Skip mcp.json check for placeholder, which is handled by checkMcpConfig
    if (file.endsWith('mcp.json')) continue;
    const content = readFileSync(file, 'utf-8');
    if (SECRET_PATTERN.test(content)) {
      log.error(`Potential secret found in: ${file}`);
      foundSecrets = true;
    }
  }
  return !foundSecrets;
}

function checkMcpConfig() {
    const content = readFileSync(MCP_CONFIG_PATH, 'utf-8');
    const mcpConfig = JSON.parse(content);
    const niaApiKey = mcpConfig.mcpServers?.nia?.env?.NIA_API_KEY;
    if (niaApiKey !== '${NIA_API_KEY}') {
        log.error('NIA_API_KEY in mcp.json is not a placeholder!');
        return false;
    }
    return true;
}

function checkFileEncodings() {
  const files = globSync(FILE_ENCODING_GLOBS, { nodir: true });
  let allFilesAreUtf8 = true;

  for (const file of files) {
    const buffer = readFileSync(file);

    // Check for non-UTF-8 BOMs
    if (buffer.length >= 2 && buffer[0] === 0xFE && buffer[1] === 0xFF) { // UTF-16 BE
      log.error(`File is UTF-16 BE (Big Endian), should be UTF-8: ${file}`);
      allFilesAreUtf8 = false;
    } else if (buffer.length >= 2 && buffer[0] === 0xFF && buffer[1] === 0xFE) { // UTF-16 LE
      log.error(`File is UTF-16 LE (Little Endian), should be UTF-8: ${file}`);
      allFilesAreUtf8 = false;
    }
  }

  if (!allFilesAreUtf8) {
      log.error('One or more files have incorrect encoding. Please save them as UTF-8.');
  }

  return allFilesAreUtf8;
}

function main() {
  log.section('Documentation & Tooling Validation');

  runCheck('No hardcoded secrets', checkNoSecrets);
  runCheck('MCP config uses placeholders', checkMcpConfig);
  runCheck('File encodings are UTF-8', checkFileEncodings);

  log.section('Validation Summary');
  if (failures > 0) {
    log.error(`${failures} validation check(s) failed. Please fix the issues before committing.`);
    process.exit(1);
  } else {
    log.success('All validation checks passed!');
    log.info('You can now proceed with staging and committing the files.');
  }
}

main();
