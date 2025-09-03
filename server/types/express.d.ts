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

// Express Request interface augmentation is now centralized in types/express.d.ts at project root
