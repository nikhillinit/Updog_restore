// server/middleware/correlation.ts
import { randomUUID } from 'crypto';
import { FastifyRequest, FastifyReply } from 'fastify';

export function correlation(req: FastifyRequest, reply: FastifyReply, done: any) {
  const id = (req.headers['x-correlation-id'] as string) || randomUUID();
  (req as any).correlationId = id;
  reply.header('x-correlation-id', id);
  done();
}
