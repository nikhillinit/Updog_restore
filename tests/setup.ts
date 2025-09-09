import '@testing-library/jest-dom';
import 'whatwg-fetch';
import 'vitest-canvas-mock';

// Polyfill TextEncoder/TextDecoder for libraries that need them
import { TextEncoder, TextDecoder } from 'node:util';
(global as any).TextEncoder = TextEncoder;
(global as any).TextDecoder = TextDecoder as any;

// Polyfill ResizeObserver for chart libs/layout
class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
// @ts-ignore
global.ResizeObserver = global.ResizeObserver || RO;

// Stabilize window.matchMedia for components using media queries
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// Mock IntersectionObserver for lazy loading components
class IO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
// @ts-ignore
global.IntersectionObserver = global.IntersectionObserver || IO;

// Prevent console errors from failing tests (but still log them)
const originalError = console.error;
beforeAll(() => {
  console.error = (...args: any[]) => {
    if (
      typeof args[0] === 'string' &&
      (args[0].includes('Warning: ReactDOM.render') ||
       args[0].includes('Warning: useLayoutEffect') ||
       args[0].includes('Not implemented: navigation'))
    ) {
      return;  // Suppress known JSDOM warnings
    }
    originalError.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
});