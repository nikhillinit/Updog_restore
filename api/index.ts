import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.status(200).json({
    message: 'API root endpoint',
    endpoints: {
      health: '/api/health',
      test: '/api/test',
      version: '/api/version'
    },
    timestamp: new Date().toISOString()
  });
}