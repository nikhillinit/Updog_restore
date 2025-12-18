/**
 * Node.js Test Environment Setup
 * Runs ONLY for server-side tests (*.test.ts files)
 */
import { vi, beforeAll, afterAll } from 'vitest';

// Force UTC timezone for consistent date handling
process.env.TZ = 'UTC';

// Set test environment
process.env.NODE_ENV = 'test';

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
      end: vi.fn()
    })
  };
});

// Mock network calls with proper Response shape
// This prevents "Cannot read properties of undefined (reading 'status')" errors
global.fetch = vi.fn().mockImplementation(async () => ({
  status: 200,
  ok: true,
  headers: new Map([
    ['content-type', 'application/json'],
    ['etag', 'W/"mock-etag"'],
  ]),
  json: async () => ({}),
  text: async () => '',
  blob: async () => new Blob(),
  arrayBuffer: async () => new ArrayBuffer(0),
  clone: function() { return this; },
}));

// Setup console suppression for cleaner test output
const originalConsole = { ...console };
beforeAll(() => {
  console.warn = vi.fn();
  console.error = vi.fn();
  console.info = vi.fn();
});

afterAll(() => {
  Object.assign(console, originalConsole);
});
