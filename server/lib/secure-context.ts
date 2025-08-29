/**
 * Secure Context Management
 * Derives user context from JWT claims only, never trusts client headers
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { db } from '../db.js';
import { sql } from 'drizzle-orm';

export interface UserContext {
  userId: string;       // JWT 'sub' claim
  orgId: string;        // From JWT or user's default org
  fundId?: string;      // From route param or user's default fund
  email: string;        // JWT 'email' claim
  role: string;         // JWT 'role' claim
  partnerId?: string;   // Partner ID if user is a partner
}

export interface JWTClaims {
  sub: string;          // User ID
  email: string;
  role: string;
  org_id?: string;      // Organization ID
  partner_id?: string;  // Partner ID if applicable
  exp: number;
  iat: number;
}

/**
 * Extract and verify user context from JWT
 * NEVER trust X-User-Id or similar headers from client
 */
export function extractUserContext(req: Request): UserContext | null {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  
  const token = authHeader.substring(7);
  
  try {
    // Verify JWT and extract claims
    const claims = jwt.verify(
      token, 
      process.env.JWT_SECRET || 'dev-secret'
    ) as JWTClaims;
    
    // Build context from verified JWT claims only
    const context: UserContext = {
      userId: claims.sub,
      email: claims.email,
      role: claims.role,
      orgId: claims.org_id || '', // Will be resolved from database if not in JWT
      partnerId: claims.partner_id
    };
    
    // Fund ID comes from route params, not headers
    if (req.params.fundId) {
      context.fundId = req.params.fundId;
    }
    
    return context;
  } catch (error) {
    console.error('JWT verification failed:', error);
    return null;
  }
}

/**
 * Middleware to enforce secure context
 */
export function requireSecureContext(
  req: Request & { context?: UserContext },
  res: Response,
  next: NextFunction
): void {
  const context = extractUserContext(req);
  
  if (!context) {
    res.status(401).json({
      error: 'unauthorized',
      message: 'Valid JWT token required'
    });
    return;
  }
  
  // Ignore any client-supplied user headers
  const suspiciousHeaders = [
    'x-user-id',
    'x-user-email', 
    'x-org-id',
    'x-partner-id',
    'x-role'
  ];
  
  for (const header of suspiciousHeaders) {
    if (req.headers[header]) {
      console.warn(`Client attempted to send ${header} header, ignoring`);
      delete req.headers[header];
    }
  }
  
  // Attach verified context to request
  req.context = context;
  next();
}

/**
 * Set database session context for RLS
 * Must be called within a transaction
 */
export async function setDatabaseContext(
  tx: any,
  context: UserContext
): Promise<void> {
  // Set session variables for RLS policies
  await tx.execute(sql`SET LOCAL app.current_user = ${context.userId}`);
  await tx.execute(sql`SET LOCAL app.current_org = ${context.orgId}`);
  
  if (context.fundId) {
    await tx.execute(sql`SET LOCAL app.current_fund = ${context.fundId}`);
  }
  
  if (context.partnerId) {
    await tx.execute(sql`SET LOCAL app.current_partner = ${context.partnerId}`);
  }
  
  // Set role for additional security checks
  await tx.execute(sql`SET LOCAL app.current_role = ${context.role}`);
}

/**
 * Execute query with secure context
 * Automatically sets RLS context within transaction
 */
export async function executeWithContext<T>(
  context: UserContext,
  queryFn: (_tx: any) => Promise<T>
): Promise<T> {
  return await db.transaction(async (tx) => {
    // Set RLS context
    await setDatabaseContext(tx, context);
    
    // Execute the actual query
    return await queryFn(tx);
  });
}

/**
 * Validate fund access for user
 * Ensures user's org has access to the fund
 */
export async function validateFundAccess(
  context: UserContext,
  fundId: string
): Promise<boolean> {
  const result = await executeWithContext(context, async (tx) => {
    const funds = await tx.execute(sql`
      SELECT id FROM funds 
      WHERE id = ${fundId}
      AND organization_id = ${context.orgId}
      LIMIT 1
    `);
    
    return funds.rows.length > 0;
  });
  
  return result;
}

/**
 * Hierarchical flag resolution with secure context
 */
export async function resolveFlags(
  context: UserContext
): Promise<Record<string, any>> {
  return await executeWithContext(context, async (tx) => {
    // Get flags at each level
    const [globalFlags, orgFlags, fundFlags, userFlags] = await Promise.all([
      // Global flags
      tx.execute(sql`
        SELECT key, value FROM feature_flags 
        WHERE scope = 'global' 
        AND enabled = true
      `),
      
      // Organization flags
      tx.execute(sql`
        SELECT key, value FROM feature_flags 
        WHERE scope = 'org' 
        AND scope_id = ${context.orgId}::uuid
        AND enabled = true
      `),
      
      // Fund flags (if fund context exists)
      context.fundId ? tx.execute(sql`
        SELECT key, value FROM feature_flags 
        WHERE scope = 'fund' 
        AND scope_id = ${context.fundId}::uuid
        AND enabled = true
      `) : { rows: [] },
      
      // User flags
      tx.execute(sql`
        SELECT key, value FROM feature_flags 
        WHERE scope = 'user' 
        AND scope_id = ${context.userId}::uuid
        AND enabled = true
      `)
    ]);
    
    // Merge flags with proper precedence: user > fund > org > global
    const merged: Record<string, any> = {};
    
    // Start with global
    for (const row of globalFlags.rows) {
      merged[row.key] = row.value;
    }
    
    // Override with org
    for (const row of orgFlags.rows) {
      merged[row.key] = row.value;
    }
    
    // Override with fund
    for (const row of fundFlags.rows) {
      merged[row.key] = row.value;
    }
    
    // Override with user
    for (const row of userFlags.rows) {
      merged[row.key] = row.value;
    }
    
    return merged;
  });
}

/**
 * Get cache headers for flags endpoint
 * Ensures proper cache isolation
 */
export function getFlagsCacheHeaders(_context: UserContext): Record<string, string> {
  const headers: Record<string, string> = {
    'Cache-Control': 'private, max-age=15, must-revalidate',
    'Surrogate-Control': 'no-store', // Prevent CDN caching
  };
  
  // Build Vary header based on actual context sources
  // Since context comes from JWT, vary on Authorization
  headers['Vary'] = 'Authorization';
  
  return headers;
}

/**
 * Audit log with secure context
 */
export async function auditLog(
  context: UserContext,
  event: {
    action: string;
    entityType: string;
    entityId: string;
    changes?: any;
    metadata?: any;
  }
): Promise<void> {
  await executeWithContext(context, async (tx) => {
    await tx.execute(sql`
      INSERT INTO audit_events (
        event_type,
        actor_sub,
        actor_email,
        organization_id,
        fund_id,
        entity_type,
        entity_id,
        action,
        changes,
        metadata,
        event_time
      ) VALUES (
        ${event.action},
        ${context.userId},
        ${context.email},
        ${context.orgId}::uuid,
        ${context.fundId || null},
        ${event.entityType},
        ${event.entityId}::uuid,
        ${event.action},
        ${JSON.stringify(event.changes || {})}::jsonb,
        ${JSON.stringify(event.metadata || {})}::jsonb,
        NOW()
      )
    `);
  });
}