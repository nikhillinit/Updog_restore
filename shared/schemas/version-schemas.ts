/**
 * Snapshot Version Zod Validation Schemas
 *
 * Request/response validation for version management endpoints.
 */

import { z } from 'zod';

// ============================================================================
// Path Parameter Schemas
// ============================================================================

export const SnapshotIdParamSchema = z.object({
  snapshotId: z.string().uuid('Invalid snapshot ID format'),
});

export const VersionIdParamSchema = z.object({
  snapshotId: z.string().uuid('Invalid snapshot ID format'),
  versionId: z.string().uuid('Invalid version ID format'),
});

export const VersionNumberParamSchema = z.object({
  snapshotId: z.string().uuid('Invalid snapshot ID format'),
  versionNumber: z.coerce.number().int().positive('Version number must be positive'),
});

// ============================================================================
// Request Body Schemas
// ============================================================================

export const CreateVersionRequestSchema = z.object({
  versionName: z
    .string()
    .max(100, 'Version name must be 100 characters or less')
    .optional(),
  description: z
    .string()
    .max(500, 'Description must be 500 characters or less')
    .optional(),
  tags: z
    .array(z.string().max(50, 'Tag must be 50 characters or less'))
    .max(10, 'Maximum 10 tags allowed')
    .optional(),
  isPinned: z.boolean().optional(),
});

export const RestoreVersionRequestSchema = z.object({
  description: z
    .string()
    .max(500, 'Description must be 500 characters or less')
    .optional(),
});

export const CompareVersionsRequestSchema = z.object({
  baseVersionId: z.string().uuid('Invalid base version ID format'),
  comparisonVersionId: z.string().uuid('Invalid comparison version ID format'),
  metrics: z
    .array(
      z.enum([
        'moic',
        'irr',
        'tvpi',
        'dpi',
        'total_investment',
        'follow_ons',
        'exit_proceeds',
        'exit_valuation',
      ])
    )
    .optional(),
});

// ============================================================================
// Query Parameter Schemas
// ============================================================================

export const ListVersionsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1, 'Limit must be at least 1')
    .max(100, 'Limit must be 100 or less')
    .default(50),
  includeExpired: z.coerce.boolean().default(false),
});

export const HistoryQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1, 'Limit must be at least 1')
    .max(50, 'Limit must be 50 or less')
    .default(10),
});

export const TimelineQuerySchema = z.object({
  fromVersion: z.coerce.number().int().positive().optional(),
  toVersion: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

// ============================================================================
// Type Exports
// ============================================================================

export type SnapshotIdParams = z.infer<typeof SnapshotIdParamSchema>;
export type VersionIdParams = z.infer<typeof VersionIdParamSchema>;
export type VersionNumberParams = z.infer<typeof VersionNumberParamSchema>;
export type CreateVersionRequest = z.infer<typeof CreateVersionRequestSchema>;
export type RestoreVersionRequest = z.infer<typeof RestoreVersionRequestSchema>;
export type CompareVersionsRequest = z.infer<typeof CompareVersionsRequestSchema>;
export type ListVersionsQuery = z.infer<typeof ListVersionsQuerySchema>;
export type HistoryQuery = z.infer<typeof HistoryQuerySchema>;
export type TimelineQuery = z.infer<typeof TimelineQuerySchema>;
