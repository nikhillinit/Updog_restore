import { describe, expect, it } from 'vitest';

import {
  TaskCreateSchema,
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
