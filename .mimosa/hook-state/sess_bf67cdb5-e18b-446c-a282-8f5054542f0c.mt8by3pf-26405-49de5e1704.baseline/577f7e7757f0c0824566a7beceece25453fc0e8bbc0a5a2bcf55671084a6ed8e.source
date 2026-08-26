/**
 * Database schema for reserve strategy dual approval system
 */

import {
  pgTable,
  text,
  timestamp,
  uuid,
  jsonb,
  integer,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const reserveApprovals = pgTable(
  'reserve_approvals',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    strategyId: text('strategy_id').notNull(),
    requestedBy: text('requested_by').notNull(), // Email of requester
    requestedAt: timestamp('requested_at').defaultNow().notNull(),

    // Change details
    action: text('action').notNull(), // 'create' | 'update' | 'delete'
    strategyData: jsonb('strategy_data').notNull(), // The actual strategy changes
    reason: text('reason').notNull(),

    // Impact assessment
    affectedFunds: jsonb('affected_funds').$type<string[]>().notNull(),
    estimatedAmount: integer('estimated_amount').notNull(), // In cents
    riskLevel: text('risk_level').notNull(), // 'low' | 'medium' | 'high'

    // Approval status
    status: text('status').default('pending').notNull(), // 'pending' | 'approved' | 'rejected' | 'expired'
    expiresAt: timestamp('expires_at').notNull(),

    // Calculation verification
    calculationHash: text('calculation_hash'), // SHA-256 of calculations for determinism

    // Metadata
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    statusIdx: index('idx_reserve_approvals_status')['on'](table.status),
    strategyIdx: index('idx_reserve_approvals_strategy')['on'](table.strategyId),
    expiresIdx: index('idx_reserve_approvals_expires')['on'](table.expiresAt),
  })
);

export const approvalSignatures = pgTable(
  'approval_signatures',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    approvalId: uuid('approval_id')
      .references(() => reserveApprovals.id, { onDelete: 'cascade' })
      .notNull(),

    // Partner who approved
    partnerEmail: text('partner_email').notNull(),
    approvedAt: timestamp('approved_at').defaultNow().notNull(),

    // Signature verification
    signature: text('signature').notNull(), // JWT or cryptographic signature
    signatureMethod: text('signature_method').default('jwt').notNull(),

    // Audit trail
    ipAddress: text('ip_address').notNull(),
    userAgent: text('user_agent'),
    sessionId: text('session_id'),

    // Additional verification
    twoFactorVerified: timestamp('two_factor_verified'),
    verificationCode: text('verification_code'), // Optional email verification code

    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    approvalIdx: index('idx_signatures_approval')['on'](table.approvalId),
    partnerIdx: index('idx_signatures_partner')['on'](table.partnerEmail),
    uniquePartnerApproval: uniqueIndex('uniq_partner_approval')['on'](
      table.approvalId,
      table.partnerEmail
    ),
  })
);

export const approvalAuditLog = pgTable(
  'approval_audit_log',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    approvalId: uuid('approval_id')
      .references(() => reserveApprovals.id, { onDelete: 'cascade' })
      .notNull(),

    timestamp: timestamp('timestamp').defaultNow().notNull(),
    action: text('action').notNull(), // 'created', 'signed', 'rejected', 'expired', 'executed'
    actor: text('actor').notNull(), // Email of person taking action

    details: jsonb('details'), // Additional context

    // System tracking
    systemGenerated: timestamp('system_generated'), // For automated actions
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
  },
  (table) => ({
    approvalIdx: index('idx_audit_approval')['on'](table.approvalId),
    timestampIdx: index('idx_audit_timestamp')['on'](table.timestamp),
    actorIdx: index('idx_audit_actor')['on'](table.actor),
  })
);

// Configuration for partner emails (stored separately for security)
export const approvalPartners = pgTable('approval_partners', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').unique().notNull(),
  name: text('name').notNull(),
  role: text('role').default('partner').notNull(),

  // Security settings
  requireTwoFactor: timestamp('require_two_factor').default(sql`NOW()`),
  publicKey: text('public_key'), // For signature verification if using PKI

  // Notification preferences
  notifyEmail: text('notify_email').notNull(), // Can be different from auth email
  notifySlack: text('notify_slack'),
  notifySms: text('notify_sms'),

  active: timestamp('active').defaultNow().notNull(),
  deactivated: timestamp('deactivated'),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Types for TypeScript
export type ReserveApproval = typeof reserveApprovals.$inferSelect;
export type NewReserveApproval = typeof reserveApprovals.$inferInsert;
export type ApprovalSignature = typeof approvalSignatures.$inferSelect;
export type NewApprovalSignature = typeof approvalSignatures.$inferInsert;
export type ApprovalAuditEntry = typeof approvalAuditLog.$inferSelect;
export type ApprovalPartner = typeof approvalPartners.$inferSelect;
