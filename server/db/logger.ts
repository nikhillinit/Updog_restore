/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
// Simple logger for database operations
import { createLogger, format, transports } from 'winston';

// Create a logger instance
export const logger = createLogger({
  level: process.env['LOG_LEVEL'] || 'info',
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.splat(),
    format["json"]()
  ),
  defaultMeta: { service: 'database' },
  transports: [
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.printf(({ level, message, timestamp, ...meta }) => {
          return `${timestamp} ${level}: ${message} ${Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ''}`;
        })
      )
    })
  ]
});

// Export a simplified interface for use in the application
export default {
  info: (message: string, meta?: Record<string, any>) => logger.info(message, meta),
  error: (message: string, meta?: Record<string, any>) => logger.error(message, meta),
  warn: (message: string, meta?: Record<string, any>) => logger.warn(message, meta),
  debug: (message: string, meta?: Record<string, any>) => logger.debug(message, meta)
};
