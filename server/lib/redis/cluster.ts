/**
 * Redis connection helper (single/cluster aware)
 */
import { parseRedisConfig } from '../../config/redis';

export interface RedisConn {
  conn: any; // RedisClientType or RedisClusterType
  mode: 'single' | 'cluster';
  describe(): string;
  close(): Promise<void>;
}

export async function connectRedis(): Promise<RedisConn | undefined> {
  const cfg = parseRedisConfig();
  if (cfg.mode === 'memory') return undefined;

  const { createClient, createCluster } = await import('redis');

  if (cfg.mode === 'cluster') {
    if (!cfg.nodes?.length) {
      throw new Error('Redis cluster mode requires nodes');
    }
    
    // TLS configuration for production
    const tlsEnabled = cfg.tls || false;
    
    const cluster = createCluster({
      rootNodes: cfg.nodes.map(node => ({ 
        url: `redis${tlsEnabled ? 's' : ''}://${node}` 
      })),
      defaults: {
        socket: {
          reconnectStrategy: (retries: number) => Math.min(1000 * retries, 5000),
          connectTimeout: 5000
        }
      }
    });

    cluster.on('error', (err: any) => {
      // eslint-disable-next-line no-console
      console.error('[redis-cluster] error:', err?.message);
    });

    await cluster.connect();
    
    return {
      conn: cluster,
      mode: 'cluster',
      describe: () => `cluster(${cfg.nodes!.join(',')})`,
      close: async () => { await cluster.quit(); }
    };
  }

  // Single node
  const client = createClient({
    url: cfg.url,
    socket: {
      reconnectStrategy: (retries: number) => Math.min(1000 * retries, 5000),
      connectTimeout: 5000,
      keepAlive: 1
    }
  });

  client.on('error', (err: any) => {
    // eslint-disable-next-line no-console
    console.error('[redis] error:', err?.message);
  });

  await client.connect();

  return {
    conn: client,
    mode: 'single',
    describe: () => `single(${cfg.url})`,
    close: async () => { await client.quit(); }
  };
}

export async function pingRedis(conn: any): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
  try {
    const start = Date.now();
    await conn.ping();
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    return { ok: false, error: (err as Error)?.message };
  }
}