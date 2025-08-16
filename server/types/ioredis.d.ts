/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
declare module 'ioredis' {
  interface RedisOptions {
    lazyConnect?: boolean;
    maxRetriesPerRequest?: number;
    retryDelayOnFailover?: number;
    connectTimeout?: number;
    enableReadyCheck?: boolean;
    enableOfflineQueue?: boolean;
    [key: string]: any;
  }

  class Redis {
    constructor(url: string, options?: RedisOptions);
    connect(): Promise<void>;
    ping(): Promise<string>;
    call(command: string, ...args: any[]): Promise<any>;
    disconnect(): Promise<void>;
    quit(): Promise<void>;
    [key: string]: any;
  }

  export default Redis;
}
