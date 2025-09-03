import 'express-serve-static-core';

declare global {
  namespace Express {
    interface User { 
      id: string; 
      role?: 'admin' | 'user';
    }
    interface Request {
      user?: User;
      requestId?: string;
      audit?: { 
        event: string; 
        meta?: Record<string, unknown>;
      };
    }
  }
}

export {};