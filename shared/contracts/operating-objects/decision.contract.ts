/**
 * Operating Objects -- Decision Contracts
 *
 * Fund-scoped recommendation, lifecycle, outcome, and evidence-link shapes.
 * Server-controlled fields stay out of create and command-hash inputs.
 *
 * @module shared/contracts/operating-objects/decision.contract
 */

import { z } from 'zod';

import {
  TaskEvidenceTargetSchema,
  type TaskEvidenceTarget,
} from './task-evidence-link.contract';

export const DECISION_CONTRACT_VERSION = 'decision/1.0.0' as const;
export const DECISION_EVIDENCE_LINK_CONTRACT_VERSION =
  'decision-evidence-link/1.0.0' as const;

const PositiveIntSchema = z.number().int().positive();

export const DecisionStatusSchema = z.enum([
  'proposed',
  'accepted',
  'rejected',
  'deferred',
]);
export type DecisionStatus = z.infer<typeof DecisionStatusSchema>;

export const DecisionTransitionStatusSchema = z.enum([
  'accepted',
  'rejected',
  'deferred',
]);

export const DecisionCreateSchema = z
  .object({
    fundId: PositiveIntSchema,
    title: z.string().trim().min(1).max(200),
    recommendation: z.string().trim().min(1),
    followUpOwnerId: PositiveIntSchema.optional(),
    followUpDate: z.string().date().optional(),
  })
  .strict();
export type DecisionCreate = z.infer<typeof DecisionCreateSchema>;

export const DecisionTransitionSchema = z
  .object({
    status: DecisionTransitionStatusSchema,
    followUpOwnerId: PositiveIntSchema.nullable().optional(),
    followUpDate: z.string().date().nullable().optional(),
  })
  .strict()
  .superRefine((transition, context) => {
    if (
      transition.status === 'deferred' &&
      (transition.followUpOwnerId == null || transition.followUpDate == null)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['followUpOwnerId'],
        message: 'Deferred decisions require follow-up owner and date',
      });
    }
  });
export type DecisionTransition = z.infer<typeof DecisionTransitionSchema>;

export const DecisionOutcomeSchema = z
  .object({
    outcome: z.string().trim().min(1),
  })
  .strict();
export type DecisionOutcome = z.infer<typeof DecisionOutcomeSchema>;

export type DecisionCreateCommandPreimage = DecisionCreate &
  Record<string, unknown> & {
    commandKind: 'create_decision';
    contractVersion: typeof DECISION_CONTRACT_VERSION;
  };

export type DecisionSupersedeCommandPreimage = DecisionCreate &
  Record<string, unknown> & {
    commandKind: 'supersede_decision';
    contractVersion: typeof DECISION_CONTRACT_VERSION;
    supersedesDecisionId: number;
  };

export const DecisionEvidenceTargetSchema = TaskEvidenceTargetSchema;
export type DecisionEvidenceTarget = TaskEvidenceTarget;

export const DecisionEvidenceLinkCreateRequestSchema = z
  .object({
    target: DecisionEvidenceTargetSchema,
  })
  .strict();
export type DecisionEvidenceLinkCreateRequest = z.infer<
  typeof DecisionEvidenceLinkCreateRequestSchema
>;

export const DecisionEvidenceLinkListQuerySchema = z.object({}).strict();

export interface DecisionEvidenceLinkCommandPreimage extends Record<string, unknown> {
  commandKind: 'create_decision_evidence_link';
  contractVersion: typeof DECISION_EVIDENCE_LINK_CONTRACT_VERSION;
  fundId: number;
  decisionId: number;
  target: DecisionEvidenceTarget;
}

export const DecisionV1Schema = z
  .object({
    contractVersion: z.literal(DECISION_CONTRACT_VERSION),
    decisionId: PositiveIntSchema,
    fundId: PositiveIntSchema,
    title: z.string().min(1),
    recommendation: z.string().min(1),
    status: DecisionStatusSchema,
    supersedesDecisionId: PositiveIntSchema.nullable(),
    outcome: z.string().nullable(),
    outcomeRecordedAt: z.string().datetime().nullable(),
    outcomeRecordedBy: PositiveIntSchema.nullable(),
    followUpOwnerId: PositiveIntSchema.nullable(),
    followUpDate: z.string().date().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    etag: z.string().min(1),
  })
  .strict();
export type DecisionV1 = z.infer<typeof DecisionV1Schema>;

export const DecisionListResponseSchema = z
  .object({
    data: z.array(DecisionV1Schema),
  })
  .strict();
export type DecisionListResponse = z.infer<typeof DecisionListResponseSchema>;

export const DecisionEvidenceLinkV1Schema = z
  .object({
    contractVersion: z.literal(DECISION_EVIDENCE_LINK_CONTRACT_VERSION),
    linkId: PositiveIntSchema,
    fundId: PositiveIntSchema,
    decisionId: PositiveIntSchema,
    target: DecisionEvidenceTargetSchema,
    createdAt: z.string().datetime(),
  })
  .strict();
export type DecisionEvidenceLinkV1 = z.infer<typeof DecisionEvidenceLinkV1Schema>;

export const DecisionEvidenceLinkListResponseSchema = z
  .object({
    data: z.array(DecisionEvidenceLinkV1Schema),
  })
  .strict();
export type DecisionEvidenceLinkListResponse = z.infer<
  typeof DecisionEvidenceLinkListResponseSchema
>;
