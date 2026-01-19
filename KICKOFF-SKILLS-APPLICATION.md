---
status: ACTIVE
last_updated: 2026-01-19
---

# Kickoff Prompt: Skills Application to Real VC Fund Work

**Purpose**: Initiate real-world validation of 8 new Claude skills (Week 1 +
Week 2) through actual VC fund modeling tasks

**Context**: Skills Integration complete (21 skills total). Now validating
effectiveness through practical application with metrics tracking.

---

## Kickoff Prompt (Copy to New Conversation)

```
I'm initiating the Skills Application phase for the Press On Ventures VC Fund Modeling Platform (Updog). We recently integrated 8 new Claude skills and need to validate their effectiveness through real-world usage.

CONTEXT:
- Week 1 Skills Integration: 6 new skills (ai-model-selection, multi-model-consensus, prompt-caching-usage, iterative-improvement, xlsx, api-design-principles)
- Week 2 Skills Integration: 2 new skills (task-decomposition, architecture-patterns)
- Total Skills Available: 21 skills across 7 categories
- Skills Location: .claude/skills/README.md
- Handoff Document: HANDOFF-SKILLS-APPLICATION-2025-11-29.md

OBJECTIVES:
1. Apply new skills to real VC fund modeling work
2. Track effectiveness with continuous-improvement skill
3. Collect quantitative metrics (time, cost, quality)
4. Collect qualitative ratings (skill utility 1-10 scale)
5. Refine patterns based on real-world application

MANDATORY WORKFLOW:
1. Read HANDOFF-SKILLS-APPLICATION-2025-11-29.md for complete context
2. Review .claude/skills/README.md for skill catalog
3. Select application scenario (recommend: Scenario 1 or Scenario 2)
4. Apply skills following recommended workflow
5. Document results using continuous-improvement template
6. Track metrics in docs/skills-application-log.md

DELIVERABLES:
- Skills application log with continuous-improvement entries
- Quantitative metrics spreadsheet (time, cost, quality)
- Skill utility ratings (1-10 scale per skill)
- Workflow pattern documentation (which skill combinations work best)
- Skill refinement recommendations

FIRST ACTION:
Please read HANDOFF-SKILLS-APPLICATION-2025-11-29.md and propose the best first task for skill validation. Consider:
- Which Week 1/2 skills can be exercised?
- Which task has clear baseline metrics for comparison?
- Which task demonstrates immediate ROI?

Then we'll execute that task with full skill application and metrics tracking.
```

---

## Alternative Scenario-Specific Kickoffs

### Kickoff 1: LP Quarterly Report (xlsx Skill Focus)

```
I need to generate an LP quarterly report for Press On Ventures with waterfall distributions exported to Excel.

SKILL VALIDATION GOALS:
- Primary: xlsx skill (formulas-first principle, financial standards)
- Secondary: verification-before-completion (recalc.py validation)
- Tracking: continuous-improvement (time savings, formula accuracy)

REQUIREMENTS:
1. Export Q4 2025 waterfall calculations to Excel
2. Use Excel formulas (NOT hardcoded values) per xlsx skill guidance
3. Follow financial standards (color coding, number formatting)
4. Run recalc.py to validate zero formula errors
5. Document: Time to generate, formula correctness, quality score (1-10)

BASELINE FOR COMPARISON:
- Historical time to generate: [X hours]
- Historical formula errors: [Y errors]

Please apply the xlsx skill following the guidance in .claude/skills/xlsx.md and track all metrics using the continuous-improvement template from HANDOFF-SKILLS-APPLICATION-2025-11-29.md.
```

### Kickoff 2: Waterfall Bug Fix (Multiple Skills Focus)

```
I have a TypeScript error in the AMERICAN waterfall carry calculation that needs debugging and fixing.

SKILL VALIDATION GOALS:
- Systematic-debugging (mandatory baseline - root cause FIRST)
- ai-model-selection (route to optimal AI - DeepSeek for logical debugging)
- iterative-improvement (3-iteration refinement loop)
- multi-model-consensus (validate fix with Gemini - free tier)
- test-driven-development (RED-GREEN-REFACTOR)
- verification-before-completion (evidence before claiming done)
- continuous-improvement (track all metrics)

WORKFLOW:
1. systematic-debugging → Find root cause (NO FIXES WITHOUT ROOT CAUSE)
2. ai-model-selection → Route debugging to DeepSeek
3. iterative-improvement → Apply 3-iteration refinement
4. multi-model-consensus → Validate fix with Gemini
5. test-driven-development → Write failing test → fix → refactor
6. verification-before-completion → Run tests before completion claim
7. continuous-improvement → Document results

METRICS TO TRACK:
- Time to fix (with skills vs historical baseline)
- AI API costs (with routing vs default)
- Success rate (fix without regressions: YES/NO)
- Skill utility ratings (1-10 per skill)

ERROR DETAILS:
[Paste TypeScript error and affected file here]

Please apply all 7 skills in sequence and document each step's contribution to the solution.
```

### Kickoff 3: New Monte Carlo API Endpoint (api-design-principles Focus)

```
I need to design a new Express API endpoint: POST /api/simulations for Monte Carlo job submissions.

SKILL VALIDATION GOALS:
- brainstorming (clarify async vs sync, parameter design)
- api-design-principles (RESTful design, BullMQ async pattern)
- inversion-thinking (identify failure modes)
- task-decomposition (break into subtasks: schema, route, worker, tests)
- writing-plans (detailed implementation plan)
- test-driven-development (write tests first)
- verification-before-completion (test endpoint before claiming done)
- continuous-improvement (track design quality and implementation speed)

WORKFLOW:
1. brainstorming → Refine requirements (5-10 min)
2. api-design-principles → Apply RESTful design patterns
3. inversion-thinking → List failure modes (timeout, queue overflow, etc.)
4. task-decomposition → Break into 10-30 min subtasks
5. writing-plans → Create implementation plan
6. test-driven-development → RED-GREEN-REFACTOR cycle
7. verification-before-completion → Integration tests pass
8. continuous-improvement → Document metrics

REQUIREMENTS:
- Resource-oriented endpoint design
- Asynchronous processing with BullMQ
- Zod validation schema
- Idempotency-Key header support
- 202 Accepted response with Location header
- Integration tests

METRICS:
- API design quality score (1-10)
- Time to implement (with skills vs baseline)
- Test coverage percentage
- Bugs found in review (target: 0)

Please apply all 8 skills following the recommended workflow from HANDOFF-SKILLS-APPLICATION-2025-11-29.md.
```

---

## Metrics Tracking Template

Create this file: `docs/skills-application-log.md`

```markdown
# Skills Application Log

## Application 1: [Task Name]

**Date**: 2025-11-29 **Task Type**: [Bug fix / Feature / Refactoring / Report]
**Duration**: [X hours] **Skills Used**: [List in order]

### What Worked

1. [Skill]: [Outcome]

### What Was Inefficient

1. [Issue]

### Surprises

- [Unexpected finding]

### Clarity Improvements Needed

- [Skill refinement suggestion]

### Next Time Changes

1. [Process improvement]

### Metrics

- Time: [X hours] (Baseline: [Y], Savings: [Z%])
- Cost: $[X] (Routing saved: $[Y])
- Quality: [Pass rate, bugs]
- Skill Ratings: [ai-model-selection: 8/10, ...]

---

## Application 2: [Next Task]

...
```

---

## Success Indicators

After first 3 applications, you should have:

**Quantitative Data**:

- [ ] Time savings percentage (or learning curve if slower)
- [ ] Cost optimization through ai-model-selection routing
- [ ] Quality metrics (test pass rate, bugs found)

**Qualitative Data**:

- [ ] Skill utility ratings (1-10) for each skill used
- [ ] Workflow friction points identified
- [ ] Skill combination patterns documented

**Refinement Actions**:

- [ ] At least 2 skill improvement suggestions
- [ ] At least 1 cross-reference update needed
- [ ] At least 1 new workflow pattern discovered

---

## Next Steps After Kickoff

1. **Execute kickoff in new conversation** (use prompt above)
2. **Select first task** (recommend: LP report or waterfall bug)
3. **Apply skills with full documentation**
4. **Collect metrics using continuous-improvement template**
5. **After 3-5 applications**: Synthesize findings and update skills

---

**End of Kickoff Document** **Date**: 2025-11-29 **Ready**: Copy kickoff prompt
to new conversation to begin
