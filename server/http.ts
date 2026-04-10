import type { RequestHandler, Response as ExResponse } from 'express-serve-static-core';

// Generic route helper — matches Express v4/v5 type shapes without locking to one.
// Express generic defaults require `any` to match RequestHandler's built-in signatures.
export type Route<
  Params = Record<string, string>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ResBody = any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ReqBody = any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ReqQuery = any,
  Locals extends Record<string, unknown> = Record<string, unknown>,
> = RequestHandler<Params, ResBody, ReqBody, ReqQuery, Locals>;

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
