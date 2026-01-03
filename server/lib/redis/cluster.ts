/**
 * Redis connection helper (single/cluster aware)
 */
import { parseRedisConfig } from '../../config/redis';
import * as fs from 'fs';

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
    
    const tlsEnabled = cfg.tls || false;
    const socketOptions: any = {
      reconnectStrategy: (retries: number) => Math.min(1000 * retries, 5000),
      connectTimeout: 5000
    };

    // Add TLS configuration if enabled
    if (tlsEnabled) {
      socketOptions.tls = true;
      if (process.env['REDIS_CA_PATH']) {
        socketOptions.ca = fs.readFileSync(process.env['REDIS_CA_PATH']);
      }
      if (process.env['REDIS_CERT_PATH']) {
        socketOptions.cert = fs.readFileSync(process.env['REDIS_CERT_PATH']);
      }
      if (process.env['REDIS_KEY_PATH']) {
        socketOptions.key = fs.readFileSync(process.env['REDIS_KEY_PATH']);
      }
      if (process.env['REDIS_SERVERNAME']) {
        socketOptions.servername = process.env['REDIS_SERVERNAME'];
      }
    }
    
    const cluster = createCluster({
      rootNodes: cfg.nodes.map(node => ({ 
        url: `redis${tlsEnabled ? 's' : ''}://${node}` 
      })),
      defaults: { socket: socketOptions }
    });

    cluster['on']('error', (err: any) => {
       
      console.error('[redis-cluster] error:', err?.message);
    });

    await cluster.connect();
    
    return {
      conn: cluster,
      mode: 'cluster',
      describe: () => `cluster(${cfg.nodes!.join(',')})`,
      close: async () => { await cluster['quit'](); }
    };
  }

  // Single node
  const socketOptions: any = {
    reconnectStrategy: (retries: number) => Math.min(1000 * retries, 5000),
    connectTimeout: 5000,
    keepAlive: 1
  };

  // Add TLS if URL starts with rediss://
  if (cfg.url?.startsWith('rediss://')) {
    socketOptions.tls = true;
    if (process.env['REDIS_CA_PATH']) {
      socketOptions.ca = fs.readFileSync(process.env['REDIS_CA_PATH']);
    }
    if (process.env['REDIS_CERT_PATH']) {
      socketOptions.cert = fs.readFileSync(process.env['REDIS_CERT_PATH']);
    }
    if (process.env['REDIS_KEY_PATH']) {
      socketOptions.key = fs.readFileSync(process.env['REDIS_KEY_PATH']);
    }
    if (process.env['REDIS_SERVERNAME']) {
      socketOptions.servername = process.env['REDIS_SERVERNAME'];
    }
  }

  const client = createClient({
    ...(cfg.url !== undefined ? { url: cfg.url } : {}),
    socket: socketOptions
  });

  client['on']('error', (err: any) => {
     
    console.error('[redis] error:', err?.message);
  });

  await client.connect();

  return {
    conn: client,
    mode: 'single',
    describe: () => `single(${cfg.url})`,
    close: async () => { await client['quit'](); }
  };
}

export async function pingRedis(conn: any): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
  try {
    const start = Date.now();
    await conn['ping']();
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    return { ok: false, error: (err as Error)?.message };
  }
}