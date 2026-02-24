# Phoenix / Wizard UI Scope Boundary Map

## Purpose

Prevents merge conflicts when engine validation and UX work proceed in parallel.
Each zone has an owner track. Files in the BRIDGE zone are LOCKED during
parallel work.

## Zone 1: Wizard UI (UX Track)

**Owner:** UX implementation

**Files:**

- `client/src/components/modeling-wizard/**` - wizard step components
- `client/src/machines/modeling-wizard.machine.ts` - XState wizard state machine
- `client/src/schemas/modeling-wizard.schemas.ts` - wizard Zod schemas
- `client/src/hooks/useModelingWizard.ts` - wizard hook
- `client/src/pages/` - page-level wizard integration

**Rules:**

- May modify wizard UI components, schemas, and state machine
- Must NOT import from engine boundary files directly
- Must NOT modify shared reserve/allocation schemas

## Zone 2: Engine (Validation Track)

**Owner:** Phoenix validation

**Files:**

- `server/services/monte-carlo-engine.ts` - MC engine with DI interface
- `server/services/monte-carlo-orchestrator.ts` - MC orchestration layer
- `client/src/core/capitalAllocation/**` - CA engine, adapter, truth case runner
- `shared/schemas/reserves-schemas.ts` - reserve type definitions
- `tests/unit/truth-cases/**` - truth case test files
- `tests/unit/engines/monte-carlo-orchestrator.test.ts` - MC orchestrator tests
- `tests/unit/services/monte-carlo-*.test.ts` - MC engine tests
- `docs/capital-allocation.truth-cases.json` - CA truth cases
- `docs/moic.truth-cases.json` - MOIC truth cases

**Rules:**

- May modify engine internals, truth cases, and test infrastructure
- Must NOT modify wizard UI components or wizard state machine
- Must NOT modify wizard schemas

## Zone 3: Bridge (LOCKED during parallel work)

**Owner:** Requires coordination between both tracks

**Files:**

- `client/src/lib/wizard-reserve-bridge.ts` (654 lines) - critical coupling
  point
  - `transformWizardToReserveRequest()` (line 370) - ZERO callers
  - `calculateEngineComparison()` (line 488) - ZERO callers
  - Imports from BOTH wizard schemas AND Phoenix/shared reserve schemas

**Lock Protocol:**

1. Before modifying bridge: create an issue/PR describing the change
2. Both tracks must review and approve bridge changes
3. Bridge changes should be merged to main before either track continues
4. If both tracks need bridge changes, create a coordination branch

## Zone 4: Shared Types (Careful Modification)

**Files:**

- `shared/schemas/reserves-schemas.ts` - reserve type definitions
- `shared/schemas/` - other shared schemas

**Rules:**

- Additive changes (new optional fields) are safe from either track
- Breaking changes (removed fields, type changes) require coordination
- Run both wizard and engine tests after any shared type change

## Conflict Prevention Checklist

- [ ] Both tracks start from same main branch commit
- [ ] Bridge file is not modified by either track independently
- [ ] Shared type changes are additive only
- [ ] Both tracks run full test suite before merging
