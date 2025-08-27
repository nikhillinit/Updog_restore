/**
 * Unit test setup - runs before each unit test file
 * Sets up test environment for isolated unit testing
 */

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