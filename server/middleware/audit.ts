// server/middleware/audit.ts
import { Request } from 'express';
import { db } from '../db';
import { sql } from 'drizzle-orm';
import { scrubPII } from '../../shared/privacy/pii-scrubber';

// Define authenticated request interface
interface AuthenticatedRequest extends Request {
  user?: { 
    id: string;
    email?: string;
    orgId?: string;
  };
}

export async function audit(req: Request, action: string, entity?: { type?: string; id?: string }, changes?: unknown) {
  const userId = (req as AuthenticatedRequest).user?.id ?? 'anonymous';
  const ip = (req.headers['x-forwarded-for'] ?? req.ip) as string;
  
  await db.execute(sql`
    INSERT INTO audit_log (user_id, action, entity_type, entity_id, changes, ip_address)
    VALUES (${userId}, ${action}, ${entity?.type ?? null}, ${entity?.id ?? null}, 
            ${JSON.stringify(scrubPII(changes))}::jsonb, ${ip}::inet)
  `);
}
