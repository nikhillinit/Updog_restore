#!/usr/bin/env node
/**
 * Post-Edit Hook - PostToolUse for Edit/Write/MultiEdit
 *
 * Tracks files modified in the session for reconciliation.
 * Lightweight - does not run validation (that's handled by lint:fix hook).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const SESSION_FILES = path.join(REPO_ROOT, '.claude/artifacts/.session-files.json');

// Check kill switch
if (process.env.CLAUDE_HOOKS_DISABLE === '1') {
  process.exit(0);
}

// Get the file path from tool use (if available)
const toolInput = process.env.TOOL_INPUT || '';
const toolResult = process.env.TOOL_RESULT || '';

// Try to extract file path from tool input/result
let filePath = null;

// Look for file_path in JSON input
try {
  const input = JSON.parse(toolInput);
  if (input.file_path) {
    filePath = input.file_path;
  }
} catch {
  // Not JSON, try regex
  const match = toolInput.match(/file_path['":\s]+([^\s'"]+)/);
  if (match) {
    filePath = match[1];
  }
}

// Also check result for file path
if (!filePath && toolResult.includes('File')) {
  const match = toolResult.match(/File.*at:\s*(.+)/);
  if (match) {
    filePath = match[1].trim();
  }
}

if (filePath) {
  // Make path relative to repo root
  const relativePath = path.relative(REPO_ROOT, filePath).replace(/\\/g, '/');

  // Load existing session files
  let sessionFiles = [];
  try {
    if (fs.existsSync(SESSION_FILES)) {
      sessionFiles = JSON.parse(fs.readFileSync(SESSION_FILES, 'utf8'));
    }
  } catch {
    sessionFiles = [];
  }

  // Add file if not already tracked
  if (!sessionFiles.includes(relativePath)) {
    sessionFiles.push(relativePath);

    // Ensure directory exists
    fs.mkdirSync(path.dirname(SESSION_FILES), { recursive: true });
    fs.writeFileSync(SESSION_FILES, JSON.stringify(sessionFiles, null, 2));
  }
}

process.exit(0);
