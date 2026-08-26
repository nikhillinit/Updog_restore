/**
 * Audit Middleware
 * Logs user actions and changes for compliance and debugging
 * Consolidates user authentication context (Express.User) from types/express.d.ts
 */
import type { Request } from 'express';
import { db } from '../db';
import { sql } from 'drizzle-orm';
import { scrubPII } from '../../shared/privacy/pii-scrubber';

export async function audit(req: Request, action: string, entity?: { type?: string; id?: string }, changes?: unknown) {
  const userId = req.user?.id ?? 'anonymous';
  const ip = (req.headers['x-forwarded-for'] ?? req.ip) as string;

  await db.execute(sql`
    INSERT INTO audit_log (user_id, action, entity_type, entity_id, changes, ip_address)
    VALUES (${userId}, ${action}, ${entity?.type ?? null}, ${entity?.id ?? null},
            ${JSON.stringify(scrubPII(changes))}::jsonb, ${ip}::inet)
  `);
}
