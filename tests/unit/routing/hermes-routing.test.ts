import { describe, expect, test } from 'vitest';

import {
  buildPrompt,
  chooseModel,
  createRoutingPlan,
  generateRunId,
  getGateRunPlan,
  isCliEntryPoint,
  main,
  parseArgs,
  resolveEffectivePhase,
  resolveGate,
  resolveOwnership,
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
  ownership: {
    research: {
      owner: 'claude',
      reviewer: 'kimi',
      role: 'leader-coordinator',
      artifact: 'implementation brief',
    },
    production: {
      owner: 'codex',
      reviewer: 'claude',
      role: 'worker-executor',
      artifact: 'diff plus tests',
    },
    'production-financial': {
      owner: 'codex',
      reviewer: 'claude',
      audit: 'kimi',
      role: 'worker-executor',
      specialistRequired: true,
      artifact: 'diff plus truth-case notes',
      humanApproval: true,
    },
    distribution: {
      owner: 'claude',
      role: 'release-manager',
      artifact: 'PR-ready summary',
    },
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

    expect(specialist?.name).toBe('xirr-fees-validator');
    expect(specialist?.risk).toBe('financial');
    expect(specialist?.score).toBe(7);
    expect(specialist?.matched).toEqual(['xirr calculation', 'management fees']);
    expect(specialist?.confidence).toBe(1);
    expect(resolveGate('production', specialist, routing.gates)).toBe('npm run calc-gate');
  });

  test('scoreSpecialist exposes maxScore and partial-match confidence', () => {
    const specialist = scoreSpecialist(
      'investigate management fees report',
      routing.specialists,
      routing.scoring
    );

    expect(specialist?.name).toBe('xirr-fees-validator');
    expect(specialist?.score).toBe(3);
    expect(specialist?.maxScore).toBe(7);
    expect(specialist?.confidence).toBeCloseTo(0.43, 2);
    expect(specialist?.matched).toEqual(['management fees']);
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

  test('createRoutingPlan includes specialist, confidence, candidates, and ownership', () => {
    const plan = createRoutingPlan({
      phase: 'production',
      task: 'fix xirr calculation with management fees',
      routing,
      manualModel: null,
    });

    expect(plan.phase).toBe('production');
    expect(plan.task).toBe('fix xirr calculation with management fees');
    expect(plan.model).toBe('codex');
    expect(plan.specialist).toBe('xirr-fees-validator');
    expect(plan.risk).toBe('financial');
    expect(plan.score).toBe(7);
    expect(plan.confidence).toBe(1);
    expect(plan.gate).toBe('npm run calc-gate');
    expect(plan.candidates).toHaveLength(1);
    expect(plan.candidates[0]).toMatchObject({
      name: 'xirr-fees-validator',
      score: 7,
      matched: ['xirr calculation', 'management fees'],
    });
    expect(plan.ownership).toMatchObject({
      effectivePhase: 'production-financial',
      owner: 'codex',
      reviewer: 'claude',
      role: 'worker-executor',
      humanApproval: true,
    });
  });

  test('createRoutingPlan returns empty candidates when no specialist matches', () => {
    const plan = createRoutingPlan({
      phase: 'distribution',
      task: 'prepare distribution summary for PR',
      routing,
      manualModel: null,
    });

    expect(plan.specialist).toBeNull();
    expect(plan.candidates).toEqual([]);
    expect(plan.confidence).toBe(0);
    expect(plan.ownership).toMatchObject({
      effectivePhase: 'distribution',
      owner: 'claude',
      role: 'release-manager',
    });
  });

  test('resolveEffectivePhase promotes financial production work', () => {
    expect(resolveEffectivePhase('production', { risk: 'financial' })).toBe('production-financial');
    expect(resolveEffectivePhase('production', { risk: 'quality' })).toBe('production');
    expect(resolveEffectivePhase('research', { risk: 'financial' })).toBe('research');
  });

  test('resolveOwnership prefers production-financial entry for financial work', () => {
    const ownership = resolveOwnership('production', { risk: 'financial' }, routing.ownership);
    expect(ownership?.effectivePhase).toBe('production-financial');
    expect(ownership?.humanApproval).toBe(true);
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

  test('buildPrompt injects ownership context and handoff schema labels', () => {
    const plan = createRoutingPlan({
      phase: 'production',
      task: 'fix xirr calculation with management fees',
      routing,
      manualModel: null,
    });

    const prompt = buildPrompt({ plan, brain: 'DEV_BRAIN', soul: 'SOUL', runId: 'hermes-test' });

    expect(prompt).toContain('OWNER: codex');
    expect(prompt).toContain('reviewer: claude');
    expect(prompt).toContain('role: worker-executor');
    expect(prompt).toContain('human approval required');
    expect(prompt).toContain('SPECIALIST: xirr-fees-validator');
    expect(prompt).toContain('confidence: 100%');
    expect(prompt).toContain('RUN ID: hermes-test');
    expect(prompt).toContain('Handoff block');

    for (const label of [
      'Run ID',
      'Phase',
      'Owner',
      'Reviewer',
      'Task',
      'Protected areas',
      'Files touched',
      'Commands run',
      'Gate status',
      'Decision needed',
      'Next action',
    ]) {
      expect(prompt).toContain(label);
    }

    expect(prompt).toContain('.claude/schemas/handoff.schema.json');
  });

  test('generateRunId formats deterministically from a clock', () => {
    const id = generateRunId(new Date('2026-05-20T18:30:45.123Z'));
    expect(id).toBe('hermes-2026-05-20T18-30-45-123Z');
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
        writeRunLedger: null,
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
        writeRunLedger: null,
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
        writeRunLedger: null,
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
        writeRunLedger: null,
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
        writeRunLedger: null,
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
        writeRunLedger: null,
      }
    );

    expect(code).toBe(7);
    expect(stderr.join('')).toContain('model exited 5 and postflight gate exited 7');
  });

  test('main writes a run ledger capturing plan, gates, and exit code', async () => {
    const ledgerCalls: unknown[] = [];

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
        gateRunner: () => ({ status: 0 }),
        writeRunLedger: (record: unknown) => ledgerCalls.push(record),
        clock: () => new Date('2026-05-20T18:30:45.123Z'),
      }
    );

    expect(code).toBe(0);
    expect(ledgerCalls).toHaveLength(1);
    const record = ledgerCalls[0] as {
      runId: string;
      exitCode: number;
      plan: { specialist: string };
      preflight: { skipped: boolean; reason: string };
      model: { name: string; exitCode: number };
      postflight: { status: number };
    };
    expect(record.runId).toBe('hermes-2026-05-20T18-30-45-123Z');
    expect(record.exitCode).toBe(0);
    expect(record.plan.specialist).toBe('xirr-fees-validator');
    expect(record.preflight).toMatchObject({ skipped: true, reason: 'repairing calc-gate' });
    expect(record.model).toMatchObject({ name: 'codex', exitCode: 0 });
    expect(record.postflight).toMatchObject({ status: 0 });
  });

  test('main skips ledger when writeRunLedger is null and does not throw', async () => {
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
        executeModel: async () => 0,
        gateRunner: () => ({ status: 0 }),
        writeRunLedger: null,
      }
    );

    expect(code).toBe(0);
  });
});
