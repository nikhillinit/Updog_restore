# Integrated Implementation Strategy

## WSL2 Migration + Domain Extraction + NotebookLM Documentation System

**Date:** 2025-10-26 **Context:** Reconciling three strategic initiatives into a
unified execution plan

---

## Executive Summary

### Three Parallel Initiatives

1. **WSL2 Migration** - Environment stability (eliminates Windows sidecar)
2. **Domain Extraction** - Extract 5 engines to `@updog/*` packages
3. **NotebookLM Documentation** - 95%+ accurate documentation generation

### Key Insight: Sequential Dependencies

These initiatives have a **natural dependency order**:

```
Phase 0: WSL2 Migration (foundation)
   ↓
Phase 1-2: Domain Extraction (business logic isolation)
   ↓
Phase 3-6: NotebookLM Documentation (knowledge capture)
```

**Why this order:**

- WSL2 provides stable environment for extraction work
- Extracted engines become documented modules
- NotebookLM system validates extraction success (95%+ accuracy on APIs)

---

## Unified Timeline (4 Weeks)

### Week 1: Foundation + NotebookLM Plugin Infrastructure

**Days 1-2: WSL2 Migration (Phase 0)**

- ✅ Deploy environment configs (.gitattributes, .nvmrc, .wslconfig)
- ✅ Agent safety rules + observability logging
- ✅ Parity infrastructure (CLI validation)
- **DoD:** `npm run dev` works in WSL2, doctor scripts pass

**Days 3-5: NotebookLM Plugin Scaffold (Phase 1)**

- ✅ Create `.claude/commands/notebooklm-documentation/` structure
- ✅ Implement `dependency-navigator` agent (topological sort)
- ✅ Implement `ast-validation` skill (TypeScript AST parsing)
- **DoD:** Plugin loads, navigator produces valid topological order

**Synergy:** WSL2's stable environment enables reliable plugin development

---

### Week 2: Core Extraction + Validation Infrastructure

**Days 6-8: Extract waterfall-calc (Phase 1)**

- Extract package with parity validation
- **NEW:** Use `doc-validator` agent to verify extraction accuracy
- Wire ParityBadge to UI if parity passes
- **DoD:** CLI parity passes, NotebookLM validator confirms 95%+ API accuracy

**Days 9-10: Extract liquidity-engine + cohort-engine**

- Same pattern: extract → parity → doc-validator
- Build dependency graph with `dependency-navigator`

**Days 11-12: NotebookLM Validation Infrastructure (Phase 2)**

- Implement `doc-validator` agent (Entity verification)
- Implement `entity-verification` skill (Existence Ratio)
- Package: `packages/doc-validation-agent/` (extends BaseAgent)
- **DoD:** Validates extracted packages with 95%+ accuracy

**Synergy:** Domain extraction provides concrete test cases for NotebookLM
validators

---

### Week 3: Remaining Engines + Context Extraction

**Days 13-15: Extract reserve-engine (Phase 2)**

- Use `behavioral-spec-extractor` to parse 337 lines of property tests
- Extract all 3 variants (ReserveEngine, ConstrainedReserveEngine,
  DeterministicReserveEngine)
- Add PercentValue branded types
- **DoD:** All tests pass, doc-validator confirms APIs

**Days 16-17: Extract pacing-engine**

- Parse 336 lines of pacing tests with `behavioral-spec-extractor`
- Document quarterly cadence explicitly
- **DoD:** Parity + doc validation pass

**Days 18-19: NotebookLM Context Extraction (Phase 3)**

- Implement `behavioral-spec-extractor` agent
- Implement `topological-processing` skill
- Extract behavioral specs from all engine tests
- **DoD:** Maps all test assertions to implementations

**Synergy:** Property-based tests become behavioral specifications for
NotebookLM

---

### Week 4: Orchestration + Documentation Production

**Days 20-22: NotebookLM Orchestration (Phase 4)**

- Implement `doc-assembly-orchestrator` agent (Sonnet coordination)
- Implement `quality-auditor` agent (3D evaluation)
- Multi-agent workflow: Navigator → Explorer → Spec Extractor → Writer →
  Validator
- **DoD:** Orchestrates 7+ agents, achieves 95%+ accuracy first pass

**Days 23-25: Command Automation (Phase 5)**

- `/notebooklm-generate [component]` - Full workflow
- `/doc-validate [file]` - Validate existing docs
- `/behavioral-spec [test-file]` - Extract test specs
- **DoD:** All commands execute end-to-end

**Days 26-28: Documentation Production (Phase 6)**

- Generate NotebookLM sources for all 5 extracted engines
- Create master procedure (docs/notebooklm-setup/procedure.md)
- Agent execution templates (waterfall, reserves, pacing)
- **DoD:** Non-technical user can generate docs following procedure

**Synergy:** Extracted engines + validated tests = 95%+ accurate NotebookLM
content

---

## Architecture Integration

### Existing Infrastructure (Your Assets)

```
BaseAgent Framework
├── Retry logic + health monitoring
├── Prometheus metrics integration
└── Conversation memory
   ↓ (extends)
NotebookLM Agents
├── DocValidator (95%+ accuracy gate)
├── BehavioralSpecExtractor (test parsing)
├── DependencyNavigator (topological sort)
└── QualityAuditor (3D evaluation)
```

**Integration Points:**

1. **code-explorer** → DocAgent's Reader (structure analysis)
2. **behavioral-spec-extractor** → DocAgent's Searcher (test context)
3. **docs-architect** → DocAgent's Writer (content generation)
4. **doc-validator** → DocAgent's Verifier (entity verification)
5. **quality-auditor** → DocAgent's Orchestrator (final review)

---

### Hybrid Model Strategy (wshobson Pattern)

**Planning/Review:** Sonnet (doc-assembly-orchestrator, quality-auditor)
**Execution:** Haiku (dependency-navigator, doc-validator,
behavioral-spec-extractor)

**Why this works:**

- Sonnet plans workflow + final review (complex reasoning)
- Haiku executes validation + parsing (fast, token-efficient)
- Cost-optimized for 95%+ accuracy

---

### Plugin Architecture (Token Optimization)

```
.claude/commands/notebooklm-documentation/
├── agents/          (Progressive disclosure)
│   ├── doc-validator.md          (Haiku - only loads during validation)
│   ├── behavioral-spec-extractor.md (Haiku - only loads during test parsing)
│   ├── doc-assembly-orchestrator.md (Sonnet - only loads during orchestration)
│   ├── dependency-navigator.md    (Haiku - only loads during topological sort)
│   └── quality-auditor.md        (Sonnet - only loads during final review)
├── commands/        (Entry points)
│   ├── notebooklm-generate.md    (Orchestrates all agents)
│   ├── doc-validate.md           (Standalone validation)
│   └── behavioral-spec.md        (Standalone spec extraction)
├── skills/          (Reusable utilities)
│   ├── ast-validation.md         (TypeScript AST parsing)
│   ├── entity-verification.md    (Existence Ratio calculation)
│   └── topological-processing.md (Dependency-aware ordering)
└── .claude-plugin.json           (Manifest: 3.4 components/plugin average)
```

**Token Savings:**

- Skills load only when activated (not in every agent prompt)
- Haiku agents for fast execution (85% token reduction vs Sonnet)
- Progressive disclosure prevents context bloat

---

## Modified Domain Extraction Workflow

### Old Workflow (WSL2 + Extraction Only)

```
1. Extract waterfall-calc
2. Run parity validation (CLI)
3. Wire ParityBadge to UI
4. Repeat for liquidity-engine, cohort-engine
5. Extract reserve-engine, pacing-engine
6. Document manually in NotebookLM
```

### New Workflow (Integrated with NotebookLM Validation)

```
1. Extract waterfall-calc
2. Run parity validation (CLI) - Existing
3. Run doc-validator agent (NEW) - 95%+ API accuracy gate
4. Generate behavioral specs (NEW) - Extract from waterfall.test.ts
5. Wire ParityBadge to UI
6. Auto-generate NotebookLM source (NEW) - /notebooklm-generate "waterfall-calc"
7. Repeat for other engines
```

**Benefits:**

- ✅ Dual validation (parity + doc-validator) catches extraction errors early
- ✅ Behavioral specs document edge cases automatically
- ✅ NotebookLM sources generated with 95%+ accuracy (no manual writing)
- ✅ Quality gates prevent hallucinated documentation

---

## Quality Gates (Integrated)

### Gate 1: Parity Validation (Existing)

```bash
npm run parity:run
# Validates: TVPI, DPI, IRR, NAV calculations
# Tolerance: 1% general, 0.5% critical metrics
```

### Gate 2: Doc Validation (NEW - NotebookLM)

```bash
/doc-validate "packages/waterfall-calc/README.md"
# Validates: Entity existence (95%+ threshold)
# Checks: Function names, types, methods, constants
# Output: Existence Ratio (verified entities / extracted entities)
```

### Gate 3: Behavioral Specs (NEW - NotebookLM)

```bash
/behavioral-spec "packages/waterfall-calc/src/__tests__/waterfall.test.ts"
# Extracts: 30 test cases → behavioral specifications
# Maps: Test assertions → implementation code
# Validates: Edge cases documented (clamping, type switching, immutability)
```

### Gate 4: 3D Quality Evaluation (NEW - NotebookLM)

```bash
/notebooklm-generate "waterfall-calc"
# Final quality-auditor review:
# - Completeness: All functions documented?
# - Helpfulness: Clear examples + parameter docs?
# - Truthfulness: 95%+ entity verification?
```

**Combined DoD (Per Engine):**

- [ ] Parity validation passes (≤1% delta)
- [ ] Doc validator confirms 95%+ API accuracy
- [ ] Behavioral specs extracted from all tests
- [ ] 3D quality evaluation passes (C+H+T)
- [ ] Human review checkpoint approved
- [ ] NotebookLM source generated

---

## Agent Orchestration Patterns (Integrated)

### Pattern 1: Sequential Extraction + Validation

```typescript
// Orchestrated by doc-assembly-orchestrator (Sonnet)

await withAgentLog(
  'dependency-navigator',
  'analyze waterfall deps',
  async () => {
    // Haiku: Topological sort of waterfall.ts dependencies
    return { dependencies: ['WaterfallSchema', 'clamp01', 'clampInt'] };
  }
);

await withAgentLog('code-explorer', 'extract waterfall structure', async () => {
  // Existing agent: Extract API surface
  return {
    exports: [
      'isAmerican',
      'isEuropean',
      'applyWaterfallChange',
      'changeWaterfallType',
    ],
  };
});

await withAgentLog(
  'behavioral-spec-extractor',
  'parse waterfall tests',
  async () => {
    // Haiku: Extract 30 test cases from waterfall.test.ts
    return { specs: 30, edgeCases: 7 };
  }
);

await withAgentLog('docs-architect', 'generate waterfall docs', async () => {
  // Existing agent (Sonnet): Write documentation
  return { sections: ['API', 'Invariants', 'Usage', 'Tests'] };
});

await withAgentLog('doc-validator', 'validate waterfall docs', async () => {
  // Haiku: Entity verification (95%+ threshold)
  return { existenceRatio: 0.967, unverifiedEntities: [] };
});

await withAgentLog('quality-auditor', 'final review', async () => {
  // Sonnet: 3D evaluation (Completeness + Helpfulness + Truthfulness)
  return { completeness: 1.0, helpfulness: 4.3, truthfulness: 0.967 };
});
```

**Cost Optimization:**

- Haiku agents: 4/6 steps (dependency-navigator, behavioral-spec-extractor,
  doc-validator, code-explorer)
- Sonnet agents: 2/6 steps (docs-architect, quality-auditor)
- **Token savings:** ~70% vs all-Sonnet workflow

---

### Pattern 2: Parallel Extraction Swarm

```typescript
// For independent engines (liquidity-engine + cohort-engine)

await Promise.all([
  Task({
    subagent_type: 'code-explorer',
    prompt: 'Extract liquidity-engine API',
  }),
  Task({ subagent_type: 'code-explorer', prompt: 'Extract cohort-engine API' }),
  Task({
    subagent_type: 'behavioral-spec-extractor',
    prompt: 'Parse liquidity tests',
  }),
  Task({
    subagent_type: 'behavioral-spec-extractor',
    prompt: 'Parse cohort tests',
  }),
]);

// Then validate in parallel
await Promise.all([
  Task({
    subagent_type: 'doc-validator',
    prompt: 'Validate liquidity-engine docs',
  }),
  Task({
    subagent_type: 'doc-validator',
    prompt: 'Validate cohort-engine docs',
  }),
]);
```

**Parallelism:** 2x speedup for independent components

---

## File Structure (Integrated)

```
Updog_restore/
├── .claude/
│   └── commands/
│       └── notebooklm-documentation/    (NEW - Phase 1)
│           ├── agents/                  (5 agents)
│           ├── commands/                (3 commands)
│           ├── skills/                  (3 skills)
│           └── .claude-plugin.json
│
├── packages/                            (NEW - Phase 1-2 extraction)
│   ├── waterfall-calc/
│   ├── liquidity-engine/
│   ├── cohort-engine/
│   ├── reserve-engine/
│   ├── pacing-engine/
│   └── doc-validation-agent/            (NEW - Phase 2 NotebookLM)
│
├── docs/
│   ├── notebooklm-setup/                (NEW - Phase 6)
│   │   ├── procedure.md                 (Master procedure - 10 sections)
│   │   ├── agent-templates/             (Copy-paste workflows)
│   │   │   ├── waterfall-docs.md
│   │   │   ├── reserve-engines.md
│   │   │   ├── pacing-engine.md
│   │   │   └── validation-checklist.md
│   │   ├── qa-framework.md              (Anti-patterns + success criteria)
│   │   └── quickstart.md                (5-minute overview)
│   │
│   ├── notebooklm-sources/              (GENERATED - Phase 4-6)
│   │   ├── waterfall-calc.md            (95%+ accurate)
│   │   ├── reserve-engine.md            (3 engines documented)
│   │   ├── pacing-engine.md
│   │   ├── liquidity-engine.md
│   │   └── cohort-engine.md
│   │
│   ├── metrics-spec.md                  (Canonical metrics reference)
│   └── algorithms/
│       ├── exit-moic-planned-reserves.md
│       └── graduation-matrix.md
│
├── scripts/
│   ├── agent-logger.mjs                 (Observability - Week 1)
│   ├── run-parity.mjs                   (Parity validation - Week 1)
│   ├── parity-validator.ts              (Parity wrapper - Week 1)
│   └── notebooklm-ingest.mjs            (NEW - Phase 6)
│
├── artifacts/
│   ├── agent-logs/                      (JSON logs per agent)
│   ├── parity/                          (Parity reports)
│   └── notebooklm-validation/           (NEW - Doc validator reports)
│
├── .gitattributes                       (Week 1)
├── .nvmrc                               (Week 1)
├── .wslconfig                           (Week 1 - Windows host)
└── .vscode/settings.json                (Week 1 - Remote-WSL)
```

---

## Success Metrics (Integrated)

### Week 1 (Foundation)

- [ ] WSL2 environment stable (doctor scripts pass)
- [ ] NotebookLM plugin loads cleanly
- [ ] Navigator produces valid topological order
- [ ] AST skill extracts signatures with 100% accuracy

### Week 2 (Extraction + Validation)

- [ ] 3 engines extracted (waterfall-calc, liquidity-engine, cohort-engine)
- [ ] CLI parity passes for all 3 (≤1% delta)
- [ ] Doc validator confirms 95%+ API accuracy for all 3
- [ ] ParityBadge wired to UI

### Week 3 (Remaining Engines + Context)

- [ ] 2 engines extracted (reserve-engine, pacing-engine)
- [ ] Behavioral specs extracted from all tests (500+ assertions)
- [ ] Dependency graphs built for all 5 engines
- [ ] All quality gates pass

### Week 4 (Orchestration + Production)

- [ ] All 3 slash commands operational
- [ ] NotebookLM sources generated for all 5 engines (95%+ accuracy)
- [ ] Master procedure documented
- [ ] Non-technical user can generate docs in <10 minutes

---

## Risk Mitigation (Integrated)

### Risk 1: WSL2 Migration Breaks Workflow

**Impact:** High (blocks all work) **Mitigation:**

- Phase 0 isolated (test environment before extraction)
- Recovery scripts (`wsl:reset`)
- Fallback: Stay on Windows native + sidecar until stable

---

### Risk 2: Domain Extraction Breaks Parity

**Impact:** Medium (delays extraction) **Mitigation:**

- CLI parity validation catches issues early (before UI work)
- Doc validator provides second verification layer (95%+ API accuracy)
- Rollback: Keep original implementations in client/src/core/

---

### Risk 3: NotebookLM Validation Insufficient

**Impact:** Medium (low-quality docs) **Mitigation:**

- 95%+ accuracy threshold enforced by doc-validator
- Human review checkpoints after quality-auditor
- Iterative refinement loop (Verifier feedback → Reader → repeat)

---

### Risk 4: Token/Cost Overrun

**Impact:** Low (budget concern) **Mitigation:**

- Hybrid model (85% Haiku, 15% Sonnet)
- Progressive disclosure (skills load on-demand)
- Parallel execution where possible

---

## Modified Timeline Comparison

### Original Plan (WSL2 + Extraction Only)

- Week 1-2: WSL2 + extract 3 engines
- Week 3-4: Extract 2 engines + documentation
- **Total:** 4 weeks, manual NotebookLM content creation

### Integrated Plan (WSL2 + Extraction + NotebookLM)

- Week 1: WSL2 + NotebookLM plugin infrastructure
- Week 2: Extract 3 engines + validation infrastructure
- Week 3: Extract 2 engines + context extraction
- Week 4: Orchestration + auto-generated NotebookLM sources
- **Total:** 4 weeks, **automated** 95%+ accurate NotebookLM content

**Time savings:** ~1-2 weeks of manual documentation work eliminated

---

## Adoption Decision Matrix

| Feature                   | Original Plan                      | Integrated Plan    | Delta             |
| ------------------------- | ---------------------------------- | ------------------ | ----------------- |
| **Environment Stability** | ✅ WSL2                            | ✅ WSL2            | Same              |
| **Domain Extraction**     | ✅ 5 engines                       | ✅ 5 engines       | Same              |
| **Parity Validation**     | ✅ CLI + UI                        | ✅ CLI + UI        | Same              |
| **Doc Validation**        | ❌ Manual                          | ✅ 95%+ automated  | **+95% accuracy** |
| **Behavioral Specs**      | ❌ None                            | ✅ Auto-extracted  | **+500 specs**    |
| **NotebookLM Content**    | ⚠️ Manual (risk of hallucinations) | ✅ 95%+ accurate   | **+95% quality**  |
| **Timeline**              | 4 weeks                            | 4 weeks            | Same              |
| **Effort**                | High (manual docs)                 | Medium (automated) | **-30% effort**   |

---

## Recommendation: ADOPT INTEGRATED PLAN

### Why This Works

1. **Same timeline** - NotebookLM work parallelizes with extraction
2. **Higher quality** - 95%+ accuracy vs manual documentation risk
3. **Less effort** - Automation eliminates manual doc writing
4. **Compound benefits** - Each phase builds on previous work
5. **Risk-managed** - Multiple validation layers (parity + doc-validator)

### Prerequisites (Confirm Before Starting)

1. ✅ **Brand assets verified** - PRESS_ON_BRANDING_COMPLETE.md confirms
   fonts/colors
2. ✅ **API compatibility confirmed** - golden-dataset.ts + excel-parity.ts
   validated
3. ✅ **BaseAgent framework exists** - Ready for doc-validation-agent extension
4. ⚠️ **GitHub MCP tools** - Verify availability for PR automation (optional)

### Next Action

**APPROVE TO PROCEED** with integrated plan:

- Week 1 starts with WSL2 + NotebookLM plugin scaffold
- All artifacts production-ready
- 95%+ accuracy gates enforce quality
- Human review checkpoints maintain control

---

## Appendix: Command Reference

### Week 1 Commands

```bash
# WSL2 validation
npm run wsl:doctor
npm run parity:run

# Plugin validation
claude --list-plugins  # Should show notebooklm-documentation
```

### Week 2-3 Commands

```bash
# Per-engine workflow
npm run build
npm run parity:run
/doc-validate "packages/waterfall-calc/README.md"
/behavioral-spec "packages/waterfall-calc/src/__tests__/waterfall.test.ts"
```

### Week 4 Commands

```bash
# Full automation
/notebooklm-generate "waterfall-calc"
/notebooklm-generate "reserve-engine"
/notebooklm-generate "pacing-engine"

# Validation
/doc-validate "docs/notebooklm-sources/*.md"
```

---

**End of Integrated Implementation Strategy**

This plan achieves all three goals (WSL2 stability, domain extraction,
NotebookLM documentation) in the same 4-week timeline while adding automated
95%+ accuracy validation and reducing manual effort by ~30%.
