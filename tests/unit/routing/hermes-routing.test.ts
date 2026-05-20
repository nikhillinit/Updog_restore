import { describe, expect, test } from 'vitest';

import {
  chooseModel,
  createRoutingPlan,
  getGateRunPlan,
  isCliEntryPoint,
  main,
  parseArgs,
  resolveGate,
  runGate,
  scoreSpecialist,
} from '../../../orchestrate.js';

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

  test('parseArgs rejects the broad gate skip flag', () => {
    expect(() => parseArgs(['--task', 'fix gate', '--skip-gates'])).toThrow(
      'Use --skip-preflight-gate'
    );
  });

  test('parseArgs recognizes preflight gate skip reason', () => {
    const args = parseArgs([
      '--phase',
      'production',
      '--task',
      'fix xirr calculation',
      '--skip-preflight-gate',
      '--skip-reason',
      'repairing calc-gate',
    ]);

    expect(args.skipPreflightGate).toBe(true);
    expect(args.gateSkipReason).toBe('repairing calc-gate');
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

  test('createRoutingPlan includes preflight skip reason when requested', () => {
    const plan = createRoutingPlan({
      phase: 'research',
      task: 'repair doctor gate',
      routing,
      manualModel: null,
      skipPreflightGate: true,
      gateSkipReason: 'repairing doctor gate',
    });

    expect(plan.gateSkip).toEqual({
      preflight: true,
      reason: 'repairing doctor gate',
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

  test('runGate skips empty gate commands', () => {
    let calls = 0;

    const result = runGate('', {
      runner: () => {
        calls += 1;
        return { status: 0 };
      },
    });

    expect(result).toEqual({ command: null, skipped: true, status: 0 });
    expect(calls).toBe(0);
  });

  test('runGate parses npm script gates', () => {
    const calls: Array<{ bin: string; args: string[] }> = [];

    const result = runGate('npm run check', {
      runner: (bin, args) => {
        calls.push({ bin, args });
        return { status: 0 };
      },
    });

    expect(result).toEqual({ command: 'npm run check', skipped: false, status: 0 });
    expect(calls).toEqual([{ bin: 'npm', args: ['run', 'check'] }]);
  });

  test('runGate reports non-zero exits', () => {
    expect(() =>
      runGate('npm run check', {
        runner: () => ({ status: 2 }),
      })
    ).toThrow('Gate failed (npm run check) with exit code 2');
  });

  test('getGateRunPlan never skips financial production postflight gate', () => {
    expect(
      getGateRunPlan(
        {
          phase: 'production',
          risk: 'financial',
          gate: 'npm run calc-gate',
        },
        { skipPreflightGate: true }
      )
    ).toEqual({
      preflight: false,
      postflight: true,
    });
  });

  test('main warns when preflight gate is skipped', async () => {
    const stderr: string[] = [];
    const stdout: string[] = [];

    await main(
      [
        '--phase',
        'research',
        '--task',
        'trace reserve engine flow',
        '--skip-preflight-gate',
        '--skip-reason',
        'repairing doctor gate',
      ],
      {
        ...process.env,
        HERMES_MODEL_ROUTING_FILE: `${process.cwd()}/.claude/hermes/model-routing.json`,
        HERMES_DEV_BRAIN_FILE: `${process.cwd()}/DEV_BRAIN.md`,
        HERMES_SOUL_FILE: `${process.cwd()}/.claude/hermes/SOUL.md`,
      },
      {
        stdout: { write: (message: string) => stdout.push(message) },
        stderr: { write: (message: string) => stderr.push(message) },
      },
      {
        routing,
        brain: 'DEV_BRAIN',
        soul: 'SOUL',
        executeModel: async () => 1,
        gateRunner: () => ({ status: 0 }),
      }
    );

    expect(stdout.join('')).toBe('');
    expect(stderr.join('')).toContain(
      '[hermes] WARNING: skipping preflight gate "npm run doctor:quick"; reason: repairing doctor gate'
    );
  });

  test('main still runs financial postflight gate when preflight is skipped', async () => {
    const gateCalls: string[] = [];
    const code = await main(
      [
        '--phase',
        'production',
        '--task',
        'fix xirr calculation regression',
        '--skip-preflight-gate',
        '--skip-reason',
        'repairing calc-gate',
      ],
      process.env,
      {
        stdout: { write: () => undefined },
        stderr: { write: () => undefined },
      },
      {
        routing,
        brain: 'DEV_BRAIN',
        soul: 'SOUL',
        executeModel: async () => 1,
        gateRunner: (bin, args) => {
          gateCalls.push([bin, ...args].join(' '));
          return { status: 0 };
        },
      }
    );

    expect(code).toBe(1);
    expect(gateCalls).toEqual(['npm run calc-gate']);
  });

  test('main returns preflight gate status without executing model', async () => {
    let modelCalls = 0;
    const code = await main(
      ['--phase', 'research', '--task', 'trace reserve engine flow'],
      process.env,
      {
        stdout: { write: () => undefined },
        stderr: { write: () => undefined },
      },
      {
        routing,
        brain: 'DEV_BRAIN',
        soul: 'SOUL',
        executeModel: async () => {
          modelCalls += 1;
          return 0;
        },
        gateRunner: () => ({ status: 2 }),
      }
    );

    expect(code).toBe(2);
    expect(modelCalls).toBe(0);
  });

  test('main returns postflight status when model succeeds but postflight fails', async () => {
    const code = await main(
      [
        '--phase',
        'production',
        '--task',
        'fix xirr calculation regression',
        '--skip-preflight-gate',
        '--skip-reason',
        'repairing calc-gate',
      ],
      process.env,
      {
        stdout: { write: () => undefined },
        stderr: { write: () => undefined },
      },
      {
        routing,
        brain: 'DEV_BRAIN',
        soul: 'SOUL',
        executeModel: async () => 0,
        gateRunner: () => ({ status: 7 }),
      }
    );

    expect(code).toBe(7);
  });

  test('main returns model status when model fails and financial postflight passes', async () => {
    const code = await main(
      [
        '--phase',
        'production',
        '--task',
        'fix xirr calculation regression',
        '--skip-preflight-gate',
        '--skip-reason',
        'repairing calc-gate',
      ],
      process.env,
      {
        stdout: { write: () => undefined },
        stderr: { write: () => undefined },
      },
      {
        routing,
        brain: 'DEV_BRAIN',
        soul: 'SOUL',
        executeModel: async () => 5,
        gateRunner: () => ({ status: 0 }),
      }
    );

    expect(code).toBe(5);
  });

  test('main returns postflight status and logs both when model and postflight fail', async () => {
    const stderr: string[] = [];
    const code = await main(
      [
        '--phase',
        'production',
        '--task',
        'fix xirr calculation regression',
        '--skip-preflight-gate',
        '--skip-reason',
        'repairing calc-gate',
      ],
      process.env,
      {
        stdout: { write: () => undefined },
        stderr: { write: (message: string) => stderr.push(message) },
      },
      {
        routing,
        brain: 'DEV_BRAIN',
        soul: 'SOUL',
        executeModel: async () => 5,
        gateRunner: () => ({ status: 7 }),
      }
    );

    expect(code).toBe(7);
    expect(stderr.join('')).toContain('model exited 5 and postflight gate exited 7');
  });
});
