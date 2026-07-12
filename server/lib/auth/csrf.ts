import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response, CookieOptions } from 'express';

import { getConfig } from '../../config';
import { readSingleCookie, SESSION_COOKIE_NAME } from './request-credentials';

export const CSRF_COOKIE_NAME = 'updog.csrf';
export const CSRF_HEADER_NAME = 'X-CSRF-Token';
export const BROWSER_SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const CSRF_DOMAIN = 'updog-csrf-v1';
const PRE_AUTH_SCOPE = 'login';
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function csrfSecret(): string {
  const secret = getConfig().SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET is required for CSRF protection');
  return secret;
}

function signature(scope: string, nonce: string): string {
  return createHmac('sha256', csrfSecret())
    .update(`${CSRF_DOMAIN}\0${scope}\0${nonce}`)
    .digest('base64url');
}

function createCsrfToken(scope: string): string {
  const nonce = randomBytes(32).toString('base64url');
  return `${nonce}.${signature(scope, nonce)}`;
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function verifyCsrfToken(token: string, scope: string): boolean {
  const separator = token.indexOf('.');
  if (separator <= 0 || separator !== token.lastIndexOf('.')) return false;

  const nonce = token.slice(0, separator);
  const providedSignature = token.slice(separator + 1);
  if (!/^[A-Za-z0-9_-]{43}$/.test(nonce) || !/^[A-Za-z0-9_-]{43}$/.test(providedSignature)) {
    return false;
  }

  return safeEqual(providedSignature, signature(scope, nonce));
}

export function createPreAuthCsrfToken(): string {
  return createCsrfToken(PRE_AUTH_SCOPE);
}

export function createSessionCsrfToken(jti: string): string {
  if (!jti) throw new Error('A jti is required for session-bound CSRF protection');
  return createCsrfToken(`session:${jti}`);
}

export function verifyPreAuthCsrfToken(token: string): boolean {
  return verifyCsrfToken(token, PRE_AUTH_SCOPE);
}

export function verifySessionCsrfToken(token: string, jti: string): boolean {
  return Boolean(jti) && verifyCsrfToken(token, `session:${jti}`);
}

function cookieSecure(): boolean {
  const nodeEnv = getConfig().NODE_ENV;
  return nodeEnv === 'production' || nodeEnv === 'staging';
}

function sharedCookieOptions(): CookieOptions {
  return {
    secure: cookieSecure(),
    sameSite: 'lax',
    path: '/',
    maxAge: BROWSER_SESSION_MAX_AGE_MS,
  };
}

export function setPreAuthCsrfCookie(res: Response): string {
  const csrfToken = createPreAuthCsrfToken();
  res.cookie(CSRF_COOKIE_NAME, csrfToken, {
    ...sharedCookieOptions(),
    httpOnly: false,
  });
  return csrfToken;
}

export function setSessionCsrfCookie(res: Response, jti: string): string {
  const csrfToken = createSessionCsrfToken(jti);
  res.cookie(CSRF_COOKIE_NAME, csrfToken, {
    ...sharedCookieOptions(),
    httpOnly: false,
  });
  return csrfToken;
}

export function setBrowserSessionCookies(res: Response, token: string, jti: string): string {
  res.cookie(SESSION_COOKIE_NAME, token, {
    ...sharedCookieOptions(),
    httpOnly: true,
  });
  return setSessionCsrfCookie(res, jti);
}

export function clearBrowserSessionCookies(res: Response): void {
  const clearOptions: CookieOptions = {
    secure: cookieSecure(),
    sameSite: 'lax',
    path: '/',
  };
  res.clearCookie(SESSION_COOKIE_NAME, { ...clearOptions, httpOnly: true });
  res.clearCookie(CSRF_COOKIE_NAME, { ...clearOptions, httpOnly: false });
}

export function getCsrfCookie(req: Request): string | null {
  const result = readSingleCookie(req, CSRF_COOKIE_NAME);
  return result.kind === 'value' ? result.value : null;
}

function requestMetadataIsAllowed(req: Request): boolean {
  if (req.header('sec-fetch-site')?.toLowerCase() === 'cross-site') return false;

  const origin = req.header('origin');
  if (!origin) return true;

  try {
    const requestOrigin = `${req.protocol}://${req.get('host')}`;
    return new URL(origin).origin === new URL(requestOrigin).origin;
  } catch {
    return false;
  }
}

function requestCsrfPair(req: Request): string | null {
  if (!requestMetadataIsAllowed(req)) return null;

  const cookieToken = getCsrfCookie(req);
  const headerToken = req.header(CSRF_HEADER_NAME);
  if (!cookieToken || !headerToken || !safeEqual(cookieToken, headerToken)) return null;
  return headerToken;
}

function rejectCsrf(res: Response): void {
  res.status(403).json({ error: 'csrf_validation_failed' });
}

/** Enforce session-bound CSRF only for unsafe cookie-authenticated requests. */
export function requireCsrf(req: Request, res: Response, next: NextFunction): void {
  if (!UNSAFE_METHODS.has(req.method.toUpperCase())) return next();
  if (req.authCredential?.source !== 'cookie') return next();

  const jti = req.authCredential.claims.jti;
  const token = requestCsrfPair(req);
  if (typeof jti !== 'string' || !token || !verifySessionCsrfToken(token, jti)) {
    rejectCsrf(res);
    return;
  }
  next();
}

/** Enforce the public pre-auth token used only by browser login. */
export function requirePreAuthCsrf(req: Request, res: Response, next: NextFunction): void {
  const token = requestCsrfPair(req);
  if (!token || !verifyPreAuthCsrfToken(token)) {
    rejectCsrf(res);
    return;
  }
  next();
}

export function hasValidSessionCsrfCookie(req: Request, jti: string): boolean {
  const token = getCsrfCookie(req);
  return token !== null && verifySessionCsrfToken(token, jti);
}
