import { Router, type Request, type Response } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { getUserFundGrants, verifyCredentials } from '../lib/auth/credentials';
import { signToken } from '../lib/auth/jwt';
import { revokeToken } from '../lib/auth/revocation';
import { getAuthToken } from '../lib/headers-helper';

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const authRouter = Router();

// Self-defines the FULL /api/auth/login path so it can be mounted at the bare root
// on both surfaces (makeApp + registerRoutes). Made public in
// server/lib/public-api-boundary.ts so the global /api auth guard lets it through.
authRouter.post('/api/auth/login', async (req: Request, res: Response) => {
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

  const token = signToken({
    sub: String(user.id),
    email: user.username,
    role,
    fundIds,
  });

  return res.json({ token });
});

authRouter.post('/api/auth/logout', async (req: Request, res: Response) => {
  const token = getAuthToken(req.headers);
  if (!token) {
    return res.sendStatus(204);
  }

  // The global /api boundary has already verified this exact Bearer token.
  const claims = jwt.decode(token);
  if (!claims || typeof claims === 'string' || typeof claims.jti !== 'string' || !claims.jti) {
    return res.sendStatus(204);
  }

  await revokeToken({
    jti: claims.jti,
    userId: Number(claims.sub),
    expiresAt: new Date((claims.exp ?? 0) * 1000),
    reason: 'logout',
  });

  return res.sendStatus(204);
});

export default authRouter;
