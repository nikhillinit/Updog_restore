# Action Scope Grammar

Every action belongs to exactly one scope. The scope must be unambiguous from
the label and placement. No two controls on a screen may share a visible label
with a different scope.

## Global / workspace actions

Affect the current workspace or selected fund. Live in the command header.
Examples: Search, Share with LPs, Create LP snapshot, Export dashboard, command
palette.

## Module actions

Affect only the active tab/module. Live in that module's header. Examples:
Refresh cashflow, Export cashflow, Filter performance, change cashflow forecast
horizon.

## Object actions

Affect one card, row, chart point, scenario, company, or task. Examples: View
proof, Create task, Assign owner, Open work panel.

## WorkPanel footer actions

Affect only the currently opened object. Examples: Save, Cancel, Approve,
Archive.

## Rules

- A control with no behavior is not an action. Do not render non-functional
  affordances (truth-first): wire it, disable it with an explicit unavailable
  state, or remove it.
- Every Export states what it exports (Export dashboard vs Export cashflow).
- Module state (e.g. cashflow forecast horizon) stays module-scoped unless
  explicitly lifted to global state with a single source of truth.

## Current state (2026-06-15)

- Global: Share with LPs (real). The former dashboard-level timeframe / Filter /
  Export were non-functional placeholders and were removed (PR 5).
- Cashflow module: timeframe (forecast horizon), Refresh cashflow, Export
  cashflow.
- A reusable ModuleToolbar primitive will be extracted when a second module
  needs one (deferred; YAGNI).
