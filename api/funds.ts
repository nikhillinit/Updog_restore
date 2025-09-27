import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';

const FundSchema = z.object({
  id: z.string(),
  name: z.string().min(2).max(120),
  currency: z.enum(['USD','EUR','GBP']),
  createdAt: z.string(), // ISO
});
const FundsResponse = z.array(FundSchema);

const currencies = ['USD','EUR','GBP'] as const;

const sample = (i = 1) => ({
  id: `stub-${i}`,
  name:
    i % 3 === 0
      ? 'Press On Ventures — Very Long Fund Name Testing UI Edge Cases'
      : i % 2
      ? 'Press On Ventures Fund I'
      : 'POV Alpha',
  currency: currencies[i % currencies.length],
  createdAt: new Date(Date.now() - i * 86_400_000).toISOString(),
});

export default function handler(_req: VercelRequest, res: VercelResponse) {
  if (process.env.ENABLE_API_STUB !== 'true') {
    res.status(404).json({
      error: 'API stub disabled',
      hint: 'Set ENABLE_API_STUB=true (preview) to enable demo mode'
    });
    return;
  }
  const payload = [sample(1), sample(2), sample(3)];
  const parsed = FundsResponse.safeParse(payload);
  if (!parsed.success) {
    console.error('[funds-stub] invalid shape', parsed.error.flatten());
    res.status(500).json({ error: 'Invalid stub payload' });
    return;
  }
  res.status(200).json(parsed.data);
}