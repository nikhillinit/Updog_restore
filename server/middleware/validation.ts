/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';
import { ApiError } from '@shared/types';

interface ValidationSchemas {
  body?: ZodSchema<any>;
  query?: ZodSchema<any>;
  params?: ZodSchema<any>;
}

export function validateRequest(schemas: ValidationSchemas) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate body
      if (schemas.body) {
        const result = schemas.body.safeParse(req.body);
        if (!result.success) {
          const error: ApiError = {
            error: 'Validation error',
            message: 'Request body validation failed',
            details: { validationErrors: result.error.issues },
          };
          return res.status(400).json(error);
        }
        req.body = result.data;
      }

      // Validate query parameters
      if (schemas.query) {
        const result = schemas.query.safeParse(req.query);
        if (!result.success) {
          const error: ApiError = {
            error: 'Validation error',
            message: 'Query parameter validation failed',
            details: { validationErrors: result.error.issues },
          };
          return res.status(400).json(error);
        }
        req.query = result.data;
      }

      // Validate route parameters
      if (schemas.params) {
        const result = schemas.params.safeParse(req.params);
        if (!result.success) {
          const error: ApiError = {
            error: 'Validation error',
            message: 'Route parameter validation failed',
            details: { validationErrors: result.error.issues },
          };
          return res.status(400).json(error);
        }
        req.params = result.data;
      }

      next();
    } catch (error) {
      const apiError: ApiError = {
        error: 'Validation error',
        message: error instanceof Error ? error.message : 'Unknown validation error',
      };
      res.status(500).json(apiError);
    }
  };
}
