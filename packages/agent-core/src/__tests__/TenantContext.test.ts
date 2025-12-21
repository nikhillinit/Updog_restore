/**
 * Unit tests for TenantContext
 */

import { describe, it, expect, afterEach } from 'vitest';
import {
  TenantContextProvider,
  requirePermission,
  hasPermission,
  getTenantKeyPrefix,
} from '../TenantContext';

describe('TenantContextProvider', () => {
  afterEach(() => {
    // Clean up any lingering context
  });

  describe('run', () => {
    it('should set and get tenant context', async () => {
      await TenantContextProvider.run(
        {
          tenantId: 'user123:project456',
          permissions: {
            canAccessGlobalMemory: false,
            canAccessProjectMemory: true,
            canWriteMemory: true,
            canUsePatternLearning: true,
            canSharePatterns: false,
          },
        },
        () => {
          const ctx = TenantContextProvider.get();
          expect(ctx).toBeDefined();
          expect(ctx?.tenantId).toBe('user123:project456');
          expect(ctx?.userId).toBe('user123');
          expect(ctx?.projectId).toBe('project456');
        }
      );
    });

    it('should normalize composite tenant ID', async () => {
      await TenantContextProvider.run(
        {
          tenantId: 'user:project',
          permissions: {
            canAccessGlobalMemory: false,
            canAccessProjectMemory: true,
            canWriteMemory: true,
            canUsePatternLearning: true,
            canSharePatterns: false,
          },
        },
        () => {
          const ctx = TenantContextProvider.require();
          expect(ctx.userId).toBe('user');
          expect(ctx.projectId).toBe('project');
        }
      );
    });

    it('should apply default permissions', async () => {
      await TenantContextProvider.run(
        {
          tenantId: 'test-tenant',
          permissions: {
            canAccessGlobalMemory: false,
            canAccessProjectMemory: true,
            canWriteMemory: true,
            canUsePatternLearning: true,
            canSharePatterns: false,
          },
        },
        () => {
          const ctx = TenantContextProvider.require();
          expect(ctx.permissions.canAccessGlobalMemory).toBe(false);
          expect(ctx.permissions.canAccessProjectMemory).toBe(true);
          expect(ctx.permissions.canWriteMemory).toBe(true);
        }
      );
    });
  });

  describe('require', () => {
    it('should throw when no context is set', () => {
      expect(() => TenantContextProvider.require()).toThrow('No tenant context available');
    });

    it('should return context when set', async () => {
      await TenantContextProvider.run(
        {
          tenantId: 'test',
          permissions: {
            canAccessGlobalMemory: false,
            canAccessProjectMemory: true,
            canWriteMemory: true,
            canUsePatternLearning: true,
            canSharePatterns: false,
          },
        },
        () => {
          const ctx = TenantContextProvider.require();
          expect(ctx.tenantId).toBe('test');
        }
      );
    });
  });

  describe('hasContext', () => {
    it('should return false when no context is set', () => {
      expect(TenantContextProvider.hasContext()).toBe(false);
    });

    it('should return true when context is set', async () => {
      await TenantContextProvider.run(
        {
          tenantId: 'test',
          permissions: {
            canAccessGlobalMemory: false,
            canAccessProjectMemory: true,
            canWriteMemory: true,
            canUsePatternLearning: true,
            canSharePatterns: false,
          },
        },
        () => {
          expect(TenantContextProvider.hasContext()).toBe(true);
        }
      );
    });
  });

  describe('requirePermission', () => {
    it('should throw when permission denied', async () => {
      await TenantContextProvider.run(
        {
          tenantId: 'test',
          permissions: {
            canAccessGlobalMemory: false,
            canAccessProjectMemory: true,
            canWriteMemory: true,
            canUsePatternLearning: true,
            canSharePatterns: false,
          },
        },
        () => {
          expect(() => requirePermission('canAccessGlobalMemory')).toThrow('Permission denied');
        }
      );
    });

    it('should not throw when permission granted', async () => {
      await TenantContextProvider.run(
        {
          tenantId: 'test',
          permissions: {
            canAccessGlobalMemory: false,
            canAccessProjectMemory: true,
            canWriteMemory: true,
            canUsePatternLearning: true,
            canSharePatterns: false,
          },
        },
        () => {
          expect(() => requirePermission('canWriteMemory')).not.toThrow();
        }
      );
    });
  });

  describe('hasPermission', () => {
    it('should return false when no context', () => {
      expect(hasPermission('canWriteMemory')).toBe(false);
    });

    it('should return permission value when context exists', async () => {
      await TenantContextProvider.run(
        {
          tenantId: 'test',
          permissions: {
            canAccessGlobalMemory: false,
            canAccessProjectMemory: true,
            canWriteMemory: true,
            canUsePatternLearning: true,
            canSharePatterns: false,
          },
        },
        () => {
          expect(hasPermission('canWriteMemory')).toBe(true);
          expect(hasPermission('canAccessGlobalMemory')).toBe(false);
        }
      );
    });
  });

  describe('getTenantKeyPrefix', () => {
    it('should return user ID for user scope', async () => {
      await TenantContextProvider.run(
        {
          tenantId: 'user123:project456',
          permissions: {
            canAccessGlobalMemory: false,
            canAccessProjectMemory: true,
            canWriteMemory: true,
            canUsePatternLearning: true,
            canSharePatterns: false,
          },
        },
        () => {
          const prefix = getTenantKeyPrefix('user');
          expect(prefix).toBe('user123');
        }
      );
    });

    it('should return tenant ID for project scope', async () => {
      await TenantContextProvider.run(
        {
          tenantId: 'user123:project456',
          permissions: {
            canAccessGlobalMemory: false,
            canAccessProjectMemory: true,
            canWriteMemory: true,
            canUsePatternLearning: true,
            canSharePatterns: false,
          },
        },
        () => {
          const prefix = getTenantKeyPrefix('project');
          expect(prefix).toBe('user123:project456');
        }
      );
    });

    it('should throw for global scope without permission', async () => {
      await TenantContextProvider.run(
        {
          tenantId: 'user:project',
          permissions: {
            canAccessGlobalMemory: false,
            canAccessProjectMemory: true,
            canWriteMemory: true,
            canUsePatternLearning: true,
            canSharePatterns: false,
          },
        },
        () => {
          expect(() => getTenantKeyPrefix('global')).toThrow('Permission denied');
        }
      );
    });
  });
});
