---
name: 'Phase 1 Issue #5: Prompt Templates + Versioning'
about: Typed, versioned prompt templates with venture-specific few-shots
labels: enhancement, ai-agents, phase-1, dx
milestone: Agent Foundation Phase 1
---

## Summary

Typed, versioned prompt template system with venture-specific few-shot examples
and OpenAPI tool integration.

**Estimate:** 4 points

## Acceptance Criteria

### PromptTemplate Core

- [ ] Zod-typed inputs and outputs (validate both input and model responses)
- [ ] `{{variable}}` interpolation with escaping
- [ ] **Prompt hashing:** Store `template_hash` (SHA-256) for version tracking
- [ ] Validate model outputs with Zod schemas (catch drift)

### Few-Shot Templates

- [ ] `portfolio-qa.ts`: LP-facing Q&A
- [ ] `reserve-sizing.ts`: Follow-on recommendations using **Exit MOIC on
      Planned Reserves** terminology
- [ ] `waterfall-checks.ts`: Carry/waterfall validation
- [ ] **Language parity:** Mirror 7-flavor MOIC vocabulary (current, exit,
      initial vs follow-on, blended, probability-weighted, net)

### OpenAPI Tool Integration

- [ ] `buildToolPrompt()` extracts tools from `openapi/` schemas
- [ ] Filter unsafe/huge schemas (max depth 3, max properties 20)
- [ ] Cap max tools per prompt (≤5) to keep context tight
- [ ] Document tool selection heuristics

### Quality

- [ ] `ai/prompt/README.md` with usage examples + conventions
- [ ] Template rendering tests
- [ ] Output validation tests

## Tasks

- [ ] Add `template_hash` field to `PromptTemplate` class
- [ ] Implement input AND output Zod validation
- [ ] Implement `openapi-tools.ts` with schema filtering
- [ ] Verify reserve sizing language matches 7 MOIC types
- [ ] Add tests: `ai/prompt/__tests__/PromptTemplate.test.ts`
- [ ] Create "Metrics & Meanings" one-pager

## Files to Create

- `ai/prompt/__tests__/PromptTemplate.test.ts`
- `docs/metrics-meanings.md`
