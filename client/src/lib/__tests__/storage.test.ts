/**
 * Storage Layer Tests
 * Comprehensive test suite for production-grade localStorage wrapper
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { z } from 'zod';
import {
  loadFromStorage,
  saveToStorage,
  removeFromStorage,
  clearExpiredData,
  getStorageStats
} from '../storage';

// Mock localStorage
const mockStorage: Record<string, string> = {};

beforeEach(() => {
  // Clear mock storage
  Object.keys(mockStorage).forEach(key => delete mockStorage[key]);

  // Mock localStorage API
  Object.defineProperty(global, 'localStorage', {
    value: {
      getItem: (key: string) => mockStorage[key] || null,
      setItem: (key: string, value: string) => {
        mockStorage[key] = value;
      },
      removeItem: (key: string) => {
        delete mockStorage[key];
      },
      clear: () => {
        Object.keys(mockStorage).forEach(key => delete mockStorage[key]);
      },
      get length() {
        return Object.keys(mockStorage).length;
      },
      key: (index: number) => Object.keys(mockStorage)[index] || null
    },
    writable: true
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ============================================================================
// BASIC FUNCTIONALITY
// ============================================================================

describe('saveToStorage', () => {
  const TestSchema = z.object({ value: z.number() });

  it('should save data successfully', () => {
    const result = saveToStorage('modeling-wizard-progress', { value: 42 }, TestSchema);
    expect(result).toBe(true);
  });

  it('should return false for disallowed keys', () => {
    const result = saveToStorage('evil-key', { value: 42 }, TestSchema);
    expect(result).toBe(false);
  });

  it('should return false for invalid data', () => {
    const result = saveToStorage('modeling-wizard-progress', { value: 'not-a-number' }, TestSchema);
    expect(result).toBe(false);
  });

  it('should namespace keys correctly', () => {
    saveToStorage('modeling-wizard-progress', { value: 42 });
    expect(mockStorage['povc:modeling-wizard-progress']).toBeDefined();
    expect(mockStorage['modeling-wizard-progress']).toBeUndefined();
  });

  it('should include version and timestamp', () => {
    saveToStorage('modeling-wizard-progress', { value: 42 });
    const stored = JSON.parse(mockStorage['povc:modeling-wizard-progress']);
    expect(stored.v).toBe(1);
    expect(stored.at).toBeTypeOf('number');
    expect(stored.data).toEqual({ value: 42 });
  });
});

describe('loadFromStorage', () => {
  const TestSchema = z.object({ value: z.number() });

  it('should load saved data', () => {
    saveToStorage('modeling-wizard-progress', { value: 42 }, TestSchema);
    const result = loadFromStorage('modeling-wizard-progress', TestSchema);
    expect(result).toEqual({ value: 42 });
  });

  it('should return null for missing keys', () => {
    const result = loadFromStorage('modeling-wizard-progress', TestSchema);
    expect(result).toBeNull();
  });

  it('should return null for disallowed keys', () => {
    const result = loadFromStorage('evil-key', TestSchema);
    expect(result).toBeNull();
  });

  it('should validate against schema', () => {
    // Save invalid data directly (bypassing validation)
    mockStorage['povc:modeling-wizard-progress'] = JSON.stringify({
      v: 1,
      at: Date.now(),
      data: { value: 'not-a-number' }
    });

    const result = loadFromStorage('modeling-wizard-progress', TestSchema);
    expect(result).toBeNull();
  });

  it('should remove invalid data after failed validation', () => {
    mockStorage['povc:modeling-wizard-progress'] = JSON.stringify({
      v: 1,
      at: Date.now(),
      data: { value: 'invalid' }
    });

    loadFromStorage('modeling-wizard-progress', TestSchema);
    expect(mockStorage['povc:modeling-wizard-progress']).toBeUndefined();
  });
});

// ============================================================================
// TTL FUNCTIONALITY
// ============================================================================

describe('TTL (Time-To-Live)', () => {
  const TestSchema = z.object({ value: z.number() });

  it('should return null for expired data', () => {
    // Save data with old timestamp
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000 + 1000);
    mockStorage['povc:modeling-wizard-progress'] = JSON.stringify({
      v: 1,
      at: sevenDaysAgo,
      data: { value: 42 }
    });

    const result = loadFromStorage('modeling-wizard-progress', TestSchema);
    expect(result).toBeNull();
  });

  it('should load non-expired data', () => {
    // Save data with recent timestamp
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    mockStorage['povc:modeling-wizard-progress'] = JSON.stringify({
      v: 1,
      at: oneHourAgo,
      data: { value: 42 }
    });

    const result = loadFromStorage('modeling-wizard-progress', TestSchema);
    expect(result).toEqual({ value: 42 });
  });

  it('should remove expired data after check', () => {
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000 + 1000);
    mockStorage['povc:modeling-wizard-progress'] = JSON.stringify({
      v: 1,
      at: sevenDaysAgo,
      data: { value: 42 }
    });

    loadFromStorage('modeling-wizard-progress', TestSchema);
    expect(mockStorage['povc:modeling-wizard-progress']).toBeUndefined();
  });
});

// ============================================================================
// NAMESPACE ISOLATION
// ============================================================================

describe('Namespace isolation', () => {
  it('should only touch namespaced keys', () => {
    mockStorage['other-key'] = 'should-not-be-touched';
    mockStorage['povc:modeling-wizard-progress'] = JSON.stringify({
      v: 1,
      at: Date.now(),
      data: { value: 42 }
    });

    clearExpiredData();

    expect(mockStorage['other-key']).toBe('should-not-be-touched');
  });

  it('should not match namespace prefix substring', () => {
    // "povcX..." should not match "povc:"
    mockStorage['povcXevil'] = 'should-not-be-touched';
    mockStorage['povc:modeling-wizard-progress'] = JSON.stringify({
      v: 1,
      at: Date.now() - (8 * 24 * 60 * 60 * 1000), // Expired
      data: { value: 42 }
    });

    clearExpiredData();

    expect(mockStorage['povcXevil']).toBe('should-not-be-touched');
    expect(mockStorage['povc:modeling-wizard-progress']).toBeUndefined();
  });
});

// ============================================================================
// CLEAR EXPIRED DATA
// ============================================================================

describe('clearExpiredData', () => {
  it('should remove expired items', () => {
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000 + 1000);

    mockStorage['povc:item1'] = JSON.stringify({
      v: 1,
      at: sevenDaysAgo,
      data: { value: 1 }
    });

    mockStorage['povc:item2'] = JSON.stringify({
      v: 1,
      at: Date.now(),
      data: { value: 2 }
    });

    clearExpiredData();

    expect(mockStorage['povc:item1']).toBeUndefined();
    expect(mockStorage['povc:item2']).toBeDefined();
  });

  it('should remove malformed data', () => {
    mockStorage['povc:malformed'] = 'not-json';
    mockStorage['povc:valid'] = JSON.stringify({
      v: 1,
      at: Date.now(),
      data: { value: 42 }
    });

    clearExpiredData();

    expect(mockStorage['povc:malformed']).toBeUndefined();
    expect(mockStorage['povc:valid']).toBeDefined();
  });

  it('should handle iteration safely (no skip bugs)', () => {
    // Create multiple expired items
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000 + 1000);

    for (let i = 0; i < 5; i++) {
      mockStorage[`povc:item${i}`] = JSON.stringify({
        v: 1,
        at: sevenDaysAgo,
        data: { value: i }
      });
    }

    const initialCount = Object.keys(mockStorage).length;
    expect(initialCount).toBe(5);

    clearExpiredData();

    const finalCount = Object.keys(mockStorage).length;
    expect(finalCount).toBe(0);
  });
});

// ============================================================================
// STATS
// ============================================================================

describe('getStorageStats', () => {
  it('should return correct stats', () => {
    mockStorage['other-key'] = 'other-value';
    mockStorage['povc:item1'] = JSON.stringify({ v: 1, at: Date.now(), data: { value: 1 } });
    mockStorage['povc:item2'] = JSON.stringify({ v: 1, at: Date.now(), data: { value: 2 } });

    const stats = getStorageStats();

    expect(stats.available).toBe(true);
    expect(stats.itemCount).toBe(3);
    expect(stats.namespacedItems).toBe(2);
    expect(stats.estimatedSize).toBeGreaterThan(0);
  });
});

// ============================================================================
// REMOVE
// ============================================================================

describe('removeFromStorage', () => {
  it('should remove item', () => {
    saveToStorage('modeling-wizard-progress', { value: 42 });
    const result = removeFromStorage('modeling-wizard-progress');

    expect(result).toBe(true);
    expect(mockStorage['povc:modeling-wizard-progress']).toBeUndefined();
  });

  it('should return false for disallowed keys', () => {
    const result = removeFromStorage('evil-key');
    expect(result).toBe(false);
  });
});
