declare module 'rate-limit-redis' {
  import { Store } from 'express-rate-limit';
  
  export type RedisReply = string | number | null;
  
  export type SendCommandFn = (command: string, ...args: string[]) => Promise<RedisReply>;
  
  export interface RedisStoreOptions {
    sendCommand: SendCommandFn;
    prefix?: string;
    resetExpiryOnChange?: boolean;
    expiry?: number;
    client?: any;
  }
  
  export default class RedisStore implements Store {
    constructor(options: RedisStoreOptions);
    
    increment(key: string): Promise<void>;
    decrement(key: string): Promise<void>;
    resetKey(key: string): Promise<void>;
    resetAll(): Promise<void>;
  }
}