import pino from 'pino';

const transport = process.env['NODE_ENV'] !== 'production' ? { target: 'pino-pretty' } : undefined;

export const logger = pino({
  level: process.env['LOG_LEVEL'] || 'info',
  redact: ['req.headers["authorization"]', 'req.headers["cookie"]', 'res.headers["set-cookie"]'],
  ...(transport ? { transport } : {}),
});