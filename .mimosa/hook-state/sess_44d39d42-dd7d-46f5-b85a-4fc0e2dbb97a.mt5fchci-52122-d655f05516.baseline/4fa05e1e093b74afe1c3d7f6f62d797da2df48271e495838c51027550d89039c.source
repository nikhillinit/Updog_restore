/**
 * Minimal Vercel Function types — replaces @vercel/node dependency.
 * Only the subset actually used by our /api stubs.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';

export interface VercelRequest extends IncomingMessage {
  query: Record<string, string | string[]>;
  body: unknown;
}

export interface VercelResponse extends ServerResponse {
  status(code: number): VercelResponse;
  json(data: unknown): VercelResponse;
  send(data: unknown): VercelResponse;
}
