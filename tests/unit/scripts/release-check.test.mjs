import { describe, expect, it } from 'vitest';
import {
  buildReleaseCheckSteps,
  validateReleaseCheckMode,
} from '../../../scripts/release-check.mjs';
const names = (steps) => steps.map((step) => step.name);
describe('release check execution plan', () => {
  it('keeps full release proof complete by default', () => {
    const stepNames = names(
      buildReleaseCheckSteps({ skipDbProof: false, reuseCiGates: false })
    );
    expect(stepNames).toEqual(
      expect.arrayContaining([
        'TypeScript baseline',
        'Lint and guardrails',
        'Lean release client surface lock',
        'Cookie-session browser lifecycle',
        'GP decision spine (E2E)',
        'Lean release server and CI surface lock',
        'Cookie-auth runtime parity',
        'Fund lifecycle DB proof',
        'Migration drift guard',
        'Production schema clone proof',
        'Production partial-drift reconciliation proof',
        'Scenario release gate',
        'Core validation wrapper',
        'Production build',
        'Whitespace diff check',
        'Release-owned file tracking',
      ])
    );
  });
  it('reuses only upstream-proven generic gates in static CI mode', () => {
    const stepNames = names(
      buildReleaseCheckSteps({ skipDbProof: true, reuseCiGates: true })
    );
    expect(stepNames).toEqual([
      'Lean release client surface lock',
      'Cookie-session browser lifecycle',
      'GP decision spine (E2E)',
      'Lean release server and CI surface lock',
      'Cookie-auth runtime parity',
      'Whitespace diff check',
      'Release-owned file tracking',
    ]);
  });
  it('rejects reuse outside CI or without skip-db', () => {
    expect(() =>
      validateReleaseCheckMode({
        skipDbProof: false,
        reuseCiGates: true,
        ci: true,
      })
    ).toThrow('--reuse-ci-gates requires --skip-db');
    expect(() =>
      validateReleaseCheckMode({
        skipDbProof: true,
        reuseCiGates: true,
        ci: false,
      })
    ).toThrow('--reuse-ci-gates requires CI=true');
  });
});
