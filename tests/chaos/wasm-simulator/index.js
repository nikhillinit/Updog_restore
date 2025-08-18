#!/usr/bin/env node
/**
 * wasm-simulator/index.js
 * CLI that reads JSON on stdin, randomly corrupts numeric leaves, and prints JSON to stdout.
 *
 * Env:
 *   FAULT_RATE=0.3    (0..1)
 *   FAULT_SEED=42
 *   FAULT_TARGETS=irr,moic,median,percentiles
 *
 * Usage:
 *   echo '{"moic":1.2,"irr":0.14,"percentiles":{"50":1.1}}' | FAULT_RATE=0.5 node index.js
 */

const rate = clamp01(Number(process.env.FAULT_RATE ?? 0));
const seed = Number(process.env.FAULT_SEED ?? 1337);
const targets =
  (process.env.FAULT_TARGETS || 'irr,moic,median,percentiles')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

const rnd = xorshift32(seed);

function main() {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => (input += chunk));
  process.stdin.on('end', () => {
    try {
      const obj = JSON.parse(input || '{}');
      const out = mutate(obj, rate, rnd, targets);
      process.stdout.write(JSON.stringify(out));
    } catch (e) {
      console.error('parse error:', e && e.message);
      process.exit(2);
    }
  });
}

function mutate(v, rate, rnd, targets) {
  const seen = new WeakSet();
  const visit = (node, path) => {
    if (node == null) return node;
    if (typeof node === 'number') {
      const isTarget = targets.some((t) => path.toLowerCase().endsWith('.' + t));
      if (rnd() < (isTarget ? Math.min(1, rate * 1.5) : rate)) return mutateNum(node, rnd);
      return node;
    }
    if (Array.isArray(node)) return node.map((x, i) => visit(x, `${path}[${i}]`));
    if (typeof node === 'object') {
      if (seen.has(node)) return node;
      seen.add(node);
      const out = {};
      for (const [k, val] of Object.entries(node)) out[k] = visit(val, `${path}.${k}`);
      return out;
    }
    return node;
  };
  return visit(v, '$');
}

function mutateNum(n, rnd) {
  const r = rnd();
  if (r < 0.34) return NaN;
  if (r < 0.67) return rnd() < 0.5 ? Infinity : -Infinity;
  const factor = rnd() < 0.5 ? 1e12 : -1e12;
  return n * factor;
}

function xorshift32(seed) {
  let x = (seed | 0) || 123456789;
  return function rand() {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 0xffffffff;
  };
}

function clamp01(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

main();