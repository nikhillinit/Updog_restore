---
status: ACTIVE
last_updated: 2026-01-19
---

# 🛠 ForEach Error Fix Implementation Guide

> All examples use POSIX-style paths for cross-platform scripting.

---

## 1. Add the Safe Array Utilities

**File:** `src/utils/array-safety.ts`  
Copy in the contents from `array-safety.ts` (see code snippet above).

---

## 2. Apply ESLint Enforcement

**File:** `.eslintrc.json`  
Merge in the `no-restricted-syntax` rule to block native `forEach` and cite the helper.

---

## 3. Refactor Code to Use Safe Helpers

1. **Cohort Engine**  
   ```ts
   // src/engines/enhanced-cohort-engine.ts
import { safeArray } from '@/utils/array-safety';

buildDefaultGraduationMatrix(): GraduationMatrix {
  const stages = this.stages ?? [];
  // Use safeArray to guard against undefined/null
  safeArray(stages).forEach((stage, idx) => {
    const matrix: Record<string, any> = {};
    matrix[stage] = {};

    if (idx < stages.length - 1) {
      const nextStage = stages[idx + 1];
      matrix[stage][nextStage] = this.parameters?.graduationRates?.[stage] ?? 0;
    }

    matrix[stage].exit = this.parameters?.exitProbabilities?.[stage] ?? 0;

    const totalProb = Object.values(matrix[stage]).reduce(
      (sum, p) => sum + (typeof p === 'number' ? p : 0),
      0
    );
    matrix[stage].writeOff = Math.max(0, 1 - totalProb);

    // attach into the result object
    result[stage] = matrix[stage];
  });

  return result;
}
2. Enhanced Fund Model

    ```ts
    // src/models/enhanced-fund-model.ts
import { safeArray, forEach } from '@/utils/array-safety';

calculateMetrics(): void {
  // Ensure investments is always an array
  const investments = safeArray(this.investments);
  // Safely iterate with forEach helper
  forEach(investments, investment => {
    // … process each investment …
  });

  // Example for cohorts as well
  const cohorts = safeArray(this.cohorts);
  forEach(cohorts, cohort => {
    // … process each cohort …
  });
}