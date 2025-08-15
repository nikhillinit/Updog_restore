import '@testing-library/jest-dom';
import 'whatwg-fetch';
import { vi } from 'vitest';

// Mock canvas without native dependencies
Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  value: vi.fn(() => ({
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    clearRect: vi.fn(),
    arc: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    measureText: vi.fn(() => ({ width: 100 })),
    fillText: vi.fn(),
    strokeText: vi.fn(),
    // Add more canvas methods as needed for chart components
  }))
});

// Mock ResizeObserver for chart components
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));