import { Request } from 'express';

declare global {
  namespace Express {
    interface AuthenticatedRequest extends Request {
      user?: {
        id: string;
        email: string;
        name?: string;
        role?: string;
      };
      requestId?: string;
      params: {
        [key: string]: string;
      };
      body: any;
    }
  }
}