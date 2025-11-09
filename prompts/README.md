# Prompt Templates for VC Fund Modeling Platform

Production-ready templates for solo development on the Updog (Press On Ventures)
platform. Each template is tailored to the tech stack (React/TypeScript
frontend, Node/Express backend, PostgreSQL, BullMQ workers) and enforces the
quality-first methodology outlined in CLAUDE.md.

## Files Overview

### 1. feature-implementation.md (208 lines, 5.5 KB)

**Purpose:** Structured feature request and implementation plan

**Key Sections:**

- Feature description with user stories and acceptance criteria
- Technical specification with architecture impact
- Data model and API endpoint definitions
- Implementation checklist (before/during/after coding)
- Anti-pattern prevention guardrails
- Quality gates and testing strategy
- Deployment and rollback procedures

**When to Use:**

- Starting a new feature
- Planning work before implementation
- Ensuring consistent quality across features

**Key Features:**

- TDD-first workflow requirement
- Race condition risk analysis
- Version field and optimistic locking checks
- Worker job timeout and idempotency requirements

---

### 2. bug-investigation.md (329 lines, 7.6 KB)

**Purpose:** Systematic debugging workflow and root cause analysis

**Key Sections:**

- Initial triage and reproduction steps
- 4-phase systematic debugging framework
  1. Observe & Isolate
  2. Instrument & Trace
  3. Hypothesize & Test
  4. Implement & Verify
- Anti-pattern investigation checklist
- Code review and instrumentation guidance
- Fix implementation with test-first approach
- Similar issue search and prevention measures
- Post-mortem and learning documentation

**When to Use:**

- Investigating production bugs
- Fixing test failures
- Understanding unexpected behavior
- Preventing bug recurrence

**Key Features:**

- Trace backward from error to root cause
- 24 anti-patterns checklist for diagnosis
- Hypothesis-driven investigation
- Post-fix similar issue scanning

---

### 3. code-review-request.md (396 lines, 9.9 KB)

**Purpose:** Comprehensive PR review checklist and quality assurance

**Key Sections:**

- PR overview and scope summary
- Pre-review quality gate verification
  - ESLint, TypeScript, tests, documentation
  - Anti-pattern compliance checks
- Architecture & design review
- Performance considerations
- Backwards compatibility verification
- Security review checklist
- Deployment readiness assessment
- Testing depth analysis
- Manual testing scenarios
- CI/CD status tracking
- Post-merge monitoring

**When to Use:**

- Submitting code for review
- Reviewing others' code
- Ensuring merge readiness
- Preventing production issues

**Key Features:**

- 24 anti-pattern mandatory checks
- Pre-merge verification
- Deployment monitoring after merge
- Performance regression detection

---

### 4. refactoring-plan.md (575 lines, 13 KB)

**Purpose:** Safe, incremental refactoring with quality assurance

**Key Sections:**

- Problem statement and scope definition
- Risk assessment with mitigation strategies
- Three refactoring approaches
- Detailed 4-phase implementation plan
  1. Extract & Isolate
  2. Refactor & Improve
  3. Integrate & Test
  4. Cleanup & Polish
- Before/after code examples
- Comprehensive testing strategy
- Performance validation framework
- Rollback procedures and go/no-go criteria
- Anti-pattern prevention in refactoring
- Timeline and monitoring

**When to Use:**

- Reducing technical debt
- Improving code quality
- Simplifying complex logic
- Preparing for feature work
- Optimizing performance

**Key Features:**

- Incremental approach by default (lower risk)
- Baseline test coverage before changes
- Performance metrics tracking
- Comprehensive rollback plan

---

## Usage Patterns for Solo Developer

### Feature Planning

- Use `feature-implementation.md` template
- Check CAPABILITIES.md and ANTI_PATTERNS.md
- Design with anti-patterns in mind
- Create detailed acceptance criteria

### Implementation

- TDD: Write tests first
- Follow template's implementation checklist
- Run `/test-smart` after each change
- Use `/fix-auto` for linting issues

### Bug Fixing

- Use `bug-investigation.md` for systematic analysis
- Follow the 4-phase debugging framework
- Create tests that fail before fix
- Document root cause and prevention measures

### Code Review

- Use `code-review-request.md` checklist
- Run all quality gates before submitting
- Self-review against anti-patterns
- Write clear PR description

### Refactoring Work

- Use `refactoring-plan.md` template
- Start with incremental approach
- Establish baseline tests
- Monitor performance changes

---

## Key Integration Points

### With CLAUDE.md

- All templates reference quality-first methodology
- Enforce mandatory TDD workflow
- Include anti-pattern prevention checklists
- Require CHANGELOG.md and DECISIONS.md updates

### With CAPABILITIES.md

- Templates prompt to check for existing solutions
- Reference specific project tools and agents
- Link to relevant cheatsheets

### With ANTI_PATTERNS.md

- Each template includes 24-pattern checklist
- Race condition risk assessment
- Data integrity validation requirements
- Worker/queue safety checks

### With Superpowers Skills

- /superpowers:brainstorm suggested for design phase
- /superpowers:test-driven-development activated during implementation
- /superpowers:systematic-debugging referenced in bug-investigation
- /superpowers:verification-before-completion required before merge

---

## Quality Checkpoints Enforced

### Pre-Implementation

- Check CAPABILITIES.md for existing solutions
- Review ANTI_PATTERNS.md relevant patterns
- Design with anti-patterns in mind
- Write acceptance criteria and test cases first

### During Implementation

- Test-driven development (tests first)
- Run `/test-smart` after each change
- TypeScript strict mode compliance
- ESLint passing continuously
- No anti-pattern violations

### Pre-Review/Merge

- All tests passing (npm test)
- Type checking clean (npm run check)
- Linting clean (npm run lint)
- Code review checklist completed
- /deploy-check successful
- Documentation updated

### Post-Merge Monitoring

- Error rates monitored
- Performance metrics tracked
- Feature flag behavior verified
- No new support tickets

---

## Template Statistics

| Template                  | Lines | Size   | Sections | Checklists |
| ------------------------- | ----- | ------ | -------- | ---------- |
| feature-implementation.md | 208   | 5.5 KB | 8        | 12         |
| bug-investigation.md      | 329   | 7.6 KB | 11       | 15         |
| code-review-request.md    | 396   | 9.9 KB | 18       | 18         |
| refactoring-plan.md       | 575   | 13 KB  | 16       | 20         |
| Total                     | 1508  | 36 KB  | 53       | 65         |

---

## Quick Start Examples

### Starting a New Feature

1. Copy `feature-implementation.md`
2. Fill in "Feature Name" and "Problem Statement"
3. Write user stories and acceptance criteria
4. Complete "Before Coding" section
5. Design database schema if needed
6. Begin implementation with TDD

### Investigating a Bug

1. Copy `bug-investigation.md`
2. Fill in reproduction steps
3. Work through Phase 1-4 of debugging framework
4. Create failing test
5. Fix root cause
6. Verify no regressions
7. Search for similar issues

### Submitting Code for Review

1. Copy `code-review-request.md`
2. Complete pre-review checklist
3. Run all quality gates
4. Fill in PR description
5. Note any limitations or design decisions
6. Submit with confidence

### Planning Safe Refactoring

1. Copy `refactoring-plan.md`
2. Document current state issues
3. Choose refactoring approach
4. Establish test baselines
5. Plan in phases
6. Execute with monitoring

---

## For Team Collaboration

When sharing work with other developers:

1. **Reference Template Location:**
   - "I used the feature-implementation template from `/prompts`"

2. **Share Filled Template:**
   - Include completed template in PR description or handoff doc
   - Shows planning rigor and reduces context switching

3. **Consistency Across Team:**
   - All team members use same templates
   - Reduces context-switching cost
   - Ensures quality standards met
   - Facilitates code reviews

---

## Related Documentation

- **CLAUDE.md** - Project overview and commands
- **CAPABILITIES.md** - Complete capability inventory
- **ANTI_PATTERNS.md** - 24 identified anti-patterns with fixes
- **DECISIONS.md** - Architectural decisions and rationale
- **cheatsheets/** - Detailed implementation guides

---

**Status:** Active - Solo developer optimized **Version:** 1.0 (Production
Ready)
