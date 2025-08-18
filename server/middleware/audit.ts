// server/middleware/audit.ts
import { FastifyRequest } from 'fastify';
import { q } from '../db/pg';
import { scrubPII } from '../../shared/privacy/pii-scrubber';

export async function audit(req: FastifyRequest, action: string, entity?: { type?: string; id?: string }, changes?: any) {
  const userId = (req as any).user?.id || 'anonymous';
  const ip = (req.headers['x-forwarded-for'] || req.ip) as string;
  await q(`insert into audit_log (user_id, action, entity_type, entity_id, changes, ip_address)
           values ($1, $2, $3, $4, $5, $6)`, [userId, action, entity?.type ?? null, entity?.id ?? null, JSON.stringify(scrubPII(changes)), ip]);
}
