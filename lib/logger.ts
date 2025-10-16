import winston from 'winston';

const { combine, timestamp, json, errors, printf } = winston.format;

// Custom format for development
const devFormat = printf(({ level, message, timestamp, ...metadata }) => {
  let msg = `${timestamp} [${level}]: ${message}`;
  if (Object.keys(metadata).length > 0) {
    msg += ` ${JSON.stringify(metadata)}`;
  }
  return msg;
});

// Create logger instance
export const logger = winston.createLogger({
  level: process.env["LOG_LEVEL"] || 'info',
  format: combine(
    errors({ stack: true }),
    timestamp(),
    process.env.NODE_ENV === 'production' ? json() : devFormat
  ),
  transports: [
    new winston.transports.Console({
      stderrLevels: ['error'],
    }),
  ],
});

// Add file transport in production
if (process.env.NODE_ENV === 'production') {
  logger.add(
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
    })
  );
  logger.add(
    new winston.transports.File({
      filename: 'logs/combined.log',
    })
  );
}

// Helper for structured logging
export const log = {
  info: (message: string, meta?: Record<string, unknown>) =>
    logger.info(message, meta),
  error: (message: string, error?: Error, meta?: Record<string, unknown>) =>
    logger.error(message, { error: error?.message, stack: error?.stack, ...meta }),
  warn: (message: string, meta?: Record<string, unknown>) =>
    logger.warn(message, meta),
  debug: (message: string, meta?: Record<string, unknown>) =>
    logger.debug(message, meta),
};