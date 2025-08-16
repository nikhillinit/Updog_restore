/**
 * Redis connection configuration parser
 */
export interface RedisConfig {
  mode: 'memory' | 'single' | 'cluster';
  url?: string;
  nodes?: string[];
  tls?: boolean;
}

export function parseRedisConfig(): RedisConfig {
  const raw = process.env.REDIS_URL ?? 'memory://';
  if (raw === 'memory://') {
    return { mode: 'memory' };
  }

  const isClusterScheme = raw.startsWith('redis+cluster://');
  if (!isClusterScheme) {
    return { mode: 'single', url: raw };
  }

  // Cluster – nodes can be in URL or in REDIS_CLUSTER_NODES
  const tls = String(raw).startsWith('rediss+cluster://');
  let nodes: string[] = [];
  
  if (process.env.REDIS_CLUSTER_NODES) {
    nodes = process.env.REDIS_CLUSTER_NODES.split(',').map(n => n.trim());
  } else {
    // Extract from URL if present
    const url = new URL(raw);
    if (url.hostname) nodes = [`${url.hostname}:${url.port || 6379}`];
  }

  return { mode: 'cluster', nodes, tls };
}