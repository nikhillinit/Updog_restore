/**
 * jsdom Test Environment Setup
 * Runs ONLY for client-side tests (*.test.tsx files)
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
if (typeof globalThis !== 'undefined') {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
}

// Set test environment
process.env.NODE_ENV = 'test';

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
    location: {
      origin: 'http://localhost:3000',
      hostname: 'localhost'
    },
    navigator: {
      userAgent: 'test-agent',
      sendBeacon: vi.fn()
    },
    setInterval: vi.fn((fn, delay) => setInterval(fn, delay)),
    clearInterval: vi.fn((id) => clearInterval(id)),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    performance: {
      now: vi.fn(() => Date.now()),
      memory: {
        usedJSHeapSize: 100000000,
        totalJSHeapSize: 200000000,
        jsHeapSizeLimit: 2000000000
      }
    }
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

// Mock browser-only APIs
global.PerformanceObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  disconnect: vi.fn(),
  takeRecords: vi.fn(() => [])
})) as any;

global.document = {
  querySelector: vi.fn(() => null),
  createElement: vi.fn(() => ({})),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn()
} as any;

global.navigator = {
  ...global.navigator,
  sendBeacon: vi.fn(() => true),
  userAgent: 'test-agent'
} as any;

// Mock import.meta for browser code
if (typeof globalThis !== 'undefined') {
  (globalThis as any).import = {
    meta: {
      env: {
        MODE: 'test',
        NODE_ENV: 'test'
      }
    }
  };
}
