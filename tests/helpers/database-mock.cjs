/**
 * CJS database mock for spawned test-server processes.
 *
 * Vitest workers use the rich TS mock (`database-mock.ts`). Spawned API servers
 * (started via `npm run dev:api`) cannot rely on Vitest internals, so this file
 * provides a lightweight Drizzle-compatible fallback plus optional delegation.
 */

let delegate = null;
const tableStore = new Map();
const VERSIONED_DEFAULT_TABLES = new Set(['lp_metric_runs', 'narrative_runs', 'lp_report_packages']);

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

function toCamelCase(value) {
  return value.replace(/_([a-z])/g, (_, char) => char.toUpperCase());
}

function toSnakeCase(value) {
  return value.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`);
}

function getRowValue(row, key) {
  if (!row || key == null) return undefined;
  if (key in row) return row[key];

  const camelKey = toCamelCase(String(key));
  if (camelKey in row) return row[camelKey];

  const snakeKey = toSnakeCase(String(key));
  if (snakeKey in row) return row[snakeKey];

  return undefined;
}

function valuesEqual(left, right) {
  if (left === right) return true;
  if (left == null || right == null) return false;

  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (!Number.isNaN(leftNumber) && !Number.isNaN(rightNumber)) {
    return leftNumber === rightNumber;
  }

  return String(left) === String(right);
}

function findColumnInTree(obj) {
  if (!obj || typeof obj !== 'object') return null;

  if (typeof obj.fieldName === 'string') return obj.fieldName;

  if (obj.column && typeof obj.column === 'object') {
    if (typeof obj.column.name === 'string') return obj.column.name;
    if (typeof obj.column.fieldName === 'string') return obj.column.fieldName;
  }

  if (
    typeof obj.name === 'string' &&
    !obj.name.includes(' ') &&
    obj.name.length < 64 &&
    ('encoder' in obj || 'dataType' in obj)
  ) {
    return obj.name;
  }

  return null;
}

function collectValuesAndColumns(obj, values, columns, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 10) return;

  if ('encoder' in obj && 'value' in obj && obj.value !== undefined) {
    values.push(obj.value);
  }

  const column = findColumnInTree(obj);
  if (column && !columns.includes(column)) {
    columns.push(column);
  }

  if (Array.isArray(obj)) {
    for (const item of obj) {
      collectValuesAndColumns(item, values, columns, depth + 1);
    }
    return;
  }

  for (const key of Object.keys(obj)) {
    if (key === 'table' || key === 'tableConfig') continue;
    const value = obj[key];
    if (value && typeof value === 'object') {
      collectValuesAndColumns(value, values, columns, depth + 1);
    }
  }
}

function extractFiltersFromClause(whereClause) {
  if (!isPlainObject(whereClause)) return {};

  const values = [];
  const columns = [];
  const filters = {};

  collectValuesAndColumns(whereClause, values, columns);

  for (let index = 0; index < Math.min(columns.length, values.length); index += 1) {
    const column = columns[index];
    const value = values[index];
    if (!column || value === undefined) continue;
    filters[column] = value;
  }

  return filters;
}

function matchesWhere(row, whereClause) {
  if (!isPlainObject(whereClause)) return true;

  const extractedFilters = extractFiltersFromClause(whereClause);
  const simpleObjectFilters = Object.fromEntries(
    Object.entries(whereClause).filter(([, value]) => {
      return (
        value == null ||
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean'
      );
    })
  );

  const filters =
    Object.keys(extractedFilters).length > 0 ? extractedFilters : simpleObjectFilters;

  if (Object.keys(filters).length === 0) {
    return true;
  }

  for (const [key, value] of Object.entries(filters)) {
    const rowValue = getRowValue(row, key);
    if (!valuesEqual(rowValue, value)) return false;
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
        const timestamp = new Date().toISOString();
        if (VERSIONED_DEFAULT_TABLES.has(tableName) && next.version == null) {
          next.version = 1;
        }
        if (next.createdAt == null && next.created_at == null) {
          next.createdAt = timestamp;
        }
        if (next.updatedAt == null && next.updated_at == null) {
          next.updatedAt = timestamp;
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
        where(condition) {
          const rows = tableStore.get(tableName) || [];
          const matchIndex = rows.findIndex((row) => matchesWhere(row, condition));
          if (matchIndex === -1) {
            return {
              returning: () => Promise.resolve([]),
              execute: () => Promise.resolve([]),
            };
          }
          const updated = { ...rows[matchIndex], ...(updateData || {}) };
          rows[matchIndex] = updated;
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
    where(condition) {
      const rows = tableStore.get(tableName) || [];
      const matchIndex = rows.findIndex((row) => matchesWhere(row, condition));
      if (matchIndex === -1) {
        return {
          returning: () => Promise.resolve([]),
          execute: () => Promise.resolve({ affectedRows: 0 }),
        };
      }
      const [deleted] = rows.splice(matchIndex, 1);
      tableStore.set(tableName, rows);
      return {
        returning: () => Promise.resolve(deleted ? [deleted] : []),
        execute: () => Promise.resolve({ affectedRows: deleted ? 1 : 0 }),
      };
    },
    execute: () => Promise.resolve({ affectedRows: 0 }),
  };
}

function createExecuteResult(rows = []) {
  const result = [...rows];
  result.rows = rows;
  result.rowCount = rows.length;
  result.affectedRows = rows.length;
  return result;
}

function createQueryTable(tableName) {
  const normalizedTableName = [
    tableName,
    toSnakeCase(tableName),
    String(tableName).toLowerCase(),
  ].find((candidate) => tableStore.has(candidate)) || tableName;

  const execute = ({ where, limit }) => {
    const rows = [...(tableStore.get(normalizedTableName) || [])];
    const filtered = where ? rows.filter((row) => matchesWhere(row, where)) : rows;
    if (typeof limit === 'number') {
      return filtered.slice(0, limit);
    }
    return filtered;
  };

  return {
    findFirst(options = {}) {
      const [first] = execute({ where: options.where, limit: 1 });
      return Promise.resolve(first);
    },
    findMany(options = {}) {
      return Promise.resolve(execute({ where: options.where, limit: options.limit }));
    },
  };
}

const queryMock = new Proxy(
  {},
  {
    get(_target, property) {
      if (typeof property !== 'string') return undefined;
      return createQueryTable(property);
    },
  }
);

const databaseMock = {
  query: queryMock,
  execute: (...args) => delegate?.execute?.(...args) ?? Promise.resolve(createExecuteResult()),
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
  __reset() {
    delegate = null;
    tableStore.clear();
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
  },
};
