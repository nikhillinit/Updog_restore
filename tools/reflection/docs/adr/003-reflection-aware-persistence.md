# ADR 003: Reflection-Aware Wizard Persistence

Date: 2026-01-18
Status: ACCEPTED

## Context

We need a reliable way to audit which verified logic rules (Reflections) were active or considered when a user completed a wizard step or when a model was run. This information is critical for debugging, ensuring compliance, and understanding the history of a financial model's calculations.

## Decision

1.  **Metadata Only:** The `WizardState` or any persisted model will include an `appliedReflections` array containing only the metadata of the reflections that were active.
2.  **Stable IDs:** We will store the stable, unique `id` of the reflection (e.g., `REFL-001`), **NOT** the filename. This decouples the application state from the documentation's file structure.
3.  **No Runtime I/O:** The application code will **NEVER** read markdown files at runtime to make decisions. The reflection system is for developer guidance and audit trails, not for dynamic logic execution.
4.  **Verification via Tests:** The logic described in a reflection is enforced by its corresponding **Regression Test**, which runs in CI. The test is the ultimate source of truth for behavior, not the markdown file.

## Schema

```typescript
// Example of what might be stored in the persisted state
interface AppliedReflection {
  id: string;        // "REFL-001"
  version: number;   // 2
  appliedAt: string; // ISO 8601 Timestamp
}

interface WizardStepState {
  stepId: number;
  data: Record<string, any>;
  appliedReflections: AppliedReflection[];
}
```

## Consequences

*   **Positive:** Renaming or reorganizing reflection documentation files will not break the application or corrupt historical state. The system is resilient to documentation changes.
*   **Positive:** The persisted state JSON acts as a permanent, auditable log of which logic versions and rules were in effect at the time of calculation. This is invaluable for financial modeling and compliance.
*   **Negative:** Developers MUST diligently maintain the Stable ID (`id`) and `version` in the frontmatter of each reflection file. The `manage_skills.py validate` script will enforce this.
*   **Neutral:** This decision reinforces the separation of concerns: documentation is for humans and audit, while code (and its tests) is for the machine.
