/**
 * Node.js Test Environment Setup (Fixed)
 * Runs ONLY for server-side tests (*.test.ts files)
 *
 * TEMPORARILY FIXED VERSION - hooks disabled to avoid Vitest runner issue
 */
import { vi } from 'vitest';

// Force UTC timezone for consistent date handling
process.env.TZ = 'UTC';

// Set test environment
process.env.NODE_ENV = 'test';

// Mock external dependencies for server tests
// TEMPORARILY DISABLED - vi.mock in setup files causes "No test suite found" error
// The issue is that vi.mock() in setup files gets evaluated before test collection
// which can cause module resolution failures that prevent test discovery.
//
// TODO: Move these mocks to individual test files or use a different approach
// vi.mock('fs', async (importOriginal) => {
//   const actual = await importOriginal<typeof import('fs')>();
//   return {
//     ...actual,
//     readFileSync: vi.fn(),
//     writeFileSync: vi.fn(),
//     existsSync: vi.fn().mockReturnValue(true),
//     mkdirSync: vi.fn(),
//     createWriteStream: vi.fn().mockReturnValue({
//       write: vi.fn(),
//       end: vi.fn()
//     })
//   };
// });

// Mock network calls
global.fetch = vi.fn() as any;

// Setup console suppression for cleaner test output
// TEMPORARILY DISABLED - Vitest runner issue
// Hooks cannot be used in setup files before runner is initialized
// const originalConsole = { ...console };
// beforeAll(() => {
//   console.warn = vi.fn();
//   console.error = vi.fn();
//   console.info = vi.fn();
// });

// afterAll(() => {
//   Object.assign(console, originalConsole);
// });

// Alternative: Direct patching (no restoration needed for tests)
console.warn = vi.fn();
console.error = vi.fn();
console.info = vi.fn();