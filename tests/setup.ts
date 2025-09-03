import '@testing-library/jest-dom';
import 'whatwg-fetch';
import 'vitest-canvas-mock';

// Polyfill TextEncoder/TextDecoder for libraries that need them
import { TextEncoder, TextDecoder } from 'node:util';
(global as any).TextEncoder = TextEncoder;
(global as any).TextDecoder = TextDecoder as any;

// Polyfill ResizeObserver for chart libs/layout
// (No-op implementations are typically sufficient for unit tests.)
class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
// @ts-ignore
global.ResizeObserver = global.ResizeObserver || RO;