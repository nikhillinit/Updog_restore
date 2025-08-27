/**
 * Express compatibility shim for third-party type dependencies
 * Resolves RequestHandler import issues between Express and @types/swagger-ui-express
 */

import type * as core from 'express-serve-static-core';

declare module 'express' {
  // Re-expose RequestHandler as a named export for consumers that import it from 'express'
  export type RequestHandler<
    P = any,
    ResBody = any,
    ReqBody = any,
    ReqQuery = any,
    Locals extends Record<string, any> = Record<string, any>
  > = core.RequestHandler<P, ResBody, ReqBody, ReqQuery, Locals>;

  // Re-export other commonly imported Express types for compatibility
  export type Request<
    P = core.ParamsDictionary,
    ResBody = any,
    ReqBody = any,
    ReqQuery = core.Query,
    Locals extends Record<string, any> = Record<string, any>
  > = core.Request<P, ResBody, ReqBody, ReqQuery, Locals>;

  export type Response<
    ResBody = any,
    Locals extends Record<string, any> = Record<string, any>
  > = core.Response<ResBody, Locals>;

  export type NextFunction = core.NextFunction;
  export type ErrorRequestHandler<
    P = core.ParamsDictionary,
    ResBody = any,
    ReqBody = any,
    ReqQuery = core.Query,
    Locals extends Record<string, any> = Record<string, any>
  > = core.ErrorRequestHandler<P, ResBody, ReqBody, ReqQuery, Locals>;
}