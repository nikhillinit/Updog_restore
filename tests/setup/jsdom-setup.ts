/**
 * jsdom Test Environment Setup
 * Runs ONLY for client-side tests (*.test.tsx files)
 *
 * IMPORTANT: Do NOT manually create JSDOM or override window/document.
 * Vitest's 'environment: jsdom' handles this automatically.
 * Manual overrides break React Testing Library's appendChild logic.
 */

import { afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/react';
import * as React from 'react';

// Make React available globally for JSX files that don't explicitly import it
// This is needed because some source files use JSX without importing React
// (valid in React 17+ with new JSX transform, but esbuild needs the global for some cases)
if (typeof globalThis !== 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).React = React;
}

// Assert jsdom environment was initialized by Vitest
if (typeof window === 'undefined' || typeof document === 'undefined') {
  throw new Error(
    '[jsdom-setup] jsdom environment was not initialized by Vitest. ' +
      'Check test.environment/projects configuration in vitest.config.ts.'
  );
}

if (!document.body) {
  // jsdom should provide <body>, but this is a defensive guard
  const body = document.createElement('body');
  document.documentElement.appendChild(body);
}

// Configure React Testing Library for React 18 compatibility
configure({
  asyncUtilTimeout: 2000,
  // Enable automatic cleanup (default behavior)
  // This prevents "Should not already be working" errors
});

// React 18 Concurrent Features Configuration
if (typeof globalThis !== 'undefined') {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
}

// Force UTC timezone for consistent date handling
process.env.TZ = 'UTC';

// Set test environment
process.env.NODE_ENV = 'test';

// Clean up DOM between tests to prevent leakage
afterEach(() => {
  document.body.innerHTML = '';
});

// Mock import.meta for Vite code
if (typeof globalThis !== 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
  (globalThis as any).import = {
    meta: {
      env: {
        MODE: 'test',
        NODE_ENV: 'test',
      },
    },
  };
}
