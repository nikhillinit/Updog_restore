#!/usr/bin/env tsx
/* eslint-disable no-console */
/**
 * Launches the API in memory mode and asserts:
 *  - no Redis connection attempts appear in stdout/stderr
 *  - /health reports mode === 'memory'
 */
import { spawn } from 'node:child_process';
import http from 'node:http';

const PORT = process.env.PORT ? Number(process.env.PORT) : 5022;
const BOOT = 'server/bootstrap.ts';
const TIMEOUT_MS = 4000; // slightly longer than earlier 2500ms to reduce flakes

const child = spawn(
  'npx',
  ['tsx', BOOT],
  { 
    stdio: ['ignore', 'pipe', 'pipe'], 
    env: { 
      ...process.env,
      REDIS_URL: 'memory://',
      ENABLE_QUEUES: '0',
      PORT: String(PORT)
    },
    shell: process.platform === 'win32'
  }
);

let buf = '';
let hadRedisNoise = false;

function onChunk(chunk: Buffer) {
  const s = chunk.toString();
  buf += s;
  // Heuristics: surface-level connection errors or direct connects
  if (/ECONNREFUSED.*6379|connect.*redis|ioredis|node-redis|Attempt.*Redis/i.test(s)) {
    hadRedisNoise = true;
  }
}

child.stdout.on('data', onChunk);
child.stderr.on('data', onChunk);

function killChild() {
  if (!child.killed) {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(child.pid), '/f', '/t']);
    } else {
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 250);
    }
  }
}

function get(url: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, res => {
      let data = '';
      res.on('data', c => (data += c.toString()));
      res.on('end', () => resolve({ status: res.statusCode || 0, body: data }));
    });
    req.on('error', reject);
  });
}

(async () => {
  const started = Date.now();
  // Wait for startup log or until timeout
  while (Date.now() - started < TIMEOUT_MS) {
    if (/startup|listening|on :\d+|ready/i.test(buf)) break;
    await new Promise(r => setTimeout(r, 100));
  }
  
  // Log what we captured for debugging
  if (!buf.includes('startup') && !buf.includes('listening')) {
    console.log('Server startup logs:', buf);
  }

  // Add small delay to ensure server is fully ready
  await new Promise(r => setTimeout(r, 500));

  // Health check
  try {
    const { status, body } = await get(`http://127.0.0.1:${PORT}/health`);
    if (status !== 200) {
      console.error(`FAIL: /health responded with status ${status}`);
      console.error(body);
      killChild();
      process.exit(1);
    }
    const json = JSON.parse(body);
    if (json?.mode !== 'memory') {
      console.error(`FAIL: /health.mode expected 'memory' but got '${json?.mode}'`);
      killChild();
      process.exit(1);
    }
  } catch (e) {
    console.error('FAIL: could not GET /health:', (e as Error).message);
    killChild();
    process.exit(1);
  }

  if (hadRedisNoise) {
    console.error('FAIL: detected Redis connection attempts/noise in logs while in memory mode');
    console.error('--- captured logs ---\n', buf);
    killChild();
    process.exit(1);
  }

  killChild();
  console.log('PASS: memory mode started cleanly with no Redis attempts, /health.mode=memory');
  process.exit(0);
})();