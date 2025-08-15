import { Request } from 'express';

declare global {
  namespace Express {
    interface AuthenticatedRequest {
      user?: {
        id: string;
        email: string;
        name?: string;
        role?: string;
      };
      requestId?: string;
    }
  }
}