/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import { Request } from 'express';

// Define user type separately for reuse
interface User {
  id: string;
  email: string;
  name?: string;
  role?: string;
}

declare global {
  namespace Express {
    // Augment the existing Request interface instead of creating a new one that extends it
    interface Request {
      user?: User;
      // requestId is already declared in requestId.ts
      // params and body are already part of the Request interface
    }
  }
}
