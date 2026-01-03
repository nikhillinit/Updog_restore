/**
 * Safe property access utilities for TypeScript strict mode compliance
 * Handles index signature access patterns required by noPropertyAccessFromIndexSignature
 */

// Type guard for objects with dynamic methods
function hasMethod(obj: unknown, method: string): obj is Record<string, unknown> {
  return obj !== null && typeof obj === 'object' && typeof (obj as Record<string, unknown>)[method] === 'function';
}

// Type guard for objects with dynamic properties
function hasProperty(obj: unknown, prop: string): obj is Record<string, unknown> {
  return obj !== null && typeof obj === 'object' && prop in (obj as Record<string, unknown>);
}

// Express.js specific safe property access
export function safeAppDisable(app: unknown, feature: string): void {
  if (hasMethod(app, 'disable')) {
    (app['disable'] as (feature: string) => void)(feature);
  }
}

export function safeAppSet(app: unknown, setting: string, value: unknown): void {
  if (hasMethod(app, 'set')) {
    (app['set'] as (setting: string, value: unknown) => void)(setting, value);
  }
}

export function safeResponseSetHeader(res: unknown, name: string, value: string): void {
  if (hasMethod(res, 'setHeader')) {
    (res['setHeader'] as (name: string, value: string) => void)(name, value);
  }
}

export function safeRequestGetHeader(req: unknown, name: string): string | undefined {
  if (!hasProperty(req, 'headers')) return undefined;
  const headers = req['headers'];
  if (!hasProperty(headers, name)) return undefined;
  const headerValue = headers[name];
  return typeof headerValue === 'string' ? headerValue : undefined;
}

// Environment variables safe access
export function safeEnvAccess(key: string): string | undefined {
  return process.env[key];
}

export function safeEnvAccessRequired(key: string): string {
  const value = process.env[key];
  if (value === undefined) {
    throw new Error(`Required environment variable '${key}' is not set`);
  }
  return value;
}

// Object property safe access for dynamic keys
export function safeDynamicPropertyAccess<T>(
  obj: Record<string, T> | undefined | null,
  key: string
): T | undefined {
  if (!obj || typeof obj !== 'object') return undefined;
  return obj[key];
}

export function safeDynamicPropertySet<T>(
  obj: Record<string, T>,
  key: string,
  value: T
): void {
  if (obj && typeof obj === 'object') {
    obj[key] = value;
  }
}

// Mock function safe access (for testing)
export function safeMockFunctionCall<T>(
  mockObj: unknown,
  functionName: string,
  ...args: unknown[]
): T | undefined {
  if (hasMethod(mockObj, functionName)) {
    return (mockObj[functionName] as (...args: unknown[]) => T)(...args);
  }
  return undefined;
}

export function safeMockClearAllMocks(mockObj: unknown): void {
  if (hasMethod(mockObj, 'clearAllMocks')) {
    (mockObj['clearAllMocks'] as () => void)();
  }
}

// Redis client safe access
export function safeRedisCall<T>(
  client: unknown,
  method: string,
  ...args: unknown[]
): Promise<T> | undefined {
  if (hasMethod(client, method)) {
    return (client[method] as (...args: unknown[]) => Promise<T>)(...args);
  }
  return undefined;
}

// Config object safe access
export function safeConfigAccess<T>(
  config: Record<string, T> | undefined | null,
  key: string,
  defaultValue?: T
): T | undefined {
  if (!config || typeof config !== 'object') return defaultValue;
  const value = config[key];
  return value !== undefined ? value : defaultValue;
}

// Metrics object safe access
export function safeMetricsIncrement(
  metrics: unknown,
  counterName: string,
  labels?: Record<string, string>
): void {
  if (!hasProperty(metrics, counterName)) return;
  const counter = metrics[counterName];
  if (hasMethod(counter, 'inc')) {
    (counter['inc'] as (labels?: Record<string, string>) => void)(labels);
  }
}

export function safeMetricsSet(
  metrics: unknown,
  gaugeName: string,
  value: number,
  labels?: Record<string, string>
): void {
  if (!hasProperty(metrics, gaugeName)) return;
  const gauge = metrics[gaugeName];
  if (hasMethod(gauge, 'set')) {
    (gauge['set'] as (value: number, labels?: Record<string, string>) => void)(value, labels);
  }
}

// Headers safe access
export function safeHeadersAccess(
  headers: Record<string, string | string[]> | undefined,
  headerName: string
): string | string[] | undefined {
  if (!headers || typeof headers !== 'object') return undefined;
  return headers[headerName];
}

// Query parameters safe access
export function safeQueryParamAccess(
  query: Record<string, string | string[]> | undefined,
  paramName: string
): string | string[] | undefined {
  if (!query || typeof query !== 'object') return undefined;
  return query[paramName];
}

// Dynamic method invocation with safety
export function safeDynamicMethodCall<T>(
  obj: unknown,
  methodName: string,
  ...args: unknown[]
): T | undefined {
  if (hasMethod(obj, methodName)) {
    try {
      return (obj[methodName] as (...args: unknown[]) => T)(...args);
    } catch (error) {
      console.error(`Error calling method ${methodName}:`, error);
      return undefined;
    }
  }
  return undefined;
}

// Array-like object safe access with proper type constraints
export function safeArrayLikeAccess<T>(
  arrayLike: { readonly [key: string]: T | number | undefined } | undefined,
  index: number
): T | undefined {
  if (!arrayLike || typeof arrayLike !== 'object') return undefined;
  const key = index.toString();
  return arrayLike[key] as T | undefined;
}

// Type-safe wrapper with corrected generic constraints
export function createSafeAccessor<T extends Record<string, unknown>>(obj: T) {
  return {
    get<K extends string & keyof T>(key: K): T[K] | undefined {
      return obj[key];
    },
    set<K extends string & keyof T>(key: K, value: T[K]): void {
      if (key in obj) {
        obj[key] = value;
      }
    },
    has<K extends string & keyof T>(key: K): boolean {
      return key in obj;
    },
    call<K extends string & keyof T, R = unknown>(
      method: K,
      ...args: unknown[]
    ): R | undefined {
      const fn = obj[method];
      if (typeof fn === 'function') {
        return (fn as (...args: unknown[]) => R)(...args);
      }
      return undefined;
    }
  };
}