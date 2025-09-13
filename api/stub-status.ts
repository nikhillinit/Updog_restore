import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(_req: VercelRequest, res: VercelResponse) {
  // Simple stub status for MVP - no complex security needed
  res.json({
    stubMode: process.env.ENABLE_API_STUB === 'true',
    timestamp: new Date().toISOString(),
  });
}