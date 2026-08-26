/**
 * Ambient module declarations for optional @upstash/redis integration
 * Allows TypeScript compilation when package is not installed
 */

declare module '@upstash/redis' {
  export class Redis {
    constructor(config?: {
      url?: string;
      token?: string;
      [key: string]: unknown;
    });
    
    get(key: string): Promise<string | null>;
    set(key: string, value: string, options?: { ex?: number }): Promise<string>;
    del(key: string): Promise<number>;
    incr(key: string): Promise<number>;
    expire(key: string, seconds: number): Promise<number>;
  }
}