'use strict';

/**
 * Golden CommonJS database mock (loader-safe) for server/db.ts test initialization.
 *
 * Goals:
 * - Never require TS/ESM or vitest (prevents "Unexpected strict mode reserved word").
 * - Provide stable API surface for both db and pool (prevents null crashes).
 * - Support delegation to the rich TS mock (prevents split-brain).
 * - Be chain-order tolerant (prevents query builder startup crashes).
 * - Provide vi.fn/Jest-like spy surface (mock.calls, FIFO once queue).
 *
 * NOTE:
 * This is primarily an infrastructure seam. With delegate wiring in Vitest setup,
 * most calls will forward to the rich TS mock.
 */

// ------------------------------
// Delegate (shared by db + pool)
// ------------------------------
let _delegate = null; // rich TS mock instance (DatabaseMock from database-mock.ts)

function _setDelegate(richMock) {
  _delegate = richMock || null;
}

function _getDelegate() {
  return _delegate;
}

// ------------------------------
// Monotonic IDs (Date.now + counter)
// ------------------------------
let _lastTs = 0;
let _counter = 0;

function nextId(prefix) {
  const ts = Date.now();
  if (ts === _lastTs) _counter += 1;
  else {
    _lastTs = ts;
    _counter = 0;
  }
  return `${prefix || 'mock'}-${ts}-${_counter}`;
}

// ------------------------------
// Universal chainable builder (Proxy)
// - supports any chain order
// - supports await (thenable)
// ------------------------------
function createBuilder(resolvedValue) {
  const value = resolvedValue !== undefined ? resolvedValue : [];
  const promise = Promise.resolve(value);

  // One proxy instance that returns itself for any unknown method
  const handler = {
    get(_target, prop) {
      // Thenable support
      if (prop === 'then') return promise.then.bind(promise);
      if (prop === 'catch') return promise.catch.bind(promise);
      if (prop === 'finally') return promise.finally.bind(promise);

      // Common terminator
      if (prop === 'execute') return () => Promise.resolve(value);

      // Useful for debugging
      if (prop === Symbol.toStringTag) return 'MockQueryBuilder';
      if (prop === 'inspect' || prop === Symbol.for('nodejs.util.inspect.custom')) {
        return () => '[MockQueryBuilder]';
      }

      // Any method call returns the same builder (chain-order tolerant)
      return (..._args) => proxy;
    },
  };

  const proxy = new Proxy({}, handler);
  return proxy;
}

// ------------------------------
// Spy factory (Jest/Vitest-ish)
// - FIFO once queue
// - spy.mock.calls compatible
// - mockClear clears calls only
// - mockReset clears calls + impl + once queue
// ------------------------------
function createSpy(name, baseImpl) {
  const calls = [];
  const onceQueue = [];
  let impl = null;

  function invoke(fn, ctx, args) {
    try {
      return fn.apply(ctx, args);
    } catch (e) {
      throw e;
    }
  }

  const spy = function (...args) {
    calls.push(args);

    // 1) FIFO "once" queue
    if (onceQueue.length > 0) {
      const fn = onceQueue.shift();
      return invoke(fn, this, args);
    }

    // 2) permanent mock implementation
    if (impl) {
      return invoke(impl, this, args);
    }

    // 3) base implementation (usually delegates)
    if (baseImpl) {
      return invoke(baseImpl, this, args);
    }

    return undefined;
  };

  // Compatibility surfaces
  spy.calls = calls;
  spy.mock = { calls };

  // Metadata
  spy.getMockName = () => name;

  // Core API
  spy.mockImplementation = (fn) => {
    impl = fn;
    return spy;
  };
  spy.mockImplementationOnce = (fn) => {
    onceQueue.push(fn);
    return spy;
  };

  // Return helpers
  spy.mockReturnValue = (val) => spy.mockImplementation(() => val);
  spy.mockReturnValueOnce = (val) => spy.mockImplementationOnce(() => val);
  spy.mockReturnThis = () =>
    spy.mockImplementation(function () {
      return this;
    });

  // Promise helpers
  spy.mockResolvedValue = (val) => spy.mockImplementation(() => Promise.resolve(val));
  spy.mockResolvedValueOnce = (val) => spy.mockImplementationOnce(() => Promise.resolve(val));
  spy.mockRejectedValue = (err) => spy.mockImplementation(() => Promise.reject(err));
  spy.mockRejectedValueOnce = (err) => spy.mockImplementationOnce(() => Promise.reject(err));

  // Clear/reset semantics
  spy.mockClear = () => {
    calls.length = 0;
    // IMPORTANT: keep impl + onceQueue (Jest/Vitest behavior)
    return spy;
  };

  spy.mockReset = () => {
    calls.length = 0;
    onceQueue.length = 0;
    impl = null;
    return spy;
  };

  return spy;
}

// ------------------------------
// DB mock (drizzle-ish surface)
// ------------------------------
function createDatabaseMock() {
  const db = {};

  // execute: delegate to rich mock if present, else empty array
  db.execute = createSpy('execute', async (...args) => {
    const d = _getDelegate();
    if (d && typeof d.execute === 'function') return d.execute(...args);
    return [];
  });

  // aliases
  db.run = db.execute;
  db.query = db.execute;

  // builders: delegate if present; else universal builder
  function builderBase(methodName) {
    return (...args) => {
      const d = _getDelegate();
      if (d && typeof d[methodName] === 'function') return d[methodName](...args);
      return createBuilder([]);
    };
  }

  db.select = createSpy('select', builderBase('select'));
  db.insert = createSpy('insert', builderBase('insert'));
  db.update = createSpy('update', builderBase('update'));
  db.delete = createSpy('delete', builderBase('delete'));

  // transaction: delegate if present; else invoke cb with tx object that includes rollback/commit
  db.transaction = createSpy('transaction', async (cb) => {
    const d = _getDelegate();
    if (d && typeof d.transaction === 'function') {
      return d.transaction(cb);
    }

    const tx = {
      execute: db.execute,
      select: db.select,
      insert: db.insert,
      update: db.update,
      delete: db.delete,
      run: db.execute,
      query: db.execute,
      rollback: createSpy('tx.rollback', async () => undefined),
      commit: createSpy('tx.commit', async () => undefined),
    };

    return cb(tx);
  });

  db.close = createSpy('close', async () => {
    const d = _getDelegate();
    if (d && typeof d.close === 'function') return d.close();
    return undefined;
  });

  // Delegate hooks (module-level)
  db.__setDelegate = (richMock) => {
    _setDelegate(richMock);
    return db;
  };
  db.__getDelegate = () => _getDelegate();

  // Utilities (optional)
  db.__nextId = () => nextId('mock');

  db.__resetCalls = () => {
    Object.values(db).forEach((v) => {
      if (v && typeof v.mockClear === 'function') v.mockClear();
    });
  };

  return db;
}

const databaseMock = createDatabaseMock();

// ------------------------------
// poolMock (shared delegate)
// - Prevents pool=null crashes
// - Delegates to rich mock when possible
// ------------------------------
const poolMock = {
  query: createSpy('pool.query', async (sql, params) => {
    const d = _getDelegate();

    // Prefer a real pool on delegate if it exists
    if (d && d.pool && typeof d.pool.query === 'function') {
      return d.pool.query(sql, params);
    }

    // Otherwise, map to delegate.execute/query if present
    if (d && typeof d.query === 'function') {
      const res = await d.query(sql, params);
      const rows = Array.isArray(res) ? res : res && Array.isArray(res.rows) ? res.rows : [];
      return { rows, rowCount: rows.length };
    }

    if (d && typeof d.execute === 'function') {
      const res = await d.execute(sql, params);
      const rows = Array.isArray(res) ? res : res && Array.isArray(res.rows) ? res.rows : [];
      return { rows, rowCount: rows.length };
    }

    // Fallback: empty result
    return { rows: [], rowCount: 0 };
  }),

  connect: createSpy('pool.connect', async () => {
    const d = _getDelegate();

    // Prefer a real pool.connect if present
    if (d && d.pool && typeof d.pool.connect === 'function') {
      return d.pool.connect();
    }

    // Fallback client
    const client = {
      query: (sql, params) => poolMock.query(sql, params),
      release: createSpy('client.release', () => undefined),
    };
    return client;
  }),

  end: createSpy('pool.end', async () => {
    const d = _getDelegate();
    if (d && d.pool && typeof d.pool.end === 'function') {
      return d.pool.end();
    }
    return undefined;
  }),

  // Optional no-op event hooks some pools expose
  on: createSpy('pool.on', () => poolMock),
  once: createSpy('pool.once', () => poolMock),
  off: createSpy('pool.off', () => poolMock),
};

// ------------------------------
// Export-shape hardening
// - require(...) returns databaseMock directly
// - but supports destructuring { databaseMock, poolMock, createDatabaseMock }
// ------------------------------
databaseMock.databaseMock = databaseMock; // self reference for destructuring
databaseMock.poolMock = poolMock;
databaseMock.createDatabaseMock = createDatabaseMock;

// Optional helpers
databaseMock.__setDelegate = databaseMock.__setDelegate;
databaseMock.__getDelegate = databaseMock.__getDelegate;
databaseMock.setupDatabaseMock = () => databaseMock;
databaseMock.cleanupDatabaseMock = () => {};

// Export as the db itself (most flexible)
module.exports = databaseMock;
