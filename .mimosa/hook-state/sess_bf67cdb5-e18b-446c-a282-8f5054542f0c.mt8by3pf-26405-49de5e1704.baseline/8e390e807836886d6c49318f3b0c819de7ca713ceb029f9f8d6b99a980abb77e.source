import type { Request, Response } from 'express';
import type { IncomingMessage } from 'node:http';

import type { JWTClaims } from './jwt';

export const SESSION_COOKIE_NAME = 'updog.session';

export type RequestCredential =
  | { kind: 'none' }
  | { kind: 'bearer'; token: string }
  | { kind: 'cookie'; token: string }
  | { kind: 'ambiguous' }
  | { kind: 'invalid'; reason: 'malformed_bearer' | 'malformed_cookie' | 'duplicate_cookie' };

export type VerifiedRequestCredential = {
  source: 'bearer' | 'cookie';
  token: string;
  claims: JWTClaims;
};

export class RequestCredentialError extends Error {
  readonly code: 'ambiguous_credentials' | 'invalid_credentials';

  constructor(code: 'ambiguous_credentials' | 'invalid_credentials') {
    super(code);
    this.name = 'RequestCredentialError';
    this.code = code;
  }
}

export function sendUnauthorizedResponse(res: Response): Response {
  return res.status(401).json({
    error: 'unauthorized',
    message: 'Valid JWT token required',
  });
}

type CookieReadResult =
  | { kind: 'missing' }
  | { kind: 'value'; value: string }
  | { kind: 'invalid'; reason: 'malformed_cookie' | 'duplicate_cookie' };

type HeaderValue = string | string[] | undefined;

function readSingleCookieHeader(rawCookie: HeaderValue, cookieName: string): CookieReadResult {
  if (rawCookie === undefined) return { kind: 'missing' };
  if (Array.isArray(rawCookie)) return { kind: 'invalid', reason: 'malformed_cookie' };

  let found: string | undefined;
  for (const rawPart of rawCookie.split(';')) {
    const part = rawPart.trim();
    if (!part) continue;

    const separator = part.indexOf('=');
    if (separator <= 0) return { kind: 'invalid', reason: 'malformed_cookie' };

    let name: string;
    let value: string;
    try {
      name = decodeURIComponent(part.slice(0, separator).trim());
      value = decodeURIComponent(part.slice(separator + 1));
    } catch {
      return { kind: 'invalid', reason: 'malformed_cookie' };
    }

    if (name !== cookieName) continue;
    if (found !== undefined) return { kind: 'invalid', reason: 'duplicate_cookie' };
    if (!value) return { kind: 'invalid', reason: 'malformed_cookie' };
    found = value;
  }

  return found === undefined ? { kind: 'missing' } : { kind: 'value', value: found };
}

/**
 * Read one cookie without adding cookie-parser as a dependency. Duplicate names
 * are rejected so a Domain cookie cannot silently shadow the host-only session.
 */
export function readSingleCookie(req: Request, cookieName: string): CookieReadResult {
  return readSingleCookieHeader(req.headers?.cookie, cookieName);
}

function extractCredentialFromHeaders(
  authorization: HeaderValue,
  rawCookie: HeaderValue
): RequestCredential {
  let bearerToken: string | undefined;

  if (Array.isArray(authorization)) {
    return { kind: 'invalid', reason: 'malformed_bearer' };
  }
  if (authorization !== undefined) {
    const match = /^Bearer ([^\s,]+)$/.exec(authorization);
    if (!match?.[1]) return { kind: 'invalid', reason: 'malformed_bearer' };
    bearerToken = match[1];
  }

  const cookie = readSingleCookieHeader(rawCookie, SESSION_COOKIE_NAME);
  if (cookie.kind === 'invalid') return cookie;

  const cookieToken = cookie.kind === 'value' ? cookie.value : undefined;
  if (bearerToken !== undefined && cookieToken !== undefined) return { kind: 'ambiguous' };
  if (bearerToken !== undefined) return { kind: 'bearer', token: bearerToken };
  if (cookieToken !== undefined) return { kind: 'cookie', token: cookieToken };
  return { kind: 'none' };
}

/** Canonical source classifier for user JWT authentication. */
export function extractRequestCredential(req: Request): RequestCredential {
  return extractCredentialFromHeaders(req.header('authorization'), req.headers?.cookie);
}

/** Same credential contract adapted to a Node HTTP upgrade request. */
export function extractUpgradeRequestCredential(
  req: Pick<IncomingMessage, 'headers'>
): RequestCredential {
  return extractCredentialFromHeaders(req.headers.authorization, req.headers.cookie);
}

export function requestCredentialError(credential: RequestCredential): RequestCredentialError {
  return new RequestCredentialError(
    credential.kind === 'ambiguous' ? 'ambiguous_credentials' : 'invalid_credentials'
  );
}
