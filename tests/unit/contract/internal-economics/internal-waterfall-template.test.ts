import { describe, expect, it } from 'vitest';
// Default import on purpose: tests/setup/node-setup.ts vi.mock('fs') stubs the
// NAMED readFileSync/existsSync exports but keeps the default export real.
// Named fs imports here would read the mock, not the file.
import fs from 'node:fs';
import path from 'node:path';

import {
  InternalWaterfallTemplateSchema,
  type InternalWaterfallTemplate,
} from '../../../../shared/contracts/internal-economics/internal-waterfall-template';

const CONTRACT_PATH = path.join(
  process.cwd(),
  'shared/contracts/internal-economics/internal-waterfall-template.ts'
);

describe('InternalWaterfallTemplateSchema (Task 16.0 governance contract)', () => {
  it('accepts both internal template values', () => {
    expect(InternalWaterfallTemplateSchema.parse('whole_fund')).toBe('whole_fund');
    expect(InternalWaterfallTemplateSchema.parse('deal_by_deal')).toBe('deal_by_deal');
  });

  it('exports the inferred type', () => {
    const template: InternalWaterfallTemplate = 'whole_fund';
    expect(InternalWaterfallTemplateSchema.parse(template)).toBe('whole_fund');
  });

  it('rejects the public waterfall label', () => {
    expect(() => InternalWaterfallTemplateSchema.parse('american')).toThrow();
  });

  it('rejects the public whole-fund label instead of translating it', () => {
    // The public WaterfallTypeSchema accepts this value (ADR-068). The internal
    // enum must still reject it outright: no round-trip semantics, and the
    // vocabularies stay separate. This file lives under tests/, outside the
    // token scanner's globs.
    expect(() => InternalWaterfallTemplateSchema.parse('european')).toThrow();
  });

  it('never imports or references the public vocabulary schema', () => {
    const source = fs.readFileSync(CONTRACT_PATH, 'utf8');
    // Strip block comments first: the file's header JSDoc legitimately names
    // both terms in prose explaining why the executable code must not use
    // them. Only the code itself must be clean.
    const codeOnly = source.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(codeOnly).not.toMatch(/forbidden-features/);
    expect(codeOnly).not.toMatch(/WaterfallTypeSchema/);
  });
});
