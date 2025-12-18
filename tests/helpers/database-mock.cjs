/**
 * CJS wrapper for database mock
 *
 * This file is loaded by server/db.ts via require() in test environment.
 * It provides a simple mock that doesn't require TypeScript transpilation.
 */

// Simple mock function factory (no vitest dependency for CJS compatibility)
function createMockFn() {
  const fn = function(...args) {
    fn.calls.push(args);
    return fn.mockReturnValue;
  };
  fn.calls = [];
  fn.mockReturnValue = undefined;
  fn.mockResolvedValue = function(val) {
    fn.mockReturnValue = Promise.resolve(val);
    return fn;
  };
  fn.mockReturnValueOnce = function(val) {
    fn.mockReturnValue = val;
    return fn;
  };
  return fn;
}

// Create mock database structure matching Drizzle ORM interface
const databaseMock = {
  query: {
    funds: {
      findFirst: createMockFn().mockResolvedValue(null),
      findMany: createMockFn().mockResolvedValue([]),
    },
    fundBaselines: {
      findFirst: createMockFn().mockResolvedValue(null),
      findMany: createMockFn().mockResolvedValue([]),
    },
    varianceReports: {
      findFirst: createMockFn().mockResolvedValue(null),
      findMany: createMockFn().mockResolvedValue([]),
    },
    fundStateSnapshots: {
      findFirst: createMockFn().mockResolvedValue(null),
      findMany: createMockFn().mockResolvedValue([]),
    },
    snapshotComparisons: {
      findFirst: createMockFn().mockResolvedValue(null),
      findMany: createMockFn().mockResolvedValue([]),
    },
    performanceForecasts: {
      findFirst: createMockFn().mockResolvedValue(null),
      findMany: createMockFn().mockResolvedValue([]),
    },
    portfolioCompanies: {
      findFirst: createMockFn().mockResolvedValue(null),
      findMany: createMockFn().mockResolvedValue([]),
    },
    lots: {
      findFirst: createMockFn().mockResolvedValue(null),
      findMany: createMockFn().mockResolvedValue([]),
    },
  },
  insert: createMockFn().mockReturnValueOnce({
    values: createMockFn().mockResolvedValue({ insertId: 1 }),
    returning: createMockFn().mockResolvedValue([{ id: 1 }]),
  }),
  update: createMockFn().mockReturnValueOnce({
    set: createMockFn().mockReturnValueOnce({
      where: createMockFn().mockResolvedValue({ affectedRows: 1 }),
    }),
  }),
  delete: createMockFn().mockReturnValueOnce({
    where: createMockFn().mockResolvedValue({ affectedRows: 1 }),
  }),
  select: createMockFn().mockReturnValueOnce({
    from: createMockFn().mockReturnValueOnce({
      where: createMockFn().mockResolvedValue([]),
      limit: createMockFn().mockResolvedValue([]),
    }),
  }),
  transaction: async function(callback) {
    return callback(databaseMock);
  },
};

module.exports = { databaseMock };
