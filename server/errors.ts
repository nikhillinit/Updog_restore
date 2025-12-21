/* eslint-disable @typescript-eslint/no-explicit-any */
 
 
 
 
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
   
  return (err: any, _req: any, res: any, _next: any) => {
    if (vite?.ssrFixStacktrace) {
      try { vite.ssrFixStacktrace(err); } catch {}
    }
    const status = typeof err?.statusCode === 'number'
      ? err.statusCode
      : typeof err?.status === 'number'
        ? err.status
        : 500;
    const expose = status < 500;
    res["status"](status)["json"]({
      code: err?.code || (status >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST'),
      message: expose ? (err?.message || 'Error') : 'Internal Server Error',
      ...(err?.field ? { field: err.field } : {}),
      ts: new Date().toISOString(),
      requestId: _req?.requestId || _req?.id
    });
  };
}
