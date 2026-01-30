import helmet from 'helmet';
import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { getConfig } from '../config';

declare global {
  namespace Express {
    interface Locals {
      cspNonce?: string;
    }
  }
}

export function withNonce(_req: Request, res: Response, next: NextFunction) {
  res.locals.cspNonce = crypto.randomBytes(16).toString('base64');
  next();
}

export function csp() {
  const cfg = getConfig();
  const isDev = cfg.NODE_ENV === 'development';

  return helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        fontSrc: ["'self'", 'data:', 'https:'],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        objectSrc: ["'none'"],
        scriptSrc: [
          "'self'",
          (_req: Request, res: Response) => `'nonce-${res.locals.cspNonce}'`,
          isDev ? "'unsafe-eval'" : null,
        ].filter(Boolean) as string[],
        scriptSrcAttr: ["'none'"],
        styleSrc: [
          "'self'",
          (_req: Request, res: Response) => `'nonce-${res.locals.cspNonce}'`,
          isDev ? "'unsafe-inline'" : null,
        ].filter(Boolean) as string[],
        connectSrc: ["'self'"],
        upgradeInsecureRequests: isDev ? [] : [],
        reportUri: '/api/csp-violations',
      },
      reportOnly: cfg.CSP_REPORT_ONLY,
    },
    crossOriginEmbedderPolicy: false,
  });
}
