import { describe, expect, it } from 'vitest';

import {
  TaskCreateSchema,
  TaskPatchSchema,
  TaskResponseSchema,
  TaskStatusSchema,
} from '@shared/contracts/operating-objects/task.contract';

describe('TaskCreateSchema', () => {
  const valid = { fundId: 1, title: 'Follow up with LP' };

  it('accepts a minimal valid create', () => {
    expect(TaskCreateSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts optional owner/dueDate/description', () => {
    const parsed = TaskCreateSchema.safeParse({
      ...valid,
      ownerId: 42,
      dueDate: '2026-07-01',
      description: 'context',
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects unknown top-level keys (.strict)', () => {
    expect(TaskCreateSchema.safeParse({ ...valid, status: 'done' }).success).toBe(false);
  });

  it('rejects an empty or whitespace-only title', () => {
    expect(TaskCreateSchema.safeParse({ fundId: 1, title: '' }).success).toBe(false);
    expect(TaskCreateSchema.safeParse({ fundId: 1, title: '   ' }).success).toBe(false);
  });

  it('trims the title', () => {
    const parsed = TaskCreateSchema.parse({ fundId: 1, title: '  hi  ' });
    expect(parsed.title).toBe('hi');
  });

  it('rejects a title longer than 200 chars', () => {
    expect(TaskCreateSchema.safeParse({ fundId: 1, title: 'x'.repeat(201) }).success).toBe(false);
  });

  it('rejects a non-ISO-date dueDate', () => {
    expect(TaskCreateSchema.safeParse({ ...valid, dueDate: '2026-07-01T00:00:00Z' }).success).toBe(
      false
    );
  });

  it('rejects a non-positive fundId', () => {
    expect(TaskCreateSchema.safeParse({ fundId: 0, title: 'x' }).success).toBe(false);
  });
});

describe('TaskStatusSchema', () => {
  it('covers exactly the three lifecycle states', () => {
    expect(TaskStatusSchema.options).toEqual(['open', 'in_progress', 'done']);
  });
});

describe('TaskResponseSchema', () => {
  const row = {
    id: 10,
    fundId: 1,
    title: 'Follow up',
    status: 'open',
    ownerId: null,
    dueDate: null,
    description: null,
    createdAt: '2026-06-16T00:00:00.000Z',
    updatedAt: '2026-06-16T00:00:00.000Z',
    etag: 'W/"abc123"',
  };

  it('round-trips a valid response', () => {
    expect(TaskResponseSchema.safeParse(row).success).toBe(true);
  });

  it('requires a non-empty etag', () => {
    expect(TaskResponseSchema.safeParse({ ...row, etag: '' }).success).toBe(false);
  });

  it('rejects internal provenance leakage (.strict on created_by)', () => {
    expect(TaskResponseSchema.safeParse({ ...row, createdBy: 7 }).success).toBe(false);
  });
});

describe('TaskPatchSchema', () => {
  it('accepts a single-field edit', () => {
    expect(TaskPatchSchema.safeParse({ title: 'New title' }).success).toBe(true);
  });

  it('accepts a status-only edit (free transition)', () => {
    expect(TaskPatchSchema.safeParse({ status: 'done' }).success).toBe(true);
  });

  it('accepts explicit null to clear each nullable field', () => {
    expect(TaskPatchSchema.safeParse({ ownerId: null }).success).toBe(true);
    expect(TaskPatchSchema.safeParse({ dueDate: null }).success).toBe(true);
    expect(TaskPatchSchema.safeParse({ description: null }).success).toBe(true);
  });

  it('rejects a null title (NOT NULL column)', () => {
    expect(TaskPatchSchema.safeParse({ title: null }).success).toBe(false);
  });

  it('rejects an empty patch (no editable field)', () => {
    expect(TaskPatchSchema.safeParse({}).success).toBe(false);
  });

  it('rejects a fundId-only patch (fundId is not an editable field)', () => {
    expect(TaskPatchSchema.safeParse({ fundId: 1 }).success).toBe(false);
  });

  it('accepts fundId alongside an editable field (path-consistency check)', () => {
    expect(TaskPatchSchema.safeParse({ fundId: 1, title: 'x' }).success).toBe(true);
  });

  it('rejects unknown keys (.strict)', () => {
    expect(TaskPatchSchema.safeParse({ title: 'x', bogus: 1 }).success).toBe(false);
  });

  it('rejects an invalid status value', () => {
    expect(TaskPatchSchema.safeParse({ status: 'archived' }).success).toBe(false);
  });

  it('rejects a datetime dueDate (date-only only)', () => {
    expect(TaskPatchSchema.safeParse({ dueDate: '2026-07-01T00:00:00Z' }).success).toBe(false);
  });

  it('rejects a whitespace-only title', () => {
    expect(TaskPatchSchema.safeParse({ title: '   ' }).success).toBe(false);
  });

  it('trims the title', () => {
    expect(TaskPatchSchema.parse({ title: '  hi  ' }).title).toBe('hi');
  });
});
