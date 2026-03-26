/**
 * Browser-safe logger for client-side code
 */

type LoggerMeta = Record<string, unknown> | undefined;

export interface BrowserConsoleSink {
  info: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
}

export interface BrowserLogger {
  info: (message: string, meta?: LoggerMeta) => void;
  error: (message: string, error?: unknown, meta?: LoggerMeta) => void;
  warn: (message: string, meta?: LoggerMeta) => void;
  debug: (message: string, meta?: LoggerMeta) => void;
}

function getBrowserConsoleSink(): BrowserConsoleSink | null {
  const sink = globalThis.console;
  if (!sink) return null;

  return {
    info: sink.info.bind(sink),
    error: sink.error.bind(sink),
    warn: sink.warn.bind(sink),
    debug: sink.debug.bind(sink),
  };
}

export function isDevelopmentRuntime(): boolean {
  const hostname = typeof window === 'undefined' ? undefined : window.location?.hostname;
  return (
    import.meta.env?.MODE === 'development' ||
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1'
  );
}

export function createBrowserLogger(options?: {
  isDevelopment?: boolean;
  sink?: BrowserConsoleSink | null;
}): BrowserLogger {
  const sink = options?.sink ?? getBrowserConsoleSink();
  const isDevelopment = options?.isDevelopment ?? isDevelopmentRuntime();

  const emit = (
    level: keyof BrowserConsoleSink,
    message: string,
    first?: unknown,
    second?: unknown
  ) => {
    sink?.[level](`[${level.toUpperCase()}] ${message}`, first ?? '', second ?? '');
  };

  return {
    info: (message: string, meta?: LoggerMeta) => {
      if (isDevelopment) {
        emit('info', message, meta);
      }
    },
    error: (message: string, error?: unknown, meta?: LoggerMeta) => {
      const errorValue =
        error instanceof Error ? error.message : error === undefined ? '' : error;
      emit('error', message, errorValue, meta);
    },
    warn: (message: string, meta?: LoggerMeta) => {
      if (isDevelopment) {
        emit('warn', message, meta);
      }
    },
    debug: (message: string, meta?: LoggerMeta) => {
      if (isDevelopment) {
        emit('debug', message, meta);
      }
    },
  };
}

export const logger = createBrowserLogger();

// Helper for structured logging
export const log = {
  info: (message: string, meta?: LoggerMeta) => logger.info(message, meta),
  error: (message: string, error?: unknown, meta?: LoggerMeta) => logger.error(message, error, meta),
  warn: (message: string, meta?: LoggerMeta) => logger.warn(message, meta),
  debug: (message: string, meta?: LoggerMeta) => logger.debug(message, meta),
};
