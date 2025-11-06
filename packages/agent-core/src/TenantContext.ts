/**
 * Tenant Context Provider
 *
 * Provides multi-tenant isolation for memory and pattern learning.
 * Uses AsyncLocalStorage for context propagation across async boundaries.
 *
 * @example
 * ```typescript
 * // Set tenant context for request
 * TenantContextProvider.run(
 *   { tenantId: 'user123:project456', userId: 'user123', projectId: 'project456' },
 *   async () => {
 *     // All code here has access to tenant context
 *     const agent = new MyAgent();
 *     await agent.execute(input, 'operation');
 *   }
 * );
 *
 * // Get current context
 * const context = TenantContextProvider.require();
 * console.log(context.tenantId); // 'user123:project456'
 * ```
 */

import { AsyncLocalStorage } from 'async_hooks';
import { logger } from './Logger.js';

/**
 * Tenant context with user/project isolation
 */
export interface TenantContext {
  /** Composite tenant ID (e.g., 'user123:project456') */
  tenantId: string;

  /** User ID component */
  userId?: string;

  /** Project ID component */
  projectId?: string;

  /** Organization ID for enterprise features */
  organizationId?: string;

  /** Tenant permissions */
  permissions: TenantPermissions;

  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Permissions for tenant operations
 */
export interface TenantPermissions {
  /** Can read/write global (org-wide) memory */
  canAccessGlobalMemory: boolean;

  /** Can read/write project-scoped memory */
  canAccessProjectMemory: boolean;

  /** Can write to memory (vs read-only) */
  canWriteMemory: boolean;

  /** Can learn patterns across sessions */
  canUsePatternLearning: boolean;

  /** Can share patterns with other users in same project */
  canSharePatterns: boolean;
}

/**
 * Default permissions (most restrictive)
 */
const DEFAULT_PERMISSIONS: TenantPermissions = {
  canAccessGlobalMemory: false,
  canAccessProjectMemory: true,
  canWriteMemory: true,
  canUsePatternLearning: true,
  canSharePatterns: false,
};

/**
 * Tenant Context Provider using AsyncLocalStorage
 *
 * Provides automatic context propagation across async operations
 * without explicit parameter passing.
 */
export class TenantContextProvider {
  private static storage = new AsyncLocalStorage<TenantContext>();

  /**
   * Run a function within a tenant context
   *
   * @param context - Tenant context to set
   * @param fn - Function to execute with context
   * @returns Result of the function
   *
   * @example
   * ```typescript
   * const result = await TenantContextProvider.run(
   *   { tenantId: 'user:project', permissions: {...} },
   *   async () => {
   *     return await someAsyncOperation();
   *   }
   * );
   * ```
   */
  static run<T>(context: Partial<TenantContext> & { tenantId: string }, fn: () => T): T {
    const fullContext = this.normalizeContext(context);

    logger.debug({
      msg: 'Setting tenant context',
      tenantId: fullContext.tenantId,
      userId: fullContext.userId,
      projectId: fullContext.projectId,
    });

    return this.storage.run(fullContext, fn);
  }

  /**
   * Get current tenant context (may be undefined)
   *
   * @returns Current tenant context or undefined if not set
   */
  static get(): TenantContext | undefined {
    return this.storage.getStore();
  }

  /**
   * Get current tenant context (throws if not set)
   *
   * @throws Error if no tenant context is available
   * @returns Current tenant context
   *
   * @example
   * ```typescript
   * const context = TenantContextProvider.require();
   * console.log(context.tenantId);
   * ```
   */
  static require(): TenantContext {
    const context = this.get();
    if (!context) {
      throw new Error('No tenant context available. Use TenantContextProvider.run() to set context.');
    }
    return context;
  }

  /**
   * Check if we're currently in a tenant context
   *
   * @returns true if context is set
   */
  static hasContext(): boolean {
    return this.get() !== undefined;
  }

  /**
   * Normalize and validate tenant context
   *
   * Extracts userId and projectId from composite tenantId if not provided.
   * Applies default permissions.
   */
  private static normalizeContext(context: Partial<TenantContext> & { tenantId: string }): TenantContext {
    const { tenantId } = context;

    // Parse composite tenant ID (format: 'userId:projectId')
    const [userId, projectId] = tenantId.includes(':')
      ? tenantId.split(':', 2)
      : [tenantId, undefined];

    return {
      tenantId,
      userId: context.userId ?? userId,
      projectId: context.projectId ?? projectId,
      organizationId: context.organizationId,
      permissions: { ...DEFAULT_PERMISSIONS, ...context.permissions },
      metadata: context.metadata,
    };
  }

  /**
   * Create tenant context from request (e.g., Express middleware)
   *
   * @param req - Express request object
   * @returns Normalized tenant context
   *
   * @example
   * ```typescript
   * // Express middleware
   * app.use((req, res, next) => {
   *   const context = TenantContextProvider.fromRequest(req);
   *   TenantContextProvider.run(context, () => next());
   * });
   * ```
   */
  static fromRequest(req: {
    headers?: Record<string, string | string[] | undefined>;
    user?: { id: string; organizationId?: string };
    query?: Record<string, any>;
  }): TenantContext {
    // Extract from headers (x-tenant-id, x-user-id, x-project-id)
    const headers = req.headers ?? {};
    const tenantIdHeader = this.getHeader(headers, 'x-tenant-id');
    const userIdHeader = this.getHeader(headers, 'x-user-id');
    const projectIdHeader = this.getHeader(headers, 'x-project-id');

    // Extract from authenticated user
    const userId = userIdHeader ?? req.user?.id;
    const organizationId = req.user?.organizationId;

    // Extract from query params (fallback)
    const projectId = projectIdHeader ?? req.query?.projectId;

    // Build composite tenant ID
    const tenantId = tenantIdHeader ?? (userId && projectId ? `${userId}:${projectId}` : userId ?? 'anonymous');

    return this.normalizeContext({
      tenantId,
      userId,
      projectId,
      organizationId,
    });
  }

  /**
   * Helper: Get header value (handle array case)
   */
  private static getHeader(headers: Record<string, string | string[] | undefined>, name: string): string | undefined {
    const value = headers[name.toLowerCase()];
    return Array.isArray(value) ? value[0] : value;
  }
}

/**
 * Tenant-aware permission check
 *
 * @param permission - Permission to check
 * @throws Error if permission denied
 */
export function requirePermission(permission: keyof TenantPermissions): void {
  const context = TenantContextProvider.require();

  if (!context.permissions[permission]) {
    throw new Error(`Permission denied: ${permission} (tenantId: ${context.tenantId})`);
  }
}

/**
 * Tenant-aware permission check (returns boolean)
 *
 * @param permission - Permission to check
 * @returns true if permission granted
 */
export function hasPermission(permission: keyof TenantPermissions): boolean {
  const context = TenantContextProvider.get();
  return context?.permissions[permission] ?? false;
}

/**
 * Build tenant-specific key prefix
 *
 * @param scope - Memory scope ('user' | 'project' | 'global')
 * @returns Key prefix for storage
 *
 * @example
 * ```typescript
 * const prefix = getTenantKeyPrefix('project');
 * // 'user123:project456'
 *
 * const key = `${prefix}:memory:some-id`;
 * // 'user123:project456:memory:some-id'
 * ```
 */
export function getTenantKeyPrefix(scope: 'user' | 'project' | 'global'): string {
  const context = TenantContextProvider.require();

  switch (scope) {
    case 'user':
      if (!context.userId) {
        throw new Error('User ID not available in tenant context');
      }
      return context.userId;

    case 'project':
      if (!context.projectId) {
        throw new Error('Project ID not available in tenant context');
      }
      return context.tenantId; // userId:projectId

    case 'global':
      requirePermission('canAccessGlobalMemory');
      if (!context.organizationId) {
        throw new Error('Organization ID not available in tenant context');
      }
      return context.organizationId;
  }
}
