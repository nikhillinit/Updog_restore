import type IORedis from 'ioredis';
import { isRecord } from '@shared/utils/type-guards';

export interface BullMQRedisConnection {
  host: string;
  port: number;
  password?: string;
}

export function getBullMQConnection(redisConnection: IORedis): BullMQRedisConnection {
  const optionsUnknown: unknown = redisConnection['options'];
  const options = isRecord(optionsUnknown) ? optionsUnknown : {};
  const password = typeof options['password'] === 'string' ? options['password'] : undefined;

  return {
    host: typeof options['host'] === 'string' ? options['host'] : 'localhost',
    port: typeof options['port'] === 'number' ? options['port'] : 6379,
    ...(password ? { password } : {}),
  };
}
