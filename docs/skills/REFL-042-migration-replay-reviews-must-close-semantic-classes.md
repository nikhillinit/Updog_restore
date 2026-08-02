---
type: reflection
id: REFL-042
title: Migration Replay Reviews Must Close Semantic Classes
status: VERIFIED
date: 2026-08-02
version: 1
severity: high
wizard_steps: []
error_codes:
  [
    ERR_MIGRATION_SEMANTIC_DRIFT,
    ERR_REVIEW_CLASS_NOT_CLOSED,
    ERR_PROOF_SCOPE_UNSTABLE,
  ]
components:
  [
    migrations,
    production-schema,
    postgresql,
    testing,
    code-review,
    orchestration,
  ]
keywords:
  [
    migration-replay,
    semantic-idempotency,
    catalog-drift,
    migration-ledger,
    adversarial-matrix,
    review-budget,
    materiality-gate,
    testcontainers,
  ]
test_file: null
superseded_by: null
---

# Reflection: Migration Replay Reviews Must Close Semantic Classes

**Scope:** Trust-spine issue #1272, migration 0047 implementation and review,
2026-08-02.

**Prime Directive:** Everyone acted reasonably with available requirements,
tests, and review findings. Each repair improved correctness. The failure was a
system design problem: neither the migration contract nor the review contract
required the first finding to expand into and close its whole semantic failure
class.

This reflection extends REFL-041. REFL-041 established that production
activation needs exact schema-provisioning proof. This incident exposed the next
boundary: a journaled migration must itself refuse semantically drifted catalog
state before its ledger entry commits. A production manifest cannot repair a
migration ledger that already certifies the wrong catalog.

## 1. What Happened

Migration 0047 added economics-linkage foreign keys and a `task_evidence_links`
catalog surface. The implementation correctly used the Drizzle-owned transaction
so PostgreSQL catalog changes and the migration-ledger insert shared one atomic
boundary. It also added real-PostgreSQL replay and rollback coverage.

Review still took almost three hours and ended with an unmerged correctness
defect:

1. Initial review found raw replay rejected later-valid failed-run pins and the
   production manifest trusted constraint names instead of definitions.
2. Later review found partial pre-existing tables could pass guarded DDL.
3. Later review generalized the problem to same-named but wrong columns,
   constraints, foreign-key actions, defaults, and sequence ownership.
4. Repairs added exact catalog comparisons and a table-driven PostgreSQL matrix
   for those specimens.
5. Final review found the same class still open for
   `idx_task_evidence_links_fund_task_id`: the index was excluded from exact
   preflight, while `CREATE INDEX IF NOT EXISTS` would silently retain a
   same-named index with the wrong table or keys.
6. The time budget was already breached. Work stopped without commit, push, or
   PR, with the residual risk reported explicitly.

The code became substantially safer, and verification was strong: focused unit
tests, real-PostgreSQL scenarios, production-clone tests, schema-drift tests,
policy checks, typecheck, lint, build, and the full suite all passed at the last
completed verification point. Those green results did not prove the
unrepresented index mutation. Coverage volume was not the missing control;
failure-class completeness was.

### What Went Well

- Transaction ownership was corrected early: Drizzle retained the only
  `BEGIN`/`COMMIT`, so failed migration work could not persist before ledger.
- Real PostgreSQL replaced mocks for catalog truth, lock behavior, replay, and
  rollback.
- Review findings were treated as correctness issues and repaired rather than
  dismissed because broad tests were green.
- The final unresolved index risk was reported plainly. Preserving the
  uncommitted worktree avoided converting review fatigue into an unsafe merge.

### What We Lacked

- One canonical inventory of every object owned by migration 0047.
- One reusable mutation factory covering the full catalog taxonomy.
- One reviewer accountable for closing the generalized failure class.
- A stable materiality threshold, review-cycle cap, and elapsed-time stop rule.
- Separation between stable deliverable preservation and volatile diagnostic
  capture.

The user's direct feedback was the clearest workflow signal: almost three hours
for one migration issue indicated process failure, not inherent issue
complexity. This reflection treats that feedback as data and preserves it as a
governance constraint.

## 2. Root Cause Analysis

### Five Whys: Codebase Implementation

1. **Why could migration 0047 ledger a wrong index?** Its preflight did not
   inspect that index, and `CREATE INDEX IF NOT EXISTS` treats name presence as
   sufficient.
2. **Why was the index excluded?** It was classified as replay-repairable rather
   than part of the migration's canonical owned catalog.
3. **Why was that classification unsafe?** Absence and semantic conflict were
   conflated. Guarded DDL can create an absent object, but it cannot prove that
   an existing same-named object is canonical.
4. **Why did tests not catch it?** Drift cases were added in response to review
   specimens rather than generated from a complete catalog-object taxonomy.
5. **Why did that happen?** The migration began with object-level guards, not
   one set-level replay invariant defining every owned object and every allowed
   pre-state.

**Systemic implementation cause:** SQL syntactic idempotency was mistaken for
semantic idempotency. `IF NOT EXISTS` prevents duplicate-object errors; it does
not establish catalog equivalence or justify a migration-ledger entry.

### Five Whys: Review Workflow

1. **Why were many fresh reviews needed?** Each pass reported one newly visible
   specimen of the same replay-drift class.
2. **Why did one finding not close the class?** Reviewers were not required to
   state the generalized failure class and complete closure criteria.
3. **Why did repairs remain incremental?** The implementer patched the reported
   object and requested another review instead of rerunning a shared adversarial
   matrix over every equivalent catalog object.
4. **Why did cost grow sharply?** Full-suite verification, container lifecycle,
   and broad snapshot comparison repeated during SQL-only repair loops.
5. **Why did the loop continue?** No review-cycle maximum, stable materiality
   threshold, time budget, or escalation rule existed.

**Systemic workflow cause:** Review optimized for fresh defect discovery, not
bounded proof of an acceptance contract. Every pass could expand scrutiny, but
no mechanism forced convergence.

### Contributing Systems

| Surface        | Contributing condition                              | Durable correction                                                   |
| -------------- | --------------------------------------------------- | -------------------------------------------------------------------- |
| Migration      | Object names used as existence evidence             | Compare semantic definitions for every owned catalog object          |
| Tests          | Cases added after individual findings               | Generate table-driven mutations from a catalog taxonomy              |
| Review         | Findings described specimens                        | First finding expands to complete equivalence class                  |
| Verification   | Full suite repeated during repair                   | Targeted proof during repair; broad proof once after final code      |
| Infrastructure | Colima repeatedly started and stopped               | Keep shared test infrastructure alive through one verification phase |
| Snapshots      | Ignored caches and runtime state entered comparison | Snapshot stable deliverables; exclude known volatile runtime paths   |
| Governance     | Review count and duration unbounded                 | Two-cycle maximum, materiality gate, 60-90 minute budget             |

## 3. Durable Codebase Principle

### Replay Invariant

Write this before migration SQL or tests:

> A migration may commit its ledger entry only when its owned catalog is wholly
> absent for first apply or exactly canonical for replay. Any mixed state or
> semantic drift must abort the same transaction, leaving both catalog and
> ledger unchanged.

Define **owned catalog** explicitly. Include every table, column, sequence,
constraint, index, and trigger introduced or relied upon by the migration.
Objects may be classified as replaceable only when the migration contract names
that exception, distinguishes absence from conflict, and proves the exact
postcondition before ledger commit. Omission is not an implicit repair policy.

For each owned object, distinguish three states:

1. **Absent:** allowed only as part of the declared first-apply state, or as an
   explicit replaceable-object case.
2. **Canonical:** allowed for replay.
3. **Conflicting:** same name, wrong parent, wrong kind, wrong definition, or
   unexpected extra object; always refuse unless an explicit safe replacement
   policy covers it.

### PostgreSQL Adversarial Matrix

Build the matrix before implementation. Every refusal case snapshots catalog and
migration ledger before execution, expects migration failure, then proves both
snapshots unchanged.

| Class              | Required mutations                                                                  |
| ------------------ | ----------------------------------------------------------------------------------- |
| Whole-state        | all absent; all canonical; every meaningful partial subset                          |
| Namespace/type     | same name on wrong relation; same name with wrong object kind                       |
| Columns            | missing/extra; type/UDT; nullability; length; identity/generated mode               |
| Defaults/sequences | missing/wrong default; wrong sequence; wrong ownership; wrong schema                |
| Keys/constraints   | column set/order; uniqueness; check semantics; unexpected extras                    |
| Foreign keys       | local keys/order; target table/keys; delete/update action; deferrability            |
| Indexes            | table; keys/order/direction; uniqueness; predicate; access method; included columns |
| Triggers           | table; timing; event set; row/statement level; function; enabled state              |
| Atomicity          | forced failure after partial DDL leaves catalog and ledger byte-equivalent          |

Use one reusable PostgreSQL drift-test factory. A case supplies canonical seed,
one mutation, expected disposition, and optional error pattern. The factory owns
database isolation, before/after catalog snapshots, ledger snapshots, migration
execution, and rollback assertions. Migration tests should declare mutation
data, not duplicate lifecycle and proof code.

### Acceptance Contract

Final migration review receives this binary contract:

- canonical first apply succeeds;
- canonical replay succeeds;
- every represented semantic drift refuses;
- any failed migration changes neither catalog nor ledger;
- targeted matrix passes;
- broad suite passes once after final code.

Green tests are sufficient only when the matrix maps every owned catalog object
to its relevant mutation classes.

## 4. Durable Review and Verification Protocol

### Bounded Review Flow

1. **Commitment review:** Before implementation, one reviewer states the replay
   invariant, owned-catalog inventory, adversarial matrix, acceptance contract,
   and material blockers.
2. **Implementation and self-review:** Implement all known variants in one
   batch. The implementer checks every matrix row before requesting final
   review.
3. **Comprehensive final review:** One fresh Sol reviewer evaluates the whole
   acceptance contract, not selected files or newly invented axes.
4. **Consolidated repair:** A `fix-first` finding must state:
   - generalized failure class;
   - all equivalent surfaces inspected;
   - complete closure criteria;
   - proof required for closure.
5. **Second final review:** Allowed after the consolidated repair or for a
   genuinely new material failure class.
6. **Closure audit:** A third material finding does not start another specimen
   loop. The reviewer leads one class-wide closure audit, then the run stops or
   reports the remaining risk.

**Operational rule:** First review finding triggers "expand to the whole
equivalence class."

### Materiality Gate

Final review blocks only:

- correctness;
- security;
- data integrity;
- scope violation;
- missing proof required by the acceptance contract.

Style preferences, helper duplication, optional test organization, and
non-blocking maintainability improvements become follow-up work. Review axes do
not expand after commitment review unless new evidence exposes a genuinely new
material class.

### Verification Economics

- During repair, run the smallest targeted test set that proves the changed
  matrix rows.
- Keep PostgreSQL/Testcontainers infrastructure alive until repair verification
  finishes; clean it up once.
- Run typecheck/lint when affected surfaces require them.
- Run full suite and build once, after final code reaches the acceptance
  contract. Repeat only when broad verification itself exposes a material
  failure.
- Use a 60-90 minute execution budget. At breach, stop expanding scope and
  report verified state, unverified boundaries, and explicit residual risk.

### Stable Snapshot Scope

Preservation snapshots should compare stable deliverables and declared external
artifacts. Exclude known volatile runtime surfaces such as dependency caches,
`.npm-cache`, `.omx`, `.remember`, container state, transient logs, and
generated runtime metadata unless one is explicitly under review. A comparison
that is known to include unrelated volatile state is not a useful completion
gate.

Use two profiles when both needs exist:

1. **Preservation profile:** user-owned tracked/untracked deliverables and
   explicitly named external artifacts.
2. **Diagnostic profile:** caches/runtime state captured for investigation but
   excluded from the preservation pass/fail decision.

## 5. Start, Stop, Continue

### Start

- State migration replay as set-level catalog equivalence before writing DDL.
- Inventory all owned columns, constraints, sequences, indexes, and triggers.
- Generate drift tests from the same inventory used by migration/reconciliation
  code.
- Require reviewers to return failure class plus closure criteria.
- Track elapsed time and review-cycle count as explicit run state.

### Stop

- Treating `IF NOT EXISTS` as proof that an existing object is correct.
- Patching one reported schema specimen without testing its equivalence class.
- Starting a fresh reviewer with a new axis after every repair.
- Rerunning full suite/build after each SQL-only edit.
- Restarting container infrastructure between related repair checks.
- Failing stable-deliverable comparison on known cache/runtime churn.

### Continue

- Keep migration DDL and ledger write in one PostgreSQL transaction.
- Fail closed on partial or semantically drifted catalog state.
- Use real PostgreSQL for catalog and rollback truth.
- Preserve uncommitted work and report proof gaps honestly when budget expires.
- Keep final review independent and materiality-gated.

## 6. Previous Actions Review

REFL-041 closed `2/3` actions. Governed promotion and authenticated production
smoke landed; exact schema-reconcile authorization remained open. This run did
not regress the completed activation controls, but it confirmed that exact
schema proof must extend backward into migration replay itself. Production
reconciliation cannot compensate for a ledgered noncanonical catalog.

No previous action defined a review-cycle cap, materiality threshold, or
stable-snapshot profile. Those are new systemic gaps rather than missed
commitments.

## 7. SMART Actions

| Action                                                                                                                                             | Owner                  | Due                                                                 | Binary success measure                                                                                                                                                    | Status |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Close migration 0047's complete owned-catalog class, including index and trigger policy, through a reusable table-driven PostgreSQL drift factory. | Schema/migration owner | Before issue #1272 can commit or open a PR                          | First apply and canonical replay pass; column, constraint, default, sequence, index, and trigger mutations refuse; every refusal preserves catalog and ledger.            | OPEN   |
| Add the bounded review protocol and materiality/time gates to the next Sol-governed migration handoff or standing workflow surface.                | Workflow owner         | Before the next migration implementation begins                     | Handoff records one commitment review, one comprehensive final review, at most two final-review cycles, class-wide closure on a third finding, and a 60-90 minute budget. | OPEN   |
| Split preservation snapshots from volatile diagnostic capture.                                                                                     | Tooling owner          | Before the next cross-worktree or external-artifact completion gate | Stable comparison excludes declared runtime/cache paths; diagnostic capture remains available; unchanged deliverables compare clean despite runtime churn.                | OPEN   |

**Follow-up:** Review these actions at the next schema-backed migration
commitment gate. Target completion is `3/3` before declaring this pattern
closed. If fewer than `3/3` complete, carry only blockers that still address the
root causes; do not add more actions.

## 8. Evidence and Proof Limits

- Migration 0047's Drizzle-owned transaction correctly keeps DDL and ledger
  atomic; the issue was catalog acceptance, not transaction ownership.
- Real-PostgreSQL tests already cover canonical apply/replay, many partial and
  same-name drift cases, and catalog/ledger rollback.
- Final review identified the unrepresented index case at
  `migrations/0047_internal_economics_linkage.sql` near the guarded
  `CREATE INDEX IF NOT EXISTS` statement.
- The implementation worktree remained uncommitted and unpushed when the budget
  gate stopped execution.
- This reflection records the verified failure pattern and future contract. It
  does not claim issue #1272 is ready to merge; SMART action 1 remains open.
- Related: REFL-040 (controlled cross-worktree experiments), REFL-041
  (production schema proof before activation).
