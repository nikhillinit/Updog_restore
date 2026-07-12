import { Router, type NextFunction, type Request, type Response } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { getUserFundGrants, verifyCredentials } from '../lib/auth/credentials';
import {
  signBrowserSessionToken,
  userFromClaims,
  verifyRequestCredential,
  type JWTClaims,
} from '../lib/auth/jwt';
import { revokeToken } from '../lib/auth/revocation';
import {
  clearBrowserSessionCookies,
  hasValidSessionCsrfCookie,
  requireCsrf,
  requirePreAuthCsrf,
  setBrowserSessionCookies,
  setPreAuthCsrfCookie,
  setSessionCsrfCookie,
} from '../lib/auth/csrf';
import { extractRequestCredential } from '../lib/auth/request-credentials';

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const authRouter = Router();

async function requireLoginCsrf(req: Request, res: Response, next: NextFunction): Promise<void> {
  const extracted = extractRequestCredential(req);
  if (extracted.kind === 'ambiguous' || extracted.kind === 'invalid') {
    res.status(401).json({
      error: extracted.kind === 'ambiguous' ? 'ambiguous_credentials' : 'invalid_credentials',
    });
    return;
  }

  if (extracted.kind === 'cookie') {
    try {
      await verifyRequestCredential(req);
    } catch {
      clearBrowserSessionCookies(res);
      res.status(401).json({ error: 'invalid_credentials' });
      return;
    }
    requireCsrf(req, res, next);
    return;
  }

  requirePreAuthCsrf(req, res, next);
}

function sanitizedSession(req: Request, claims: JWTClaims) {
  const user = userFromClaims(req, claims);
  return {
    user: {
      id: user.id,
      email: user.email,
      role: typeof user.role === 'string' ? user.role : '',
      fundIds: user.fundIds ?? [],
    },
  };
}

authRouter.get('/api/auth/csrf', async (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
  const extracted = extractRequestCredential(req);
  if (extracted.kind === 'ambiguous' || extracted.kind === 'invalid') {
    return res.status(401).json({
      error: extracted.kind === 'ambiguous' ? 'ambiguous_credentials' : 'invalid_credentials',
    });
  }

  if (extracted.kind === 'cookie' || extracted.kind === 'bearer') {
    try {
      const verified = await verifyRequestCredential(req);
      const jti = verified?.claims.jti;
      if (verified?.source === 'cookie' && typeof jti === 'string' && jti) {
        const csrfToken = setSessionCsrfCookie(res, jti);
        return res.json({ csrfToken });
      }
      if (verified?.source === 'bearer') {
        const csrfToken = setPreAuthCsrfCookie(res);
        return res.json({ csrfToken });
      }
    } catch {
      if (extracted.kind === 'bearer') {
        return res.status(401).json({ error: 'invalid_credentials' });
      }
      clearBrowserSessionCookies(res);
    }
  }

  const csrfToken = setPreAuthCsrfCookie(res);
  return res.json({ csrfToken });
});

// Self-defines the FULL /api/auth/login path so it can be mounted at the bare root
// on both surfaces (makeApp + registerRoutes). Made public in
// server/lib/public-api-boundary.ts so the global /api auth guard lets it through.
authRouter.post('/api/auth/login', requireLoginCsrf, async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_request' });
  }

  const { username, password } = parsed.data;
  const user = await verifyCredentials(username, password);

  // Uniform 401 for unknown-user, bad-password, and inactive users: no user enumeration.
  if (!user || !user.isActive) {
    return res.status(401).json({ error: 'invalid_credentials' });
  }

  const role = user.role;
  const fundIds = role === 'admin' || role === 'service' ? [] : await getUserFundGrants(user.id);

  const token = signBrowserSessionToken({
    sub: String(user.id),
    email: user.username,
    role,
    fundIds,
  });

  const claims = jwt.decode(token);
  if (!claims || typeof claims === 'string' || typeof claims.jti !== 'string' || !claims.jti) {
    return res.status(500).json({ error: 'session_creation_failed' });
  }

  setBrowserSessionCookies(res, token, claims.jti);
  res.setHeader('Cache-Control', 'no-store');
  return res.json({
    user: {
      id: String(user.id),
      email: user.username,
      role,
      fundIds,
    },
  });
});

authRouter.get('/api/auth/session', (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
  const verified = req.authCredential;
  if (!verified) return res.status(401).json({ error: 'invalid_credentials' });

  const jti = verified.claims.jti;
  if (verified.source === 'cookie') {
    if (typeof jti !== 'string' || !jti) {
      return res.status(401).json({ error: 'invalid_credentials' });
    }
    if (!hasValidSessionCsrfCookie(req, jti)) {
      setSessionCsrfCookie(res, jti);
    }
  }

  return res.json(sanitizedSession(req, verified.claims as JWTClaims));
});

authRouter.post('/api/auth/logout', requireCsrf, async (req: Request, res: Response) => {
  const verified = req.authCredential;
  if (!verified) {
    clearBrowserSessionCookies(res);
    return res.sendStatus(204);
  }

  const claims = verified.claims;
  try {
    if (typeof claims.jti === 'string' && claims.jti) {
      await revokeToken({
        jti: claims.jti,
        userId: Number(claims.sub),
        expiresAt: new Date((claims.exp ?? 0) * 1000),
        reason: 'logout',
      });
    }
  } catch {
    clearBrowserSessionCookies(res);
    return res.status(503).json({ error: 'logout_incomplete' });
  }

  clearBrowserSessionCookies(res);
  return res.sendStatus(204);
});

export default authRouter;
