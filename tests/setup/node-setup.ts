/**
 * Node.js Test Environment Setup
 * Runs ONLY for server-side tests (*.test.ts files)
 */
import { vi } from 'vitest';
import type { AddressInfo } from 'node:net';
import supertest from 'supertest';

type AddressableServer = {
  address(): AddressInfo | string | null;
};

type SupertestPrototype = Record<PropertyKey, unknown> & {
  serverAddress(app: AddressableServer, path: string): string;
};

const supertestLoopbackPatch = Symbol.for('updog.supertest.loopback-address');
const supertestPrototype = (
  supertest as typeof supertest & { Test: { prototype: SupertestPrototype } }
).Test.prototype;

if (supertestPrototype[supertestLoopbackPatch] !== true) {
  const originalServerAddress = supertestPrototype.serverAddress;

  supertestPrototype.serverAddress = function serverAddress(app, path) {
    const generatedAddress = originalServerAddress.call(this, app, path);
    const listeningAddress = app.address();

    if (
      !listeningAddress ||
      typeof listeningAddress === 'string' ||
      listeningAddress.family !== 'IPv6' ||
      (listeningAddress.address !== '::' && listeningAddress.address !== '::1')
    ) {
      return generatedAddress;
    }

    return generatedAddress.replace('://127.0.0.1:', '://[::1]:');
  };

  Object.defineProperty(supertestPrototype, supertestLoopbackPatch, {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false,
  });
}

// Force UTC timezone for consistent date handling
process.env.TZ = 'UTC';

// Set test environment
process.env.NODE_ENV = 'test';
// Explicit test value for async fund-scenario deadline fencing.
process.env.FUND_SCENARIO_HARD_TIMEOUT_MS = '30000';

// Mock external dependencies for server tests
// fs mock - NO conditional check needed (always Node environment)
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    existsSync: vi.fn().mockReturnValue(true),
    mkdirSync: vi.fn(),
    createWriteStream: vi.fn().mockReturnValue({
      write: vi.fn(),
      end: vi.fn(),
    }),
  };
});

// Mock network calls
global.fetch = vi.fn();

// Note: Console suppression is handled within individual test files via beforeEach/afterEach
// as appropriate. Module-level beforeAll/afterAll hooks cause "Vitest failed to find the runner"
// error when executed before test runner initialization.
