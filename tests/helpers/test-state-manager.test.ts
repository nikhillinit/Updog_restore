import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStore, type Options, type Store } from 'express-rate-limit';
import { MockTokenRegistry } from './test-auth-helpers';
import { FeatureFlagState, RateLimitState, resetAllState } from './test-state-manager';

const buildRateLimitOptions = (store: Store): Options => ({
  windowMs: 1000,
  limit: 2,
  message: 'Too many requests',
  statusCode: 429,
  legacyHeaders: false,
  standardHeaders: 'draft-6',
  identifier: 'test-limiter',
  requestPropertyName: 'rateLimit',
  skipFailedRequests: false,
  skipSuccessfulRequests: false,
  keyGenerator: () => 'test-key',
  ipv6Subnet: 56,
  handler: (_req, res, _next, _options) => {
    res.status(429).end();
  },
  skip: () => false,
  requestWasSuccessful: () => true,
  store,
  validate: true,
  passOnStoreError: false,
});

describe('FeatureFlagState', () => {
  let flagState: FeatureFlagState;

  beforeEach(() => {
    resetAllState();
    flagState = new FeatureFlagState();
  });

  it('should reset to defaults', () => {
    flagState.setFlag('wizard.v1', { enabled: true });
    flagState.setFlag('test-flag', { enabled: true });
    flagState.resetToDefaults();

    const wizard = flagState.getFlag('wizard.v1');
    const testFlag = flagState.getFlag('test-flag');

    expect(wizard?.enabled).toBe(false);
    expect(wizard?.exposeToClient).toBe(true);
    expect(testFlag).toBeNull();
  });

  it('should set and get flags', () => {
    flagState.setFlag('test-flag', { enabled: true, exposeToClient: false });
    const flag = flagState.getFlag('test-flag');
    expect(flag).toMatchObject({ enabled: true, exposeToClient: false });
  });

  it('should return all flags', () => {
    flagState.setFlag('test-flag', { enabled: true, exposeToClient: true });
    const flags = flagState.getAllFlags();
    expect(flags['wizard.v1']).toBeDefined();
    expect(flags['reserves.v1_1']).toBeDefined();
    expect(flags['test-flag']).toMatchObject({ enabled: true, exposeToClient: true });
  });
});

describe('RateLimitState', () => {
  let rateLimitState: RateLimitState;

  beforeEach(() => {
    resetAllState();
    rateLimitState = new RateLimitState();
  });

  it('should create a fresh memory store', () => {
    const store = rateLimitState.createFreshStore();
    expect(store).toBeInstanceOf(MemoryStore);
    expect(typeof store.increment).toBe('function');
    expect(typeof store.resetKey).toBe('function');
  });

  it('should reset an existing store', async () => {
    const store = rateLimitState.createFreshStore();
    if (store.init) {
      store.init(buildRateLimitOptions(store));
    }

    await store.increment('client-1');
    await store.increment('client-1');

    const beforeReset = store.get ? await store.get('client-1') : undefined;
    expect(beforeReset?.totalHits).toBe(2);

    rateLimitState.resetStore(store);

    const afterReset = store.get ? await store.get('client-1') : undefined;
    expect(afterReset).toBeUndefined();
  });
});

describe('resetAllState', () => {
  beforeEach(() => {
    resetAllState();
  });

  it('should clear registries and flags', async () => {
    const flagState = new FeatureFlagState();
    flagState.setFlag('test-flag', { enabled: true });

    const registry = new MockTokenRegistry();
    registry.addToken('token-1', { sub: 'user-1', role: 'admin' });

    const rateLimitState = new RateLimitState();
    const store = rateLimitState.createFreshStore();
    if (store.init) {
      store.init(buildRateLimitOptions(store));
    }
    await store.increment('client-1');

    resetAllState();

    expect(flagState.getFlag('test-flag')).toBeNull();
    expect(flagState.getFlag('wizard.v1')?.enabled).toBe(false);
    expect(registry.verifyToken('token-1')).toBeNull();

    const cleared = store.get ? await store.get('client-1') : undefined;
    expect(cleared).toBeUndefined();
  });
});
