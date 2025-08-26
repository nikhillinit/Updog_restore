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