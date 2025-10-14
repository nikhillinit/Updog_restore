import pino from 'pino';

export const logger = pino({
  level: process.env['LOG_LEVEL'] || 'info',
  redact: ['req.headers["authorization"]', 'req.headers["cookie"]', 'res.headers["set-cookie"]'],
  transport: process.env['NODE_ENV'] !== 'production' ? { target: 'pino-pretty' } : undefined,
});