import type { RequestHandler, Response } from 'express';

// Generic Route helper to avoid repeating Express generics in every handler.
// Usage:
//   type Params = { id: string }; type Res = UserDTO; type Body = never; type Query = never;
//   export const getUser: Route<Params, Res, Body, Query> = async (req, res, next) => { ... }
export type Route<Params = any, Res = any, Body = any, Query = any> =
  RequestHandler<Params, Res, Body, Query>;

export const ok = <T>(res: Response<T>, body: T) => res.status(200).json(body);
export const created = <T>(res: Response<T>, body: T) => res.status(201).json(body);
export const badRequest = (res: Response, message: string) => 
  res.status(400).json({ error: 'Bad Request', message });