import { describe, expect, it } from 'vitest';
import {
  assertValidSeed,
  createDeterministicRng,
} from '../../../shared/core/calc-substrate/deterministic-rng';

// Pinned vectors: seed 42 through Xorshift32 with FNV-1a fork derivation.
// These are contract constants; a change here is a contract-version change.
const ROOT_VECTOR_SEED_42 = [0.002643892541527748, 0.660311977379024, 0.11095708678476512];
const FORK_ALPHA_VECTOR = [0.6868107812479138, 0.3605633042752743, 0.9070068860892206];
const FORK_BETA_VECTOR = [0.11061038030311465, 0.31423722696490586, 0.008342888206243515];
const FORK_ALPHA_GAMMA_FIRST = 0.04258803394623101;

describe('createDeterministicRng', () => {
  it('produces the exact pinned vector for seed 42', () => {
    const rng = createDeterministicRng(42);
    expect([rng.next(), rng.next(), rng.next()]).toEqual(ROOT_VECTOR_SEED_42);
  });

  it('produces the exact pinned vector for the same seed and fork label', () => {
    const alpha = createDeterministicRng(42).fork('alpha');
    expect([alpha.next(), alpha.next(), alpha.next()]).toEqual(FORK_ALPHA_VECTOR);
  });

  it('keeps different fork labels stable and isolated from each other', () => {
    const rng = createDeterministicRng(42);
    const alpha = rng.fork('alpha');
    const beta = rng.fork('beta');
    expect([beta.next(), beta.next(), beta.next()]).toEqual(FORK_BETA_VECTOR);
    expect([alpha.next(), alpha.next(), alpha.next()]).toEqual(FORK_ALPHA_VECTOR);
    expect(FORK_ALPHA_VECTOR).not.toEqual(FORK_BETA_VECTOR);
  });

  it('fork sequences are call-order independent: advancing the parent does not move a fork', () => {
    const untouched = createDeterministicRng(42);
    const forkBefore = untouched.fork('alpha');

    const advanced = createDeterministicRng(42);
    advanced.next();
    advanced.next();
    advanced.fork('beta').next();
    const forkAfter = advanced.fork('alpha');

    expect([forkAfter.next(), forkAfter.next(), forkAfter.next()]).toEqual([
      forkBefore.next(),
      forkBefore.next(),
      forkBefore.next(),
    ]);
  });

  it('forking the same label twice yields identical independent sequences', () => {
    const rng = createDeterministicRng(42);
    const first = rng.fork('alpha');
    const second = rng.fork('alpha');
    expect(first.next()).toBe(second.next());
    expect(first.next()).toBe(second.next());
  });

  it('supports nested forks with a stable derived path', () => {
    const nested = createDeterministicRng(42).fork('alpha').fork('gamma');
    expect(nested.forkPath).toBe('root/alpha/gamma');
    expect(nested.next()).toBe(FORK_ALPHA_GAMMA_FIRST);
  });

  it('rejects invalid seeds', () => {
    for (const seed of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 32]) {
      expect(() => createDeterministicRng(seed)).toThrow(RangeError);
      expect(() => assertValidSeed(seed)).toThrow(RangeError);
    }
    expect(() => createDeterministicRng(0xffffffff)).not.toThrow();
  });

  it('rejects invalid fork labels', () => {
    const rng = createDeterministicRng(42);
    expect(() => rng.fork('')).toThrow(RangeError);
    expect(() => rng.fork('a/b')).toThrow(RangeError);
  });
});
