/**
 * Redis connection helper (single/cluster aware)
 */
import { parseRedisConfig } from '../../config/redis';
import type { RedisClientOptions } from 'redis';
import * as fs from 'fs';
import { logger } from '../logger.js';

type RedisSocketOptions = NonNullable<RedisClientOptions['socket']>;

interface RedisPingable {
  ping(): Promise<unknown>;
}

interface RedisConnection {
  quit(): Promise<unknown>;
  on(event: 'error', listener: (error: unknown) => void): unknown;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function createSocketOptions(tlsEnabled: boolean, keepAlive?: number): RedisSocketOptions {
  const baseOptions = {
    reconnectStrategy: (retries: number) => Math.min(1000 * retries, 5000),
    connectTimeout: 5000,
    ...(keepAlive !== undefined ? { keepAlive: true, keepAliveInitialDelay: keepAlive } : {}),
  };

  if (!tlsEnabled) {
    return baseOptions;
  }

  return {
    ...baseOptions,
    tls: true,
    ...(process.env['REDIS_CA_PATH'] ? { ca: fs.readFileSync(process.env['REDIS_CA_PATH']) } : {}),
    ...(process.env['REDIS_CERT_PATH']
      ? { cert: fs.readFileSync(process.env['REDIS_CERT_PATH']) }
      : {}),
    ...(process.env['REDIS_KEY_PATH']
      ? { key: fs.readFileSync(process.env['REDIS_KEY_PATH']) }
      : {}),
    ...(process.env['REDIS_SERVERNAME'] ? { servername: process.env['REDIS_SERVERNAME'] } : {}),
  };
}

export interface RedisConn {
  conn: RedisConnection;
  mode: 'single' | 'cluster';
  ping(): Promise<unknown>;
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

    const clusterNodes = cfg.nodes;
    const tlsEnabled = cfg.tls ?? false;
    const socketOptions = createSocketOptions(tlsEnabled);
    const cluster = createCluster({
      rootNodes: clusterNodes.map((node) => ({
        url: `redis${tlsEnabled ? 's' : ''}://${node}`,
      })),
      defaults: { socket: socketOptions },
    });

    cluster.on('error', (err: unknown) => {
      logger.error({ error: getErrorMessage(err) }, '[redis-cluster] error');
    });

    await cluster.connect();

    return {
      conn: cluster,
      mode: 'cluster',
      ping: async () => {
        await cluster.sendCommand(undefined, undefined, ['PING']);
      },
      describe: () => `cluster(${clusterNodes.join(',')})`,
      close: async () => {
        await cluster.quit();
      },
    };
  }

  // Single node
  const socketOptions = createSocketOptions(cfg.url?.startsWith('rediss://') ?? false, 1);

  const client = createClient({
    ...(cfg.url !== undefined ? { url: cfg.url } : {}),
    socket: socketOptions,
  });

  client.on('error', (err: unknown) => {
    logger.error({ error: getErrorMessage(err) }, '[redis] error');
  });

  await client.connect();

  return {
    conn: client,
    mode: 'single',
    ping: async () => {
      await client.ping();
    },
    describe: () => `single(${cfg.url ?? 'unknown'})`,
    close: async () => {
      await client.quit();
    },
  };
}

export async function pingRedis(
  conn: RedisPingable
): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
  try {
    const start = Date.now();
    await conn.ping();
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    return { ok: false, error: getErrorMessage(err) };
  }
}
