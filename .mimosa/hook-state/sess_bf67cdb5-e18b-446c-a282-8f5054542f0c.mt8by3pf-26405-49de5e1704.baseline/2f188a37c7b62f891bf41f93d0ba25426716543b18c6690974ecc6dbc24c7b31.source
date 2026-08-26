/**
 * fault-injector.ts
 * Test-only wrapper to inject NaN/Infinity/extreme numbers into engine outputs.
 *
 * Enable via env:
 *   ENGINE_FAULT_ENABLE=1 (optional; defaults to enabled in NODE_ENV=test)
 *   ENGINE_FAULT_RATE=0.2  (0..1)
 *   ENGINE_FAULT_SEED=42   (deterministic)
 */

export interface FaultOptions {
  rate?: number;          // probability of mutating a numeric leaf
  seed?: number;          // deterministic seed
  targetKeys?: string[];  // keys to prioritize (e.g., ['irr','moic','percentiles'])
}

const defaultTargets = ['irr', 'moic', 'median', 'percentiles'];

export function withFaults<TArgs extends any[], TResult>(
  fn: (...args: TArgs) => Promise<TResult> | TResult,
  opt: FaultOptions = {},
): (...args: TArgs) => Promise<TResult> {
  const enabled =
    process.env['ENGINE_FAULT_ENABLE'] === '1' ||
    process.env['NODE_ENV'] === 'test';

  const rate = clamp01(
    opt.rate ??
      (process.env['ENGINE_FAULT_RATE']
        ? Number(process.env['ENGINE_FAULT_RATE'])
        : 0),
  );
  const seed =
    opt.seed ??
    (process.env['ENGINE_FAULT_SEED']
      ? Number(process.env['ENGINE_FAULT_SEED'])
      : 1337);

  const targets = (opt.targetKeys?.length ? opt.targetKeys : defaultTargets).map(
    (s: any) => s.toLowerCase(),
  );

  const rng = xorshift32(seed);

  return async (...args: TArgs) => {
    const out = await fn(...args);
    if (!enabled || rate <= 0) return out;

    // clone before mutation so we don't corrupt the original
    const clone = safeClone(out);
    return mutateResult(clone, rate, rng, targets);
  };
}

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/** Deterministic PRNG (xorshift32). */
function xorshift32(seed: number) {
  let x = (seed | 0) || 123456789;
  return function rand() {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    // 0..1
    return (x >>> 0) / 0xffffffff;
  };
}

function safeClone<T>(v: T): T {
  // Node 18+ has structuredClone
  // @ts-ignore
  if (typeof structuredClone === 'function') return structuredClone(v);
  return JSON.parse(JSON.stringify(v));
}

type Rand = () => number;

function mutateResult<T>(v: T, rate: number, rnd: Rand, targets: string[]): T {
  const seen = new WeakSet<object>();

  const visit = (node: any, path: string): any => {
    if (node == null) return node;

    // Prefer targeted keys
    const keyLower = path.toLowerCase();
    const isTarget = targets.some((t: any) => keyLower.endsWith(`.${  t}`));

    if (typeof node === 'number') {
      if (rnd() < (isTarget ? Math.min(1, rate * 1.5) : rate)) {
        return mutateNumber(node, rnd);
      }
      return node;
    }

    if (Array.isArray(node)) {
      return node.map((x: any, i: any) => visit(x, `${path}[${i}]`));
    }

    if (typeof node === 'object') {
      if (seen.has(node)) return node;
      seen.add(node);
      const out: any = Array.isArray(node) ? [] : { ...node };
      for (const [k, val] of Object.entries(node)) {
        out[k] = visit(val, `${path}.${k}`);
      }
      return out;
    }

    return node;
  };

  return visit(v, '$');
}

function mutateNumber(n: number, rnd: Rand): number {
  // choose a mutation
  const r = rnd();
  if (r < 0.34) return NaN;
  if (r < 0.67) return rnd() < 0.5 ? Infinity : -Infinity;
  // extreme scaling to shake invariants (kept finite)
  const factor = rnd() < 0.5 ? 1e12 : -1e12;
  return n * factor;
}