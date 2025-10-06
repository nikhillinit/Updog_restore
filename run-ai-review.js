#!/usr/bin/env node
// Load environment variables from .env.local
import { readFileSync } from 'fs';
import { spawn } from 'child_process';

// Parse .env.local
const envFile = readFileSync('.env.local', 'utf-8');
const envVars = {};
for (const line of envFile.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const match = trimmed.match(/^([A-Z_]+)=(.+)$/);
  if (match) {
    envVars[match[1]] = match[2];
  }
}

// Run the review with env vars
const child = spawn('npm', ['run', 'ai:review', '--', '--package=agent-core', '--tier=cloud'], {
  env: { ...process.env, ...envVars },
  stdio: 'inherit',
  shell: true
});

child.on('exit', (code) => process.exit(code));
