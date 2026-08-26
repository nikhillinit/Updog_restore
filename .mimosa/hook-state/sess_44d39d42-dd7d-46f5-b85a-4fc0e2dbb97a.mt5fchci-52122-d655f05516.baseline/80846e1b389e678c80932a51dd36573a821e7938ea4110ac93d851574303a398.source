#!/usr/bin/env tsx
/* eslint-disable no-console */
import { connectRedis, pingRedis } from '../../server/lib/redis/cluster';
import { parseRedisConfig } from '../../server/config/redis';

(async () => {
  const cfg = parseRedisConfig();
  console.log('[debug:redis] config:', cfg);

  if (cfg.mode === 'memory') {
    console.log('REDIS_URL=memory:// — nothing to check.');
    process.exit(0);
  }
  try {
    const conn = await connectRedis();
    console.log('[debug:redis] connected:', conn?.describe());
    const res = await pingRedis(conn!.conn);
    console.log('[debug:redis] ping:', res);
    await conn?.close();
    process.exit(res.ok ? 0 : 2);
  } catch (err) {
    console.error('[debug:redis] failed:', (err as Error)?.message);
    process.exit(1);
  }
})();