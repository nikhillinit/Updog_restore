import { describe, expect, test } from 'vitest';

import {
  chooseModel,
  createRoutingPlan,
  isCliEntryPoint,
  parseArgs,
  resolveGate,
  runGate,
  scoreSpecialist,
} from '../../../orchestrate.js';

type FakeSpawnResult = { status: number };
type FakeSpawnCall = { bin: string; args: string[] };
function makeFakeRunner(status: number): {
  runner: (bin: string, args: string[]) => FakeSpawnResult;
  calls: FakeSpawnCall[];
} {
  const calls: FakeSpawnCall[] = [];
  return {
    calls,
    runner: (bin: string, args: string[]) => {
      calls.push({ bin, args });
      return { status };
    },
  };
}

const routing = {
  defaults: {
    research: 'claude',
    production: 'codex',
    distribution: 'claude',
  },
  longContextModel: 'kimi',
  longContextTriggers: ['full repo audit', 'repo-wide'],
  manualFlags: {
    '--claude': 'claude',
    '--codex': 'codex',
    '--kimi': 'kimi',
  },
  specialists: {
    'waterfall-specialist': {
      keywords: [
        { phrase: 'waterfall calculation', weight: 4 },
        { phrase: 'carry distribution', weight: 4 },
      ],
      risk: 'financial',
    },
    'xirr-fees-validator': {
      keywords: [
        { phrase: 'xirr calculation', weight: 4 },
        { phrase: 'management fees', weight: 3 },
      ],
      risk: 'financial',
    },
  },
  scoring: {
    minScoreToAssign: 3,
    tieBreaker: 'highest-risk-wins',
    riskOrder: ['financial', 'operational', 'quality'],
  },
  gates: {
    research: 'npm run doctor:quick',
    production: 'npm run check',
    'production-financial': 'npm run calc-gate',
    distribution: 'npm run lint',
  },
};

describe('Hermes routing helpers', () => {
  test('manual model flags override phase defaults', () => {
    const args = parseArgs(['--phase', 'research', '--task', 'implement new filter', '--kimi']);

    expect(args.manualModel).toBe('kimi');
    expect(chooseModel(args.task, args.phase, routing, args.manualModel)).toBe('kimi');
  });

  test('xirr production work routes to financial specialist and calc gate', () => {
    const specialist = scoreSpecialist(
      'fix xirr calculation with management fees',
      routing.specialists,
      routing.scoring
    );

    expect(specialist).toEqual({
      name: 'xirr-fees-validator',
      risk: 'financial',
      score: 7,
    });
    expect(resolveGate('production', specialist, routing.gates)).toBe('npm run calc-gate');
  });

  test('distribution phase summary does not false-positive to waterfall specialist', () => {
    const specialist = scoreSpecialist(
      'prepare distribution summary for PR',
      routing.specialists,
      routing.scoring
    );

    expect(specialist).toBeNull();
  });

  test('long-context triggers route to kimi when no manual override is present', () => {
    expect(chooseModel('full repo audit for agent routing', 'research', routing, null)).toBe(
      'kimi'
    );
  });

  test('createRoutingPlan combines model, specialist, risk, score, and gate', () => {
    const plan = createRoutingPlan({
      phase: 'production',
      task: 'fix xirr calculation with management fees',
      routing,
      manualModel: null,
    });

    expect(plan).toEqual({
      phase: 'production',
      task: 'fix xirr calculation with management fees',
      model: 'codex',
      specialist: 'xirr-fees-validator',
      risk: 'financial',
      score: 7,
      gate: 'npm run calc-gate',
    });
  });

  test('entrypoint guard distinguishes imports from direct CLI execution', () => {
    expect(isCliEntryPoint('file:///repo/orchestrate.js', ['node', '/repo/orchestrate.js'])).toBe(
      true
    );
    expect(
      isCliEntryPoint('file:///repo/orchestrate.js', ['node', '/repo/tests/importer.js'])
    ).toBe(false);
  });

  test('parseArgs recognises --skip-gates as a deliberate escape hatch', () => {
    const args = parseArgs(['--phase', 'production', '--task', 'unblock CI', '--skip-gates']);

    expect(args.skipGates).toBe(true);
    expect(args.phase).toBe('production');
  });

  test('runGate returns skipped=true when no command is configured', () => {
    const { runner, calls } = makeFakeRunner(0);
    const result = runGate(null, { runner, label: 'no-op' });

    expect(result.ok).toBe(true);
    expect(result.skipped).toBe(true);
    expect(calls).toHaveLength(0);
  });

  test('runGate splits "npm run check" into bin and args and reports success', () => {
    const { runner, calls } = makeFakeRunner(0);
    const result = runGate('npm run check', { runner, label: 'pre-gate' });

    expect(result.ok).toBe(true);
    expect(result.skipped).toBe(false);
    expect(result.code).toBe(0);
    expect(calls).toEqual([{ bin: 'npm', args: ['run', 'check'] }]);
  });

  test('runGate reports failure when the subprocess exits non-zero', () => {
    const { runner, calls } = makeFakeRunner(2);
    const result = runGate('npm run calc-gate', { runner, label: 'post-gate' });

    expect(result.ok).toBe(false);
    expect(result.code).toBe(2);
    expect(calls).toEqual([{ bin: 'npm', args: ['run', 'calc-gate'] }]);
  });
});
