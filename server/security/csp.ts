import helmet from "helmet";
import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";
import { getConfig } from "../config";

declare global { 
  namespace Express { 
    interface Locals { 
      cspNonce?: string 
    } 
  } 
}

export function withNonce(_req: Request, res: Response, next: NextFunction) {
  res.locals.cspNonce = crypto.randomBytes(16).toString("base64");
  next();
}

export function csp() {
  const cfg = getConfig();
  const isDev = cfg.isDev;
  
  return helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'", 
          (_req, res) => `'nonce-${res.locals.cspNonce}'`, 
          isDev ? "'unsafe-eval'" : null
        ].filter(Boolean) as string[],
        styleSrc:  [
          "'self'", 
          (_req, res) => `'nonce-${res.locals.cspNonce}'`, 
          isDev ? "'unsafe-inline'" : null
        ].filter(Boolean) as string[],
        imgSrc:    ["'self'", "data:", "blob:"],
        fontSrc:   ["'self'", "data:"],
        connectSrc:["'self'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: isDev ? null : [],
        reportUri: "/api/csp-violations",
      },
      reportOnly: cfg.CSP_REPORT_ONLY,
    },
    crossOriginEmbedderPolicy: false
  });
}