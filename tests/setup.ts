import '@testing-library/jest-dom';
import 'whatwg-fetch';
import 'vitest-canvas-mock';

// Polyfill ResizeObserver for chart libs/layout
// (No-op implementations are typically sufficient for unit tests.)
class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
// @ts-ignore
global.ResizeObserver = global.ResizeObserver || RO;