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

// PATCH (edit fields + status). All keys optional and `.strict()` (unknown keys
// reject). `fundId` is a path-consistency check only (NOT an editable field), so
// the refine requires >=1 ACTUAL editable field -- a fundId-only body is a 400,
// never a no-op that rotates the row version. Nullable fields accept explicit
// `null` to clear (owner_id set-null FK, due_date, description); the service uses
// `'key' in patch` to tell absent from explicit-null. `status` is enum-only --
// free transitions (any state -> any state), no terminal/immutable state. dueDate
// stays date-only (`z.string().date()`); it is NEVER serialized through a Date.
const TASK_EDITABLE_KEYS = ['title', 'ownerId', 'dueDate', 'description', 'status'] as const;

export const TaskPatchSchema = z
  .object({
    fundId: z.number().int().positive().optional(),
    title: z.string().trim().min(1).max(200).optional(),
    ownerId: z.number().int().positive().nullable().optional(),
    dueDate: z.string().date().nullable().optional(),
    description: z.string().max(2000).nullable().optional(),
    status: TaskStatusSchema.optional(),
  })
  .strict()
  .refine((patch) => TASK_EDITABLE_KEYS.some((key) => key in patch), {
    message:
      'At least one editable field (title, ownerId, dueDate, description, status) is required',
  });

export type TaskPatch = z.infer<typeof TaskPatchSchema>;

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
