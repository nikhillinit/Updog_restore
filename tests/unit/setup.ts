/**
 * Unit test setup - runs before each unit test file
 * Sets up test environment for isolated unit testing
 */
import { vi, beforeAll, afterAll } from 'vitest';
import '@testing-library/jest-dom';
import { configure } from '@testing-library/react';

// Disable automatic cleanup to avoid conflicts with act
configure({ asyncUtilTimeout: 2000 });

// Force UTC timezone for consistent date handling
process.env.TZ = 'UTC';

// Set test environment
process.env.NODE_ENV = 'test';

// Mock external dependencies that shouldn't be called in unit tests
vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn().mockReturnValue(false)
}));

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

// --- JSDOM polyfills to prevent "Right-hand side of 'instanceof' is not an object" ---

// 1) Some constructors are missing in JSDOM; React uses them in selection logic:
// Apply to both global and window contexts
if (typeof HTMLIFrameElement === 'undefined') {
  class HTMLIFrameElementPolyfill {}
  (global as any).HTMLIFrameElement = HTMLIFrameElementPolyfill;
  (window as any).HTMLIFrameElement = HTMLIFrameElementPolyfill;
}

// 2) Make sure selection APIs exist:
if (typeof window !== 'undefined' && typeof window.getSelection !== 'function') {
  (window as any).getSelection = () => ({
    removeAllRanges: () => {},
    empty: () => {},
    rangeCount: 0,
    getRangeAt: () => null,
    addRange: () => {},
    removeRange: () => {},
    collapse: () => {},
    collapseToStart: () => {},
    collapseToEnd: () => {},
    toString: () => '',
  });
}

// 3) Also ensure document.getSelection exists
if (typeof document !== 'undefined' && typeof document.getSelection !== 'function') {
  (document as any).getSelection = window.getSelection;
}

// 4) Be defensive with focus/select so focus bookkeeping never throws:
if (typeof HTMLElement !== 'undefined' && !HTMLElement.prototype.focus) {
  HTMLElement.prototype.focus = function () { /* no-op */ };
}
if (typeof HTMLInputElement !== 'undefined' && !(HTMLInputElement.prototype as any).select) {
  (HTMLInputElement.prototype as any).select = function () { /* no-op */ };
}