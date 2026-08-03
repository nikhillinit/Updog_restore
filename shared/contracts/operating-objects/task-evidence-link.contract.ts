import { z } from 'zod';

export const TASK_EVIDENCE_LINK_CONTRACT_VERSION = 'task-evidence-link/1.0.0' as const;

const PositiveIntSchema = z.number().int().positive();

export const TaskEvidenceTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('analysis_reference'), id: PositiveIntSchema }).strict(),
  z.object({ kind: z.literal('internal_economics_run'), id: PositiveIntSchema }).strict(),
]);

export const TaskEvidenceLinkCreateRequestSchema = z
  .object({ target: TaskEvidenceTargetSchema })
  .strict();

export const TaskEvidenceLinkListQuerySchema = z.object({}).strict();

export const TaskEvidenceLinkV1Schema = z
  .object({
    contractVersion: z.literal(TASK_EVIDENCE_LINK_CONTRACT_VERSION),
    linkId: PositiveIntSchema,
    fundId: PositiveIntSchema,
    taskId: PositiveIntSchema,
    target: TaskEvidenceTargetSchema,
    createdAt: z.string().datetime(),
  })
  .strict();

export const TaskEvidenceLinkListResponseSchema = z
  .object({ data: z.array(TaskEvidenceLinkV1Schema) })
  .strict();

export type TaskEvidenceTarget = z.infer<typeof TaskEvidenceTargetSchema>;
export type TaskEvidenceLinkCreateRequest = z.infer<typeof TaskEvidenceLinkCreateRequestSchema>;
export type TaskEvidenceLinkV1 = z.infer<typeof TaskEvidenceLinkV1Schema>;
export type TaskEvidenceLinkListResponse = z.infer<typeof TaskEvidenceLinkListResponseSchema>;
