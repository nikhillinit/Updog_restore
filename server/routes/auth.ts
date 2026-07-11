import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { verifyCredentials } from '../lib/auth/credentials';
import { signToken } from '../lib/auth/jwt';

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

  // Uniform 401 for unknown-user and bad-password: no user enumeration.
  if (!user) {
    return res.status(401).json({ error: 'invalid_credentials' });
  }

  // Internal tool: every identity is admin (empty fundIds = unrestricted scope).
  const token = signToken({
    sub: String(user.id),
    email: user.username,
    role: 'admin',
    fundIds: [],
  });

  return res.json({ token });
});

export default authRouter;
