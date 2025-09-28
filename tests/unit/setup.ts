/**
 * Unit test setup - runs before each unit test file
 * Sets up test environment for isolated unit testing
 */
import { vi, beforeAll, afterAll } from 'vitest';
import '@testing-library/jest-dom';
import { configure } from '@testing-library/react';

// Configure React Testing Library for React 18 compatibility
configure({
  asyncUtilTimeout: 2000,
  // Enable automatic cleanup (default behavior)
  // This prevents "Should not already be working" errors
});

// Force UTC timezone for consistent date handling
process.env.TZ = 'UTC';

// React 18 Concurrent Features Configuration
// Ensure tests work properly with React 18's automatic batching and concurrent rendering
if (typeof globalThis !== 'undefined') {
  // Flag to help RTL work better with React 18
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
}

// Set test environment
process.env.NODE_ENV = 'test';

// Mock external dependencies that shouldn't be called in unit tests
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    existsSync: vi.fn().mockReturnValue(true), // Change to true to avoid creating directories
    mkdirSync: vi.fn(),
    createWriteStream: vi.fn().mockReturnValue({
      write: vi.fn(),
      end: vi.fn()
    })
  };
});

// Mock network calls
global.fetch = vi.fn();

// Mock browser APIs for client-side tests
Object.defineProperty(global, 'localStorage', {
  value: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
    key: vi.fn(),
    length: 0
  },
  writable: true
});

Object.defineProperty(global, 'sessionStorage', {
  value: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
    key: vi.fn(),
    length: 0
  },
  writable: true
});

// Mock window object for client-side tests
Object.defineProperty(global, 'window', {
  value: {
    localStorage: global.localStorage,
    sessionStorage: global.sessionStorage,
    location: { origin: 'http://localhost:3000' },
    navigator: { userAgent: 'test-agent' }
  },
  writable: true
});

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