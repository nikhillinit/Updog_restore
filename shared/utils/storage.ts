/**
 * Universal storage abstraction for browser and Node environments
 * Provides consistent API across localStorage, sessionStorage, and memory storage
 */

export interface KV {
  getItem(_key: string): string | null;
  setItem(_key: string, value: string): void;
  removeItem(_key: string): void;
  clear(): void;
}

class MemoryStorage implements KV {
  private store = new Map<string, string>();
  
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  
  removeItem(key: string): void {
    this.store.delete(key);
  }
  
  clear(): void {
    this.store.clear();
  }
}

// Global memory storage instance for Node environments
let globalMemoryStorage: MemoryStorage | undefined;

/**
 * Get storage implementation based on environment
 * Priority: localStorage > sessionStorage > memory
 */
export function getStorage(type: 'local' | 'session' = 'local'): KV {
  // Browser environment
  if (typeof window !== 'undefined') {
    if (type === 'session' && window.sessionStorage) {
      return window.sessionStorage;
    }
    if (window.localStorage) {
      return window.localStorage;
    }
  }
  
  // Node/test environment - use global memory storage
  if (!globalMemoryStorage) {
    globalMemoryStorage = new MemoryStorage();
    // Also attach to global for test access
    if (typeof globalThis !== 'undefined') {
      (globalThis as any).__memoryStorage = globalMemoryStorage;
    }
  }
  
  return globalMemoryStorage;
}

/**
 * Type-safe storage wrapper with JSON serialization
 */
export class TypedStorage<T = any> {
  constructor(
    private readonly key: string,
    private readonly storage: KV = getStorage()
  ) {}
  
  get(): T | null {
    try {
      const raw = this.storage.getItem(this.key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
  
  set(value: T): void {
    this.storage.setItem(this.key, JSON.stringify(value));
  }
  
  remove(): void {
    this.storage.removeItem(this.key);
  }
  
  update(fn: (_current: T | null) => T): void {
    const current = this.get();
    this.set(fn(current));
  }
}

// Export for test environments
export { MemoryStorage };