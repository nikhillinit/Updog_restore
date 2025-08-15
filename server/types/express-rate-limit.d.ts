declare module 'express-rate-limit' {
  import { Request, Response, NextFunction } from 'express';
  
  export interface Store {
    increment: (key: string) => Promise<void>;
    decrement: (key: string) => Promise<void>;
    resetKey: (key: string) => Promise<void>;
    resetAll: () => Promise<void>;
    [key: string]: any;
  }
  
  export interface Options {
    windowMs?: number;
    max?: number;
    message?: string | object;
    statusCode?: number;
    headers?: boolean;
    skipFailedRequests?: boolean;
    skipSuccessfulRequests?: boolean;
    keyGenerator?: (req: Request) => string;
    handler?: (req: Request, res: Response, next: NextFunction) => void;
    onLimitReached?: (req: Request, res: Response, options: Options) => void;
    store?: Store;
    [key: string]: any;
  }
  
  export type RateLimitRequestHandler = (req: Request, res: Response, next: NextFunction) => void;
  
  export const ipKeyGenerator: (req: Request) => string;
  
  export default function rateLimit(options?: Partial<Options>): RateLimitRequestHandler;
}