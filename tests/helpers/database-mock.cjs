/**
 * CJS database mock for spawned test-server processes.
 *
 * Vitest workers use the rich TS mock (`database-mock.ts`). Spawned API servers
 * (started via `npm run dev:api`) cannot rely on Vitest internals, so this file
 * provides a lightweight Drizzle-compatible fallback plus optional delegation.
 */

let delegate = null;
const tableStore = new Map();

// Seed minimal baseline data used by integration routes.
tableStore.set('funds', [
  {
    id: 1,
    name: 'Test Fund I',
    size: '100000000',
    deployedCapital: '0',
    managementFee: '0.02',
    carryPercentage: '0.2',
    vintageYear: 2025,
    status: 'active',
    createdAt: new Date().toISOString(),
  },
]);
tableStore.set('users', [{ id: 1, email: 'test@example.com', role: 'user' }]);

function getTableNameFromObject(table) {
  if (typeof table === 'string') return table;
  if (!table || typeof table !== 'object') return 'unknown_table';

  const drizzleName = table[Symbol.for('drizzle:Name')];
  if (typeof drizzleName === 'string') return drizzleName;

  const tableName = table?._?.name || table?._?.tableName || table?.name;
  if (typeof tableName === 'string') return tableName;

  return 'unknown_table';
}

function nextId(tableName) {
  const rows = tableStore.get(tableName) || [];
  const maxId = rows.reduce((max, row) => {
    const id = Number(row?.id ?? 0);
    return Number.isFinite(id) ? Math.max(max, id) : max;
  }, 0);
  return maxId + 1;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function matchesWhere(row, whereClause) {
  // Handle simple object filters only; Drizzle SQL objects default to "match".
  if (!isPlainObject(whereClause)) return true;
  for (const [key, value] of Object.entries(whereClause)) {
    if (row?.[key] !== value) return false;
  }
  return true;
}

function createSelectBuilder() {
  let tableName = null;
  let whereClause;
  let limitValue;

  const execute = async () => {
    const rows = [...(tableStore.get(tableName) || [])];
    const filtered = whereClause ? rows.filter((row) => matchesWhere(row, whereClause)) : rows;
    return typeof limitValue === 'number' ? filtered.slice(0, limitValue) : filtered;
  };

  const builder = {
    from(table) {
      tableName = getTableNameFromObject(table);
      return builder;
    },
    where(clause) {
      whereClause = clause;
      return builder;
    },
    orderBy() {
      return builder;
    },
    limit(value) {
      limitValue = value;
      return builder;
    },
    execute,
    then(onFulfilled, onRejected) {
      return execute().then(onFulfilled, onRejected);
    },
    catch(onRejected) {
      return execute().catch(onRejected);
    },
    finally(onFinally) {
      return execute().finally(onFinally);
    },
  };

  return builder;
}

function createInsertBuilder(table) {
  const tableName = getTableNameFromObject(table);
  return {
    values(data) {
      const rows = Array.isArray(data) ? data : [data];
      const normalized = rows.map((row) => {
        const next = { ...(row || {}) };
        if (next.id == null) next.id = nextId(tableName);
        if (next.createdAt == null && next.created_at == null) {
          next.createdAt = new Date().toISOString();
        }
        return next;
      });

      const existing = tableStore.get(tableName) || [];
      existing.push(...normalized);
      tableStore.set(tableName, existing);

      const chain = {
        returning: () => Promise.resolve(normalized),
        execute: () => Promise.resolve(normalized),
        onConflictDoUpdate: () => chain,
        onConflictDoNothing: () => chain,
      };
      return chain;
    },
    execute: () => Promise.resolve([]),
  };
}

function createUpdateBuilder(table) {
  const tableName = getTableNameFromObject(table);
  return {
    set(updateData) {
      return {
        where(_condition) { // eslint-disable-line no-unused-vars
          const rows = tableStore.get(tableName) || [];
          if (rows.length === 0) {
            return {
              returning: () => Promise.resolve([]),
              execute: () => Promise.resolve([]),
            };
          }
          const updated = { ...rows[0], ...(updateData || {}) };
          rows[0] = updated;
          tableStore.set(tableName, rows);
          return {
            returning: () => Promise.resolve([updated]),
            execute: () => Promise.resolve([updated]),
          };
        },
      };
    },
  };
}

function createDeleteBuilder(table) {
  const tableName = getTableNameFromObject(table);
  return {
    where(_condition) { // eslint-disable-line no-unused-vars
      const rows = tableStore.get(tableName) || [];
      if (rows.length === 0) {
        return {
          returning: () => Promise.resolve([]),
          execute: () => Promise.resolve({ affectedRows: 0 }),
        };
      }
      const deleted = rows.shift();
      tableStore.set(tableName, rows);
      return {
        returning: () => Promise.resolve(deleted ? [deleted] : []),
        execute: () => Promise.resolve({ affectedRows: deleted ? 1 : 0 }),
      };
    },
    execute: () => Promise.resolve({ affectedRows: 0 }),
  };
}

const databaseMock = {
  query: (...args) => delegate?.query?.(...args) ?? Promise.resolve({ rows: [] }),
  execute: (...args) => delegate?.execute?.(...args) ?? Promise.resolve([]),
  end: (...args) => delegate?.end?.(...args) ?? Promise.resolve(),
  select: (...args) => delegate?.select?.(...args) ?? createSelectBuilder(),
  insert: (...args) => delegate?.insert?.(...args) ?? createInsertBuilder(...args),
  update: (...args) => delegate?.update?.(...args) ?? createUpdateBuilder(...args),
  delete: (...args) => delegate?.delete?.(...args) ?? createDeleteBuilder(...args),
  transaction: (callback) =>
    delegate?.transaction?.(callback) ?? Promise.resolve(callback(databaseMock)),

  __setDelegate(richMock) {
    delegate = richMock;
    if (richMock?.pool) {
      poolMock.__setDelegate(richMock.pool);
    }
  },
};

const poolMock = {
  _delegate: null,
  connect: (...args) =>
    poolMock._delegate?.connect?.(...args) ?? Promise.resolve({ query: databaseMock.query }),
  query: (...args) => poolMock._delegate?.query?.(...args) ?? Promise.resolve({ rows: [] }),
  end: (...args) => poolMock._delegate?.end?.(...args) ?? Promise.resolve(),
  __setDelegate(richPoolMock) {
    poolMock._delegate = richPoolMock;
  },
};

module.exports = {
  databaseMock,
  poolMock,
};
