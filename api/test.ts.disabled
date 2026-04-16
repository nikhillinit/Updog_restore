import type { VercelRequest, VercelResponse } from './_types';

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.status(200).json({
    message: 'API is working!',
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.url,
  });
}
