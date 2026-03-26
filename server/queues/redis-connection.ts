import type IORedis from 'ioredis';

export interface BullMQRedisConnection {
  host: string;
  port: number;
  password?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function getBullMQConnection(redisConnection: IORedis): BullMQRedisConnection {
  const optionsUnknown: unknown = redisConnection.options;
  const options = isRecord(optionsUnknown) ? optionsUnknown : {};
  const password = typeof options.password === 'string' ? options.password : undefined;

  return {
    host: typeof options.host === 'string' ? options.host : 'localhost',
    port: typeof options.port === 'number' ? options.port : 6379,
    ...(password ? { password } : {}),
  };
}
