import { Request } from 'express';

declare global {
  namespace Express {
    // Define a new interface that doesn't extend Request
    interface AuthenticatedUser {
      id: string;
      email: string;
      name?: string;
      role?: string;
    }
    
    // Augment the existing Request interface instead of extending it
    interface Request {
      user?: AuthenticatedUser;
      requestId?: string;
    }
  }
}