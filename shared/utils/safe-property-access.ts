/**
 * Safe property access utilities for TypeScript strict mode compliance
 * Handles index signature access patterns required by noPropertyAccessFromIndexSignature
 */

// Express.js specific safe property access
export function safeAppDisable(app: any, feature: string): void {
  if (app && typeof app['disable'] === 'function') {
    app['disable'](feature);
  }
}

export function safeAppSet(app: any, setting: string, value: any): void {
  if (app && typeof app['set'] === 'function') {
    app['set'](setting, value);
  }
}

export function safeResponseSetHeader(res: any, name: string, value: string): void {
  if (res && typeof res['setHeader'] === 'function') {
    res['setHeader'](name, value);
  }
}

export function safeRequestGetHeader(req: any, name: string): string | undefined {
  if (!req || !req['headers']) return undefined;
  return req['headers'][name];
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
export function safeMockFunctionCall<T extends (...args: any[]) => any>(
  mockObj: any,
  functionName: string,
  ...args: Parameters<T>
): ReturnType<T> | undefined {
  if (mockObj && typeof mockObj[functionName] === 'function') {
    return mockObj[functionName](...args);
  }
  return undefined;
}

export function safeMockClearAllMocks(mockObj: any): void {
  if (mockObj && typeof mockObj['clearAllMocks'] === 'function') {
    mockObj['clearAllMocks']();
  }
}

// Redis client safe access
export function safeRedisCall<T>(
  client: any,
  method: string,
  ...args: any[]
): Promise<T> | undefined {
  if (client && typeof client[method] === 'function') {
    return client[method](...args);
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
  metrics: any,
  counterName: string,
  labels?: Record<string, string>
): void {
  if (metrics && typeof metrics[counterName] === 'object' && typeof metrics[counterName]['inc'] === 'function') {
    metrics[counterName]['inc'](labels);
  }
}

export function safeMetricsSet(
  metrics: any,
  gaugeName: string,
  value: number,
  labels?: Record<string, string>
): void {
  if (metrics && typeof metrics[gaugeName] === 'object' && typeof metrics[gaugeName]['set'] === 'function') {
    metrics[gaugeName]['set'](value, labels);
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
  obj: any,
  methodName: string,
  ...args: any[]
): T | undefined {
  if (obj && typeof obj[methodName] === 'function') {
    try {
      return obj[methodName](...args);
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
export function createSafeAccessor<T extends Record<string, any>>(obj: T) {
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
      ...args: T[K] extends (...args: any[]) => any ? Parameters<T[K]> : never[]
    ): T[K] extends (...args: any[]) => infer R ? R | undefined : never {
      const fn = obj[method];
      if (typeof fn === 'function') {
        return (fn as any)(...args);
      }
      return undefined as any;
    }
  };
}