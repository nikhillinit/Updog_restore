/**
 * Safe property access utilities for TypeScript strict mode compliance
 * Handles index signature access patterns required by noPropertyAccessFromIndexSignature
 */

// Express.js specific safe property access
export function safeAppDisable(app: unknown, feature: string): void {
  if (app && typeof app === 'object' && 'disable' in app && typeof (app as Record<string, unknown>)['disable'] === 'function') {
    ((app as Record<string, unknown>)['disable'] as (feature: string) => void)(feature);
  }
}

export function safeAppSet(app: unknown, setting: string, value: unknown): void {
  if (app && typeof app === 'object' && 'set' in app && typeof (app as Record<string, unknown>)['set'] === 'function') {
    ((app as Record<string, unknown>)['set'] as (setting: string, value: unknown) => void)(setting, value);
  }
}

export function safeResponseSetHeader(res: unknown, name: string, value: string): void {
  if (res && typeof res === 'object' && 'setHeader' in res && typeof (res as Record<string, unknown>)['setHeader'] === 'function') {
    ((res as Record<string, unknown>)['setHeader'] as (name: string, value: string) => void)(name, value);
  }
}

export function safeRequestGetHeader(req: unknown, name: string): string | undefined {
  if (!req || typeof req !== 'object' || !('headers' in req)) return undefined;
  const headers = (req as { headers?: Record<string, unknown> }).headers;
  if (!headers || typeof headers !== 'object') return undefined;
  const value = headers[name];
  return typeof value === 'string' ? value : undefined;
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
export function safeMockFunctionCall<T extends (...args: unknown[]) => unknown>(
  mockObj: unknown,
  functionName: string,
  ...args: Parameters<T>
): ReturnType<T> | undefined {
  if (mockObj && typeof mockObj === 'object' && functionName in mockObj) {
    const fn = (mockObj as Record<string, unknown>)[functionName];
    if (typeof fn === 'function') {
      return (fn as T)(...args);
    }
  }
  return undefined;
}

export function safeMockClearAllMocks(mockObj: unknown): void {
  if (mockObj && typeof mockObj === 'object' && 'clearAllMocks' in mockObj) {
    const fn = (mockObj as Record<string, unknown>)['clearAllMocks'];
    if (typeof fn === 'function') {
      (fn as () => void)();
    }
  }
}

// Redis client safe access
export function safeRedisCall<T>(
  client: unknown,
  method: string,
  ...args: unknown[]
): Promise<T> | undefined {
  if (client && typeof client === 'object' && method in client) {
    const fn = (client as Record<string, unknown>)[method];
    if (typeof fn === 'function') {
      return (fn as (...args: unknown[]) => Promise<T>)(...args);
    }
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
  if (metrics && typeof metrics === 'object' && counterName in metrics) {
    const counter = (metrics as Record<string, unknown>)[counterName];
    if (counter && typeof counter === 'object' && 'inc' in counter) {
      const incFn = (counter as Record<string, unknown>)['inc'];
      if (typeof incFn === 'function') {
        (incFn as (labels?: Record<string, string>) => void)(labels);
      }
    }
  }
}

export function safeMetricsSet(
  metrics: unknown,
  gaugeName: string,
  value: number,
  labels?: Record<string, string>
): void {
  if (metrics && typeof metrics === 'object' && gaugeName in metrics) {
    const gauge = (metrics as Record<string, unknown>)[gaugeName];
    if (gauge && typeof gauge === 'object' && 'set' in gauge) {
      const setFn = (gauge as Record<string, unknown>)['set'];
      if (typeof setFn === 'function') {
        (setFn as (value: number, labels?: Record<string, string>) => void)(value, labels);
      }
    }
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
  if (obj && typeof obj === 'object' && methodName in obj) {
    const method = (obj as Record<string, unknown>)[methodName];
    if (typeof method === 'function') {
      try {
        return (method as (...args: unknown[]) => T)(...args);
      } catch (error) {
        console.error(`Error calling method ${methodName}:`, error);
        return undefined;
      }
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
    call<K extends string & keyof T>(
      method: K,
      ...args: T[K] extends (...args: unknown[]) => unknown ? Parameters<T[K]> : never[]
    ): T[K] extends (...args: unknown[]) => infer R ? R | undefined : never {
      const fn = obj[method];
      if (typeof fn === 'function') {
        return (fn as (...args: unknown[]) => unknown)(...args) as T[K] extends (...args: unknown[]) => infer R ? R | undefined : never;
      }
      return undefined as T[K] extends (...args: unknown[]) => infer R ? R | undefined : never;
    }
  };
}