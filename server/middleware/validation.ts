import type { Request, Response, NextFunction } from 'express';
import type { ZodSchema, infer as ZodInfer } from 'zod';
import type { ApiError } from '@shared/types';
import type { ParsedQs } from 'qs';

interface ValidationSchemas {
  body?: ZodSchema<unknown>;
  query?: ZodSchema<unknown>;
  params?: ZodSchema<unknown>;
}

/**
 * Type-safe query parameter assignment
 * Converts Zod-validated data to Express-compatible query format
 */
function toQueryParams(data: unknown): ParsedQs {
  if (typeof data !== 'object' || data === null) {
    return {};
  }
  // ParsedQs is the Express query type - values are string | string[] | ParsedQs | ParsedQs[]
  return data as ParsedQs;
}

/**
 * Type-safe route parameter assignment
 * Converts Zod-validated data to Express-compatible params format
 */
function toRouteParams(data: unknown): Record<string, string> {
  if (typeof data !== 'object' || data === null) {
    return {};
  }
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    result[key] = String(value);
  }
  return result;
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
        // Use type-safe conversion instead of direct cast
        req.query = toQueryParams(result.data);
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
        // Use type-safe conversion instead of direct cast
        req.params = toRouteParams(result.data);
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
