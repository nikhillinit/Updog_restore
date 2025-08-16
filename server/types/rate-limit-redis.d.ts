/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
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
