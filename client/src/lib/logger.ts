/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
/**
 * Browser-safe logger for client-side code
 */

// Browser-safe environment check
const isDevelopment = import.meta.env?.MODE === 'development' || 
                     (typeof window !== 'undefined' && window.location?.hostname === 'localhost');

// Simple browser logger that mimics winston interface
const createBrowserLogger = () => ({
  info: (message: string, meta?: Record<string, unknown>) => {
    if (isDevelopment) {
      console.info(`[INFO] ${message}`, meta ? meta : '');
    }
  },
  error: (message: string, error?: Error, meta?: Record<string, unknown>) => {
    console.error(`[ERROR] ${message}`, error?.message || error, meta ? meta : '');
  },
  warn: (message: string, meta?: Record<string, unknown>) => {
    if (isDevelopment) {
      console.warn(`[WARN] ${message}`, meta ? meta : '');
    }
  },
  debug: (message: string, meta?: Record<string, unknown>) => {
    if (isDevelopment) {
      console.debug(`[DEBUG] ${message}`, meta ? meta : '');
    }
  },
});

export const logger = createBrowserLogger();

// Helper for structured logging
export const log = {
  info: (message: string, meta?: Record<string, unknown>) =>
    logger.info(message, meta),
  error: (message: string, error?: Error, meta?: Record<string, unknown>) =>
    logger.error(message, error, meta),
  warn: (message: string, meta?: Record<string, unknown>) =>
    logger.warn(message, meta),
  debug: (message: string, meta?: Record<string, unknown>) =>
    logger.debug(message, meta),
};

