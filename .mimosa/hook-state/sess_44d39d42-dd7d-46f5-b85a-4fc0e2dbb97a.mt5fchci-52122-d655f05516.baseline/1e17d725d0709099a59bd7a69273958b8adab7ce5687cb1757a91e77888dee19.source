/**
 * Injected deterministic random source with labeled forks (Tranche 1 substrate).
 *
 * Fork seeds are derived from the immutable root seed plus the full fork path,
 * never from mutable generator state, so fork sequences are call-order
 * independent: advancing the parent (or a sibling) before forking does not
 * change the child sequence.
 *
 * Reuses the repository Xorshift32 generator and FNV-1a seed derivation from
 * shared/core/optimization/SeededRNG rather than introducing a parallel RNG.
 */

import { SeededRNG, deriveSeed } from '../optimization/SeededRNG';

const MAX_UINT32 = 0xffffffff;

export interface CalcRng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [min, max] inclusive. */
  nextInt(min: number, max: number): number;
  /** Derive an isolated child generator for the given label. */
  fork(label: string): CalcRng;
  readonly rootSeed: number;
  readonly forkPath: string;
}

export function assertValidSeed(seed: number): void {
  if (typeof seed !== 'number' || !Number.isInteger(seed) || seed < 1 || seed > MAX_UINT32) {
    throw new RangeError(
      `calc-substrate seed must be an integer in [1, ${MAX_UINT32}], received: ${String(seed)}`
    );
  }
}

function assertValidForkLabel(label: string): void {
  if (typeof label !== 'string' || label.length === 0) {
    throw new RangeError('fork label must be a non-empty string');
  }
  // '/' delimits fork-path segments; allowing it in labels would let two
  // different fork trees collapse onto the same derived path.
  if (label.includes('/')) {
    throw new RangeError(`fork label must not contain '/': ${label}`);
  }
}

class DeterministicRng implements CalcRng {
  readonly rootSeed: number;
  readonly forkPath: string;
  private readonly generator: SeededRNG;

  constructor(rootSeed: number, forkPath: string, generatorSeed: number) {
    this.rootSeed = rootSeed;
    this.forkPath = forkPath;
    this.generator = new SeededRNG(generatorSeed);
  }

  next(): number {
    return this.generator.next();
  }

  nextInt(min: number, max: number): number {
    return this.generator.nextInt(min, max);
  }

  fork(label: string): CalcRng {
    assertValidForkLabel(label);
    const childPath = `${this.forkPath}/${label}`;
    const childSeed = deriveSeed(`${this.rootSeed}:${childPath}`);
    return new DeterministicRng(this.rootSeed, childPath, childSeed);
  }
}

export function createDeterministicRng(seed: number): CalcRng {
  assertValidSeed(seed);
  return new DeterministicRng(seed, 'root', seed);
}
