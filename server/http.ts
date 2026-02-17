import type { RequestHandler, Response as ExResponse } from 'express-serve-static-core';

// Generic route helper — matches Express v4/v5 type shapes without locking to one.
// Express generic defaults require `any` to match RequestHandler's built-in signatures.
/* eslint-disable @typescript-eslint/no-explicit-any */
export type Route<
  Params = Record<string, string>,
  ResBody = any,
  ReqBody = any,
  ReqQuery = any,
  Locals extends Record<string, unknown> = Record<string, unknown>,
> = RequestHandler<Params, ResBody, ReqBody, ReqQuery, Locals>;
/* eslint-enable @typescript-eslint/no-explicit-any */

// Small response helpers without Response<T> generics (cross-version safe).
export function ok<T>(res: ExResponse, body: T) {
  return res['status'](200)['json'](body as unknown);
}
export function created<T>(res: ExResponse, body: T) {
  return res['status'](201)['json'](body as unknown);
}
export function noContent(res: ExResponse) {
  return res['status'](204)['end']();
}
export function badRequest(res: ExResponse, message = 'Bad Request') {
  return res['status'](400)['json']({ message });
}
