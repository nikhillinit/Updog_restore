/**
 * Operating Objects -- Task Contract (CREATE + response shapes)
 *
 * Fund-scoped work items. Backend-first per
 * docs/design/audits/server-object-readiness.md (PR-T1, minimal: create + list).
 * No money fields. `status` is server-controlled ('open' at create); lifecycle
 * transitions are a later PR. `etag` (opaque xmin row token) is carried from day
 * one so a future edit/transition PR needs no contract change.
 *
 * @module shared/contracts/operating-objects/task.contract
 * @see docs/design/audits/server-object-readiness.md
 */

import { z } from 'zod';

export const TaskStatusSchema = z.enum(['open', 'in_progress', 'done']);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

// CREATE: client supplies title (+ optional owner/dueDate/description). `status`
// is server-controlled (always 'open'); id/etag/timestamps are server-assigned.
export const TaskCreateSchema = z
  .object({
    fundId: z.number().int().positive(),
    title: z.string().trim().min(1).max(200),
    ownerId: z.number().int().positive().optional(),
    dueDate: z.string().date().optional(),
    description: z.string().max(2000).optional(),
  })
  .strict();

export type TaskCreate = z.infer<typeof TaskCreateSchema>;

// RESPONSE (server -> client). `.strict()` so internal provenance (created_by)
// can never leak. dueDate is date-only; timestamps are ISO datetimes.
export const TaskResponseSchema = z
  .object({
    id: z.number().int().positive(),
    fundId: z.number().int().positive(),
    title: z.string().min(1),
    status: TaskStatusSchema,
    ownerId: z.number().int().positive().nullable(),
    dueDate: z.string().date().nullable(),
    description: z.string().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    etag: z.string().min(1),
  })
  .strict();

export type TaskResponse = z.infer<typeof TaskResponseSchema>;

export const TaskListResponseSchema = z.object({
  data: z.array(TaskResponseSchema),
});
export type TaskListResponse = z.infer<typeof TaskListResponseSchema>;
