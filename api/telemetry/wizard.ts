import type { VercelRequest, VercelResponse } from '@vercel/node';

// Simple rate limiting for MVP
const PAYLOAD_LIMIT = 10_000; // 10KB
const RATE_LIMIT_WINDOW = 60_000; // 1 minute
const MAX_REQUESTS = 60; // 1 per second average
const rateLimiter = new Map<string, number[]>();

export default function handler(req: VercelRequest, res: VercelResponse) {
  // Basic rate limiting
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || 
             req.socket?.remoteAddress || 
             'unknown';
  
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW;
  const recentRequests = (rateLimiter.get(ip) || []).filter(t => t > windowStart);
  
  if (recentRequests.length >= MAX_REQUESTS) {
    return res.status(429).json({ error: 'rate_limited' });
  }
  
  recentRequests.push(now);
  rateLimiter.set(ip, recentRequests);
  
  // Payload size check
  const bodyStr = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {});
  if (bodyStr.length > PAYLOAD_LIMIT) {
    return res.status(413).json({ error: 'payload_too_large' });
  }
  
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body ?? {});
    console.log('[wizard-telemetry]', {
      ...body,
      buildId: process.env['VERCEL_GIT_COMMIT_SHA'],
      ts: new Date().toISOString(),
    });
    res.status(204).end();
  } catch {
    // Keep error response minimal
    res.status(400).json({ error: 'bad_request' });
  }
}