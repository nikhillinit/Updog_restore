import pino from 'pino';

const pinoOptions: pino.LoggerOptions = {
  level: process.env['LOG_LEVEL'] || 'info',
  redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
};

if (process.env['NODE_ENV'] !== 'production') {
  pinoOptions.transport = { target: 'pino-pretty' };
}

export const logger = pino(pinoOptions);