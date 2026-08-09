---
status: ACTIVE
audience: agents
last_updated: 2026-08-09
owner: Developer Experience
review_cadence: P90D
categories: [ai-automation, orchestration, design]
keywords: [sol-advisor, agents, routing, ledger, approval, recovery]
---

# Sol Advisor Orchestration Control Plane Design

Date: 2026-08-09 Status: Approved by user Target: Sol Advisor plugin after
v0.5.0 Scope: orchestration configuration, roster approval, routing, execution
control, evidence, recovery, and verification

## Summary

Sol Advisor will evolve from three static role bindings into a user-approved,
quality-first orchestration control plane. The primary session converts an
approved plan into an editable roster manifest. Each roster slot exposes its
role, exact model, reasoning effort, skills, ownership, execution topology,
assurance tier, authority and effects class, runtime envelope, and acceptance
policy.

The user approves the initial roster and autonomy envelope. The primary may then
make reversible execution refinements within those boundaries, including
resequencing work, adjusting concurrency, activating preapproved conditional
slots, and issuing same-lane corrections. Any material change to scope,
ownership, permissions, skills, model ceiling, authority, effects, or resource
envelope returns as a consolidated delta for approval.

Specialists cannot spawn subagents. The primary owns every dispatch, correction,
checker, state transition, and acceptance decision. Optional Luna pair-checkers
are visible sibling roster entries, not hidden nested agents. Script-directed
fan-out is available for embarrassingly parallel work, but execution scale
remains independent from assurance level.

## Problem

Sol Advisor v0.5.0 has three configured native roles:

- routine implementation;
- high-complexity implementation;
- read-only advisor.

This is insufficient for plan-derived specialist teams. It also leaves several
control-plane responsibilities implicit:

- role specialization is coarse and static;
- skill selection is not part of the approved roster contract;
- model and effort choices are not visible per task;
- routine versus high routing combines task type, risk, and cost in one
  decision;
- worker correction has no durable convergence state;
- evidence provenance is described but not enforced by schema;
- batch fan-out would overwhelm the primary context if every result re-entered
  it;
- run recovery is not represented as a resumable dependency graph;
- user approval boundaries are not encoded as machine-checkable policy;
- free-form effort strings allow invalid casing such as `Max` and `xHigh` to
  reach generated Codex profiles.

## Goals

1. Prefer higher output quality while avoiding clearly unnecessary model or
   review cost.
2. Give the user one editable initial roster with exact model and effort
   visibility.
3. Permit ad hoc specialists composed from installed base roles, task contracts,
   and approved skills.
4. Keep all orchestration centralized in the primary session.
5. Allow automatic corrections when role, model, effort, skills, ownership,
   scope, effects, and acceptance obligations remain unchanged.
6. Separate execution topology, assurance, model assignment, runtime policy,
   acceptance, and authority into independent axes.
7. Support script-directed fan-out without loading unbounded raw results into
   primary context.
8. Make convergence, retries, circuit breaking, provenance, and state
   transitions deterministic.
9. Resume interrupted runs from the smallest invalid dependency subgraph without
   double-applying side effects.
10. Fail closed when required models, efforts, roles, skills, isolation,
    evidence, or host capabilities are unavailable.

## Non-goals

- Specialists do not create their own subagents.
- The plugin does not silently substitute models, roles, effort levels, or
  skills.
- The plugin does not invent retry counts, timeouts, budgets, concurrency
  limits, or other numeric policy.
- The plugin does not store narrative session journals in the repository.
- The plugin does not treat model disagreement as authority; models propose
  findings, while the controller applies policy.
- Fan-out does not imply lower assurance.
- Model diversity is not claimed when the host cannot prove it.
- Prompt-only hosts do not gain false enforcement guarantees.

## Design principles

### User control with bounded autonomy

The user approves a roster and an autonomy envelope, not every implementation
detail. Within that envelope, the primary may:

- reorder independent nodes;
- adjust concurrency within an approved resource policy;
- activate a predeclared conditional roster slot;
- create another runtime instance of an already-approved slot when ownership,
  permissions, model, effort, skills, effects, and budget remain identical;
- issue corrections to the same slot for the same acceptance criteria.

The primary must request a consolidated delta approval when a change affects:

- objective or acceptance criteria;
- files, modules, systems, or data ownership;
- role, model, effort, required skill, or tool capability;
- permissions, sandbox expectation, external side effect, or authority class;
- assurance tier or reviewer-independence requirement;
- approved runtime or cost envelope;
- substitution of any roster slot.

Safe unaffected nodes may continue while a delta awaits approval when their
inputs, outputs, ownership, and dependencies do not intersect the changed
boundary.

### Quality-first, evidence-scaled routing

Quality remains the default. Lower-cost routing is allowed only when hard policy
rules classify the work as unambiguously bounded and low risk. Every roster
entry contains a human-readable routing rationale. A model judgment may propose
a route, but the controller validates that route against the approved policy
matrix.

### Positive convergence

Execution continues while objective-relevant blocking findings remain
unresolved, evidence is materially improving, and the approved resource envelope
remains open. Execution completes when the contract is proven. Non-blocking
findings remain in the ledger but do not prolong work. The controller opens the
circuit when progress stops, work oscillates, verification regresses, a boundary
changes, or an authorized budget is exhausted.

## Six-axis policy matrix

Triage produces six independent policy dimensions for every node.

### Axis 1: execution topology

- `direct`: the primary performs trivial or read-only work and proves it inline;
- `model_directed`: one approved specialist receives a complete task packet;
- `script_fanout`: a deterministic controller emits shard packets and aggregates
  results outside primary context.

Topology describes where work runs and where raw results live. It does not
determine trust or proof requirements.

### Axis 2: assurance

| Tier | Name        | Evidence obligation                                                                                                                        |
| ---- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| A0   | Basic       | Primary inline proof or deterministic tool evidence; no independent model review.                                                          |
| A1   | Standard    | Producer output plus primary validation of acceptance-critical evidence.                                                                   |
| A2   | Guarded     | Independent risk-targeted checker; model diversity recommended when available and approved.                                                |
| A3   | Adversarial | Blind worker/refuter validation with required model-family diversity. Unavailable diversity blocks A3 or requires an approved tier change. |

A Luna sibling checker is the lightweight A2 pattern. A3 may use independent
worker and refuter sets. Convergence means no unresolved objective-relevant
blocking finding and satisfied evidence obligations, not unanimous model
agreement.

### Axis 3: assignments

Each slot declares:

- installed base role;
- ad hoc specialty contract;
- exact client-native model ID;
- canonical reasoning effort;
- baseline skills;
- action-specific skills;
- reviewer lineage and independence requirements.

The roster exposes these values for user modification before approval.

### Axis 4: runtime envelope

Every node declares:

- runtime ceiling;
- authority source for that ceiling;
- retry or correction budget, when one exists;
- authority source for each numeric value;
- timeout action;
- resource and concurrency bounds;
- cancellation, checkpoint, and recovery behavior.

Numeric values must come from the user, project policy, host contract, tool
contract, or measured evidence. The controller does not create defaults by
intuition.

### Axis 5: acceptance

Acceptance policy specifies:

- acceptance-critical claims;
- required checks and artifacts;
- provenance coverage;
- independent-validation obligations;
- primary context-admission rules;
- reviewer topology;
- completion and residual-risk rules.

Evidence obligations scale by A-tier. The primary remains the sole acceptor, but
acceptance need not require another expensive inference pass. It may validate
durable deterministic evidence when policy permits.

### Axis 6: authority and effects

| Class | Name              | Meaning                                                                                | Batch policy                                                            |
| ----- | ----------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| E0    | Observe           | No mutation.                                                                           | Batchable within approved resources.                                    |
| E1    | Local reversible  | Isolated, disjoint workspace or artifact changes.                                      | Batchable with ownership proof.                                         |
| E2    | Shared controlled | Idempotent or compensatable persistent effects.                                        | Conditionally batchable under explicit concurrency and recovery policy. |
| E3    | Consequential     | External or shared effects with material blast radius.                                 | Serial execution and separate delta approval.                           |
| E4    | Protected         | Irreversible, destructive, credential, legal, financial, or security-sensitive action. | Never batched; action-time confirmation or handoff.                     |

Batchability is derived from E-class, dependency coupling, idempotency,
ownership, and host capability. It is not derived from the numeric class alone.
Eligible E0-E2 boundary changes may appear in one consolidated delta approval.
E3 and E4 changes remain isolated.

## Roster manifest

The approved roster is a versioned execution contract.

### Run envelope

The run-level record contains:

- schema version;
- run identity;
- plan identity, version, objective, and content hash;
- canonical workspace and base revision;
- approval status, manifest hash, approver, and timestamp;
- editable policy defaults;
- autonomy envelope;
- compatibility and capability evidence from the host.

### Roster slot

Each active or conditional slot contains:

```text
identity
  slot_id
  activation: active | conditional
  installed_base_role
  ad_hoc_specialty

task
  objective
  ownership
  interfaces
  constraints
  dependencies
  acceptance_criteria

routing
  topology
  assurance_tier
  authority_effects_class
  rationale

model_binding
  exact_model_id
  canonical_effort
  selection_source
  host_validation_evidence

skills[]
  name
  source
  version_or_hash
  policy: baseline | action
  required

runtime
  ceiling
  ceiling_source
  correction_budget
  budget_source
  timeout_outcome

activation_policy
  predicate
  autonomy_bounds
  replacement_policy
```

Every specialist packet explicitly forbids nested delegation. The primary alone
activates slots, instantiates workers, adds checkers, and dispatches
corrections.

### Skill binding

Baseline skills are attached by the proposed specialty. For example, a
bug-fixing specialist may receive systematic debugging, while a test specialist
may receive test-driven development. Action-specific skills are attached only to
the task packet that needs them.

The roster exposes every skill before approval. A worker must read each required
skill before taking task action. Missing, unreadable, incompatible, or
unavailable required skills fail the lane. Skills cannot authorize broader scope
or delegation than the approved roster.

### Controller-derived fields

The controller derives, validates, and records:

- canonical node hash;
- batchability decision and reason;
- materialized evidence obligation;
- reviewer topology;
- idempotency scope;
- approval delta classification;
- dependency closure;
- current state version.

Derived safety fields are not directly editable. A user changes their source
policy, then reviews the recomputed manifest preview.

## Script-directed fan-out

Fan-out is selected for repeated, independent transformations with a
deterministic partitioning and reduction contract.

The controller creates a stable shard manifest. Each manifest entry contains a
shard identity, input identity, ownership boundary, operation, operation
version, expected output schema, and idempotency scope. Workers receive bounded
packets. Per-item output, failure, evidence, and effect receipts remain in the
ledger runtime.

The reducer returns only:

- bounded aggregate results;
- completion and failure counts;
- acceptance-claim coverage;
- exception references;
- artifact and evidence manifests;
- unresolved blocking findings.

The primary context does not receive every raw item by default. Summary bounds
must come from approved policy. Full artifacts remain available by reference for
targeted inspection.

## Reviewer independence

Independence is structured lineage, not a Boolean flag. The ledger records:

- validator identity and role;
- model ID, model family, and provider when observable;
- task, prompt, and context lineage;
- whether worker output or only source artifacts were visible;
- artifact and evidence lineage;
- thread relationship;
- review method;
- resulting findings and verdict.

A2 recommends model-family diversity when it is available and approved. A3
requires blind model-diverse review. If the host cannot provide or prove the
configured independence, the controller blocks A3 and requests an approved
policy change; it does not silently weaken the tier.

## Deterministic convergence controller

Models may propose structured findings. They do not own retry counters, budgets,
fingerprints, circuit state, or acceptance transitions.

The controller computes a versioned finding fingerprint from:

- criterion identity and version;
- artifact identity and hash;
- normalized location;
- failure type.

The ledger tracks finding states such as open, resolved, reopened, and
superseded. Repeated fingerprints indicate stasis. Alternating fingerprints at
the same criterion and location indicate oscillation. A correction remains
automatic only while its slot, task, ownership, model, effort, skills, effects,
acceptance criteria, and resource envelope remain approved.

The circuit state is:

```text
CLOSED -> OPEN -> HALF_OPEN -> CLOSED | OPEN
```

`OPEN` prevents broad redispatch. `HALF_OPEN` permits the minimal authorized
probe set. Successful, independently validated probe evidence closes the
circuit. Repeated or new blocking failure reopens it. Probe size and budgets
come from approved policy rather than hard-coded counts.

## Runtime state machine

### Happy path

```text
PENDING
  -> READY
  -> RUNNING
  -> OUTPUT_RECORDED
  -> VALIDATING
  -> ACCEPTED
```

### Correction path

```text
VALIDATING
  -> CORRECTION_READY
  -> RUNNING
  -> OUTPUT_RECORDED
  -> VALIDATING
```

The controller may repeat this path only while findings materially change and
the approved envelope remains open.

### Crash and uncertainty path

```text
RUNNING
  -> INTERRUPTED_UNCERTAIN
  -> RECONCILING
  -> READY | HALF_OPEN | APPROVAL_PAUSED | HALTED
```

### Drift path

An accepted node becomes `STALE` when its plan, roster, workspace, dependency,
skill, model capability, input, or artifact hash changes. The controller
invalidates the affected dependency closure, preserves unrelated verified nodes,
and resumes from the earliest dirty or unaccepted node.

### Approval path

A boundary change moves affected active nodes to `APPROVAL_PAUSED`. Safe
independent nodes may continue. The controller presents one eligible
consolidated delta while keeping E3 and E4 approvals isolated.

## Controller transactions

Only the controller changes durable state. Every transition performs these
steps:

1. Compare expected run, roster, node, and state versions.
2. Validate the transition table, approved packet hash, dependencies, A-tier,
   E-class, and authorized budgets.
3. Atomically claim the dispatch or idempotency key.
4. Append an immutable event with prior state, next state, actor, reason,
   evidence, fingerprint, and receipts.
5. Update the materialized node snapshot using optimistic locking.
6. Dispatch work only after durable commit.

Duplicate delivery resolves through the claimed key. Concurrent state updates
fail the version check and must reload current state before proposing another
transition.

The persistence implementation sits behind a `RunStore` boundary. It must
support transactions, unique idempotency constraints, immutable events,
optimistic versions, and durable recovery. The design does not require an
external database dependency.

## Ledger, provenance, and idempotency

The runtime ledger stores:

- plan and roster versions;
- node states and state versions;
- canonical task packets;
- input, artifact, diff, and dependency hashes;
- producer reports;
- validator evidence and independence lineage;
- findings and fingerprints;
- approval records;
- dispatch and correction records;
- effect receipts;
- idempotency claims;
- timeout, stop, and recovery reasons.

The idempotency key is derived from run identity, plan version, node identity,
shard manifest entry, operation, and operation version. The controller claims it
atomically before an effect. The receipt records completion state and output
identity.

Before replaying a dirty side-effecting node, the controller checks its receipt,
E-class, idempotency contract, and completion certainty. Uncertain or
non-idempotent work requires reconciliation, compensation, explicit delta
approval, or user handoff. It is never retried merely because the prior worker
disappeared.

## Data flow

1. The primary converts an approved plan into a proposed roster manifest.
2. The user edits and approves the manifest and autonomy envelope.
3. The controller validates host capabilities and compiles a versioned DAG.
4. Ready nodes are selected by dependencies, batchability, and authorized
   resources.
5. Model-directed nodes receive one complete task packet; fan-out nodes receive
   shard packets from a stable manifest.
6. Workers write artifacts, reports, and receipts to the ledger runtime.
7. Validators record evidence, lineage, and finding fingerprints.
8. The reducer returns a bounded summary and exception channel.
9. The primary accepts a node only after its A-tier obligation is satisfied.
10. The controller checkpoints accepted state and activates newly ready nodes.

## Fail-closed behavior

Dispatch is refused when any required condition is missing or invalid,
including:

- approved manifest or matching packet hash;
- installed role;
- required skill;
- exact model ID;
- canonical effort token;
- runtime authority source;
- ownership boundary;
- dependency evidence;
- reviewer obligation;
- required model diversity;
- sandbox or host capability;
- idempotency or recovery contract for side effects.

The plugin does not normalize, substitute, lower assurance, broaden permissions,
or retry invisibly.

## Configuration migration and effort casing

The configuration schema advances from v1 to a new version that validates
client-native effort vocabularies. Current v1 free-form strings allowed values
such as `Max` and `xHigh`, while Codex native role files require canonical
lowercase values.

Fresh Codex profiles accept only canonical tokens reported or supported by the
Codex adapter. Unsupported casing fails configuration preview before any file is
installed.

Existing v1 profiles do not change silently. Migration must either:

1. present an explicit preview showing each legacy value and proposed canonical
   value, then apply only after user confirmation; or
2. mark the profile stale and require reconfiguration when a correction cannot
   be proven safely.

Generated files and managed-file hashes update in the same confirmed adapter
transaction. A manual edit cannot leave saved preferences, rendered files, and
managed hashes disagreeing without validation reporting the mismatch.

## Verification strategy

### Pure contract tests

- schema parsing and unknown-field rejection;
- canonical manifest and node hashes;
- exact model and effort validation;
- A0-A3 evidence-policy materialization;
- E0-E4 batchability and approval classification;
- finding fingerprint canonicalization and versioning;
- exhaustive state-transition table;
- delta classification and autonomy-envelope checks.

### Controller integration tests

- optimistic-lock conflicts;
- duplicate dispatch and duplicate effect delivery;
- atomic event, snapshot, claim, and receipt writes;
- correction, circuit-open, half-open, and probe paths;
- conditional-slot activation;
- consolidated and isolated approval deltas;
- missing roles, skills, models, efforts, and host capabilities;
- worker attempts to spawn nested agents;
- forged or incomplete independence metadata.

### End-to-end scenarios

- model-directed specialist with baseline and action skills;
- script fan-out with shard failure, bounded reduction, and exceptions;
- A2 Luna sibling checker;
- A3 blind model-diverse worker/refuter review;
- crash recovery and earliest-dirty-node resumption;
- E0-E2 consolidated approvals and E3-E4 isolated approvals;
- stale workspace and dependency invalidation;
- unavailable model diversity and approved tier change.

### Failure injection

Inject failures before and after each durable boundary:

- before claim;
- after claim;
- before effect;
- after effect;
- before receipt;
- after receipt;
- before event append;
- after event append but before snapshot;
- after snapshot but before dispatch.

Recovery must preserve unique effects, reconstruct state, and never claim
completion without required evidence.

### Required casing regression

Tests must prove that legacy `Max` and `xHigh` values cannot silently render
into Codex TOML. Fresh profiles accept canonical lowercase values. Migration is
previewed and confirmed or fails closed.

## Acceptance gates

- **Dispatch gate:** no worker starts without an approved manifest, exact
  bindings, required skills, ownership, runtime authority, and valid
  dependencies.
- **Acceptance gate:** no delegated node completes without its A-tier evidence
  and provenance coverage.
- **Recovery gate:** no dirty effect replays without receipt reconciliation and
  an idempotency, compensation, approval, or handoff path.
- **Context gate:** no fan-out pushes unbounded raw results into primary
  context.
- **Authority gate:** no ownership, permission, E-class, model ceiling, skill,
  scope, or resource expansion bypasses delta approval.
- **Completion gate:** execution stops when the objective is proven;
  non-blocking findings do not prolong work.

Performance and cost measurements inform future defaults. They are evidence, not
gates or policy, unless an authoritative user, project, platform, tool, or
measured contract makes them so.

## Rollout

1. Add the new logical schema and read-only migration preview.
2. Add roster rendering and validation without dispatch.
3. Add the deterministic controller and `RunStore` contract.
4. Add model-directed execution with A0 and A1 acceptance.
5. Add A2 sibling checking and automatic same-lane corrections.
6. Add script-directed fan-out and bounded reduction.
7. Add A3 adversarial review, model-diversity enforcement, and full recovery.
8. Enable the new workflow only after contract, integration, failure-injection,
   and migration tests pass.

Each rollout stage remains fail closed. Existing v0.5.0 compatibility roles
continue to work until the new adapter is explicitly configured and approved.

## Approved decisions

- Quality is preferred over speed, except when richer routing is unambiguously
  unnecessary.
- The user approves the initial roster and may edit model and effort per slot.
- Ad hoc specialists are allowed through base-role plus task-and-skill
  composition.
- Specialists cannot spawn subagents.
- Same-lane corrections are automatic within approved boundaries.
- Luna pair-checkers are visible primary-owned siblings, not nested workers.
- A record-keeper agent is rejected; the machine ledger provides the audit
  trail.
- Fan-out is an execution topology, not an assurance tier.
- Primary context receives bounded summaries rather than every fan-out result.
- Authority and effects use E0-E4 classes.
- Assurance uses A0 Basic, A1 Standard, A2 Guarded, and A3 Adversarial.
- Evidence obligations vary by assurance tier.
- The controller, not a model, owns convergence state and budgets.
- A3 requires model-diverse blind review; A2 recommends it when available.
- Reviewer independence is structured lineage metadata.
- The ledger is the idempotency-key and recovery source of truth.
- Consolidated delta approval remains the response to approval fatigue.
