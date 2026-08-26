/**
 * Sanitized shape for queue/Redis errors that is safe to log.
 *
 * ioredis ReplyError (and BullMQ-wrapped variants) carry the failing command as
 * an enumerable own property — for AUTH failures that includes the raw
 * credential in `command.args`. Logging the raw error object (console.error,
 * pino err serializer, util.inspect) therefore leaks credential material.
 * This allowlist projection is the only error shape queue code may log.
 */
export interface SanitizedQueueError {
  name: string;
  message: string;
  stack?: string;
}

export function sanitizeQueueError(error: unknown): SanitizedQueueError {
  if (error instanceof Error) {
    const sanitized: SanitizedQueueError = {
      name: error.name || 'Error',
      message: error.message,
    };
    if (error.stack) {
      sanitized.stack = error.stack;
    }
    return sanitized;
  }

  if (typeof error === 'string') {
    return { name: 'Error', message: error };
  }

  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message: unknown }).message;
    return { name: 'Error', message: typeof message === 'string' ? message : 'Unknown error' };
  }

  return {
    name: 'Error',
    message: error === undefined || error === null ? 'Unknown error' : String(error),
  };
}
