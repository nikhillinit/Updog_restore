import type { Request, Response, NextFunction } from 'express';

/** Type guard: value is a non-null object with string-keyed properties. */
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;

  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(message, 404);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden') {
    super(message, 403);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409);
  }
}

interface ViteDevServerLike {
  ssrFixStacktrace(_e: unknown): void;
}

export function errorHandler(vite?: ViteDevServerLike) {
  return (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (vite?.ssrFixStacktrace) {
      try {
        vite.ssrFixStacktrace(err);
      } catch (ssrError) {
        // Vite SSR stack trace fix failed - log but don't block error handling
        console.warn(
          '[errors] Vite SSR stack trace fix failed:',
          ssrError instanceof Error ? ssrError.message : String(ssrError)
        );
      }
    }
    const rec = isRecord(err) ? err : undefined;
    const status =
      err instanceof AppError
        ? err.statusCode
        : typeof rec?.['statusCode'] === 'number'
          ? rec['statusCode']
          : typeof rec?.['status'] === 'number'
            ? rec['status']
            : 500;
    const expose = status < 500;
    const code =
      (rec?.['code'] as string | undefined) || (status >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST');
    const message = expose
      ? err instanceof Error
        ? err.message
        : typeof rec?.['message'] === 'string'
          ? rec['message']
          : 'Error'
      : 'Internal Server Error';
    const field = typeof rec?.['field'] === 'string' ? rec['field'] : undefined;
    const reqRec = _req as unknown as Record<string, unknown>;
    const requestId =
      (reqRec['requestId'] as string | undefined) || (reqRec['id'] as string | undefined);
    res.status(status).json({
      code,
      message,
      ...(field ? { field } : {}),
      ts: new Date().toISOString(),
      requestId,
    });
  };
}
