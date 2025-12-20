/**
 * CJS Shim for database mock compatibility
 * Minimal CJS mock that delegates to ESM database-mock.ts via __setDelegate()
 *
 * This file exists solely to satisfy require() calls in test setup
 * (specifically db-delegate-link.ts), while keeping the rich TS mock
 * as the source of truth.
 *
 * @see tests/setup/db-delegate-link.ts - Wires delegation with __setDelegate()
 * @see tests/helpers/database-mock.ts - TS source of truth
 */

// Minimal CJS mock shells - delegate to rich TS mock when wired
let delegate = null;

const databaseMock = {
  // Delegate all method calls to the TS mock
  query: (...args) => delegate?.query(...args) ?? Promise.resolve({ rows: [] }),
  execute: (...args) => delegate?.execute(...args) ?? Promise.resolve({ rows: [] }),
  end: (...args) => delegate?.end(...args) ?? Promise.resolve(),

  // Expose delegate setter for db-delegate-link.ts
  __setDelegate(richMock) {
    delegate = richMock;
    // Also wire poolMock's delegate
    if (richMock.pool) {
      poolMock.__setDelegate(richMock.pool);
    }
  },
};

const poolMock = {
  // Delegate to TS mock's pool
  connect: (...args) => delegate?.pool?.connect(...args) ?? Promise.resolve(databaseMock),
  query: (...args) => delegate?.pool?.query(...args) ?? Promise.resolve({ rows: [] }),
  end: (...args) => delegate?.pool?.end(...args) ?? Promise.resolve(),

  __setDelegate(richPoolMock) {
    // Store reference for direct pool access
    this._delegate = richPoolMock;
  },
};

module.exports = {
  databaseMock,
  poolMock,
};
