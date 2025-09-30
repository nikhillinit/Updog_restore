/**
 * LP Sharing System Schema
 * Enables secure sharing of fund dashboards with Limited Partners
 */

import { z } from 'zod';

// Share access levels
export const ShareAccessLevel = z.enum([
  'view_only',           // Basic LP view
  'view_with_details',   // LP with detailed metrics
  'collaborator',        // Can comment and interact
  'admin'               // Full access (GP use)
]);

export type ShareAccessLevelType = z.infer<typeof ShareAccessLevel>;

// Share configuration schema
export const ShareConfigSchema = z.object({
  id: z.string().uuid(),
  fundId: z.string(),
  createdBy: z.string(),
  accessLevel: ShareAccessLevel,

  // Access controls
  requirePasskey: z.boolean().default(false),
  passkey: z.string().optional(),
  expiresAt: z.date().optional(),

  // LP-specific settings
  hiddenMetrics: z.array(z.string()).default([]), // Hide GP returns, fees, etc.
  customTitle: z.string().optional(),
  customMessage: z.string().optional(),

  // Tracking
  viewCount: z.number().default(0),
  lastViewedAt: z.date().optional(),

  // Metadata
  createdAt: z.date().default(() => new Date()),
  updatedAt: z.date().default(() => new Date()),
  isActive: z.boolean().default(true)
});

export type ShareConfig = z.infer<typeof ShareConfigSchema>;

// Share link request schema
export const CreateShareLinkSchema = z.object({
  fundId: z.string(),
  accessLevel: ShareAccessLevel,
  requirePasskey: z.boolean().default(false),
  passkey: z.string().optional(),
  expiresInDays: z.number().min(1).max(365).optional(),
  hiddenMetrics: z.array(z.string()).default([]),
  customTitle: z.string().optional(),
  customMessage: z.string().optional()
});

export type CreateShareLinkRequest = z.infer<typeof CreateShareLinkSchema>;

// Common hidden metrics for LPs
export const LP_HIDDEN_METRICS = [
  'gp_returns',
  'management_fees',
  'carried_interest',
  'gp_commitment',
  'fund_expenses',
  'administrative_costs'
] as const;

// Share analytics schema
export const ShareAnalyticsSchema = z.object({
  shareId: z.string().uuid(),
  viewedAt: z.date(),
  viewerIP: z.string().optional(),
  userAgent: z.string().optional(),
  duration: z.number().optional(), // seconds
  pagesViewed: z.array(z.string()).default([])
});

export type ShareAnalytics = z.infer<typeof ShareAnalyticsSchema>;