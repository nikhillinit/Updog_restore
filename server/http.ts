/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import type { RequestHandler, Response as ExResponse } from 'express-serve-static-core';

// Generic route helper — matches Express v4/v5 type shapes without locking to one.
export type Route<
  Params = Record<string, string>,
  ResBody = any,
  ReqBody = any,
  ReqQuery = any,
  Locals extends Record<string, unknown> = Record<string, unknown>
> = RequestHandler<Params, ResBody, ReqBody, ReqQuery, Locals>;

// Small response helpers without Response<T> generics (cross-version safe).
export function ok<T>(res: ExResponse, body: T) {
  return res["status"](200)["json"](body as any);
}
export function created<T>(res: ExResponse, body: T) {
  return res["status"](201)["json"](body as any);
}
export function noContent(res: ExResponse) {
  return res["status"](204)["end"]();
}
export function badRequest(res: ExResponse, message = 'Bad Request') {
  return res["status"](400)["json"]({ message });
}
