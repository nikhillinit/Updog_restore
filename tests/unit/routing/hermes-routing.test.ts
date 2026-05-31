import { describe, expect, test } from 'vitest';

import {
  assertFinancialGate,
  buildPrompt,
  chooseModel,
  createWorkflowPlan,
  createRoutingPlan,
  evaluateReadiness,
  executeWorkflow,
  generateRunId,
  getGateRunPlan,
  isCliEntryPoint,
  main,
  parseArgs,
  recommendWorkflow,
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

  test('main help explains phase lanes and preflight-only gate skip semantics', async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];

    const code = await main(
      ['--help'],
      process.env,
      {
        stdout: { write: (message: string) => stdout.push(message) },
        stderr: { write: (message: string) => stderr.push(message) },
      },
      { writeRunLedger: null }
    );

    const help = stdout.join('');
    expect(code).toBe(0);
    expect(stderr.join('')).toBe('');
    expect(help).toContain('--phase <research|production|distribution>');
    expect(help).toContain(
      'Financial production tasks are promoted internally to production-financial'
    );
    expect(help).toContain('gate: npm run calc-gate');
    expect(help).toContain('Skip only the preflight gate; postflight gates still run.');
    expect(help).toContain('Legacy --skip-gates is rejected.');
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

  test('parseArgs recognizes dry-run workflow planning options', () => {
    const args = parseArgs([
      '--dry-run',
      '--phase',
      'production',
      '--task',
      'implement workflow planning',
      '--workflow',
      'pair',
      '--model',
      'codex',
    ]);

    expect(args.workflow).toBe('pair');
    expect(args.workflowProvided).toBe(true);
    expect(args.manualModel).toBe('codex');
  });

  test('parseArgs rejects unknown workflow planning modes', () => {
    expect(() =>
      parseArgs(['--dry-run', '--task', 'implement workflow planning', '--workflow', 'swarm'])
    ).toThrow('Unknown workflow');
  });

  test('main rejects workflow planning modes outside dry-run or json before model execution', async () => {
    let modelCalls = 0;

    await expect(
      main(
        ['--phase', 'production', '--task', 'implement workflow planning', '--workflow', 'pair'],
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
          writeRunLedger: null,
        }
      )
    ).rejects.toThrow('--workflow is planning-only');

    expect(modelCalls).toBe(0);
  });

  test('main rejects explicit auto workflow outside dry-run or json before model execution', async () => {
    let modelCalls = 0;

    await expect(
      main(
        ['--phase', 'production', '--task', 'implement workflow planning', '--workflow', 'auto'],
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
          writeRunLedger: null,
        }
      )
    ).rejects.toThrow('--workflow is planning-only');

    expect(modelCalls).toBe(0);
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
      requestedWorkflow: 'auto',
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
    expect(plan.workflow).toMatchObject({
      requested: 'auto',
      selected: 'pair',
      planningOnly: true,
      gate: 'npm run calc-gate',
    });
    expect(plan.workflow.steps).toEqual([
      {
        role: 'owner',
        model: 'codex',
        action: 'execute production-financial worker-executor lane',
      },
      {
        role: 'specialist',
        model: 'xirr-fees-validator',
        action: 'review financial risk before completion',
      },
      {
        role: 'reviewer',
        model: 'claude',
        action: 'review diff plus truth-case notes',
      },
      {
        role: 'audit',
        model: 'kimi',
        action: 'audit financial readiness evidence',
      },
      {
        role: 'gate',
        model: null,
        action: 'run npm run calc-gate',
      },
    ]);
  });

  test('recommendWorkflow routes long-context research through a planned chain lane', () => {
    const plan = createRoutingPlan({
      phase: 'research',
      task: 'full repo audit for agent routing',
      routing,
      manualModel: null,
      requestedWorkflow: 'auto',
    });

    expect(plan.model).toBe('kimi');
    expect(plan.workflow).toMatchObject({
      requested: 'auto',
      selected: 'chain',
      planningOnly: true,
    });
    expect(plan.workflow.steps[0]).toMatchObject({
      role: 'owner',
      model: 'kimi',
      action: 'execute research leader-coordinator lane',
    });
  });

  test('createRoutingPlan returns empty candidates when no specialist matches', () => {
    const plan = createRoutingPlan({
      phase: 'distribution',
      task: 'prepare distribution summary for PR',
      routing,
      manualModel: null,
      requestedWorkflow: 'auto',
    });

    expect(plan.specialist).toBeNull();
    expect(plan.candidates).toEqual([]);
    expect(plan.confidence).toBe(0);
    expect(plan.ownership).toMatchObject({
      effectivePhase: 'distribution',
      owner: 'claude',
      role: 'release-manager',
    });
    expect(plan.workflow).toMatchObject({
      requested: 'auto',
      selected: 'review',
      planningOnly: true,
    });
  });

  test('createRoutingPlan omits the workflow key when no workflow is requested', () => {
    const plan = createRoutingPlan({
      phase: 'production',
      task: 'add a dashboard button',
      routing,
      manualModel: null,
    });

    expect('workflow' in plan).toBe(false);
  });

  test('recommendWorkflow keeps non-financial production on a planned solo lane', () => {
    const plan = createRoutingPlan({
      phase: 'production',
      task: 'add dry-run workflow plan to Hermes output',
      routing,
      manualModel: null,
      requestedWorkflow: 'auto',
    });

    expect(recommendWorkflow({ phase: plan.phase, risk: plan.risk })).toBe('solo');
    expect(plan.workflow).toMatchObject({
      requested: 'auto',
      selected: 'solo',
      planningOnly: true,
      deferred: ['model execution', 'artifact handoff', 'review platform automation'],
    });
    expect(plan.workflow.steps).toEqual([
      {
        role: 'owner',
        model: 'codex',
        action: 'execute production worker-executor lane',
      },
      {
        role: 'gate',
        model: null,
        action: 'run npm run check',
      },
    ]);
  });

  test('createWorkflowPlan honors manual workflow overrides without adding execution behavior', () => {
    const workflow = createWorkflowPlan({
      requestedWorkflow: 'solo',
      phase: 'production',
      model: 'codex',
      specialist: null,
      gate: 'npm run check',
      ownership: {
        effectivePhase: 'production',
        owner: 'codex',
        reviewer: 'claude',
        role: 'worker-executor',
        artifact: 'diff plus tests',
      },
      risk: 'standard',
    });

    expect(workflow).toMatchObject({
      requested: 'solo',
      selected: 'solo',
      planningOnly: true,
    });
    expect(workflow.steps).toEqual([
      {
        role: 'owner',
        model: 'codex',
        action: 'execute production worker-executor lane',
      },
      {
        role: 'gate',
        model: null,
        action: 'run npm run check',
      },
    ]);
  });

  test('createWorkflowPlan builds debate comparators and synthesis from routing config', () => {
    const workflow = createWorkflowPlan({
      requestedWorkflow: 'debate',
      phase: 'production',
      model: 'codex',
      specialist: null,
      gate: 'npm run check',
      ownership: { effectivePhase: 'production', owner: 'codex', reviewer: 'claude' },
      risk: 'standard',
      debate: { comparators: ['claude', 'codex', 'kimi'], synthesis: 'claude' },
    });

    expect(workflow.selected).toBe('debate');
    expect(workflow.steps.map((step) => step.role)).toEqual([
      'comparator',
      'comparator',
      'comparator',
      'synthesis',
      'gate',
    ]);
    expect(
      workflow.steps.filter((step) => step.role === 'comparator').map((step) => step.model)
    ).toEqual(['claude', 'codex', 'kimi']);
    const synthesis = workflow.steps.find((step) => step.role === 'synthesis');
    expect(synthesis?.model).toBe('claude');
    expect(workflow.steps.some((step) => step.role === 'owner')).toBe(false);
  });

  test('createWorkflowPlan falls back to the default debate roster when none is provided', () => {
    const workflow = createWorkflowPlan({
      requestedWorkflow: 'debate',
      phase: 'production',
      model: 'codex',
      specialist: null,
      gate: 'npm run check',
      ownership: { effectivePhase: 'production', owner: 'codex', reviewer: 'claude' },
      risk: 'standard',
    });

    expect(
      workflow.steps.filter((step) => step.role === 'comparator').map((step) => step.model)
    ).toEqual(['claude', 'codex', 'kimi']);
    expect(workflow.steps.find((step) => step.role === 'synthesis')?.model).toBe('claude');
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

  describe('assertFinancialGate', () => {
    test('passes a financial production plan whose gate is npm run calc-gate', () => {
      expect(() =>
        assertFinancialGate({ phase: 'production', risk: 'financial', gate: 'npm run calc-gate' })
      ).not.toThrow();
    });

    test('throws when a financial production plan resolves to any other gate', () => {
      expect(() =>
        assertFinancialGate({ phase: 'production', risk: 'financial', gate: 'npm run check' })
      ).toThrow(/npm run calc-gate/);
    });

    test('is a no-op for a non-financial production plan regardless of gate', () => {
      expect(() =>
        assertFinancialGate({ phase: 'production', risk: 'standard', gate: 'npm run check' })
      ).not.toThrow();
    });

    test('is a no-op for a financial-risk plan outside the production phase', () => {
      expect(() =>
        assertFinancialGate({ phase: 'research', risk: 'financial', gate: 'npm run doctor:quick' })
      ).not.toThrow();
    });

    test('is a no-op for a real non-financial production plan from createRoutingPlan', () => {
      const plan = createRoutingPlan({
        phase: 'production',
        task: 'update the readme copy for the dashboard',
        routing,
      });

      expect(plan.risk).toBe('standard');
      expect(plan.gate).toBe('npm run check');
      expect(() => assertFinancialGate(plan)).not.toThrow();
    });
  });

  describe('executeWorkflow', () => {
    type StepCall = {
      role: string;
      model: string | null;
      input: string | null;
      notes: string | null;
      attempt: number;
    };

    type StepReply = {
      code?: number;
      output?: string;
      approved?: boolean;
    };

    const makeRunner = (script: Record<string, StepReply | ((attempt: number) => StepReply)>) => {
      const calls: StepCall[] = [];
      const runStep = async ({
        step,
        input,
        notes,
        attempt,
      }: {
        step: { role: string; model: string | null };
        input: string | null;
        notes: string | null;
        attempt: number;
      }) => {
        calls.push({ role: step.role, model: step.model, input, notes, attempt });
        const responder = script[step.role];
        const reply = typeof responder === 'function' ? responder(attempt) : responder || {};
        return {
          code: reply.code ?? 0,
          output: reply.output ?? `${step.role}-${attempt}`,
          approved: reply.approved,
        };
      };
      return { runStep, calls };
    };

    const pairPlan = {
      phase: 'production',
      risk: 'standard',
      gate: 'npm run check',
      workflow: {
        selected: 'pair',
        steps: [
          { role: 'owner', model: 'codex', action: 'execute production worker-executor lane' },
          { role: 'reviewer', model: 'claude', action: 'review diff plus tests' },
          { role: 'gate', model: null, action: 'run npm run check' },
        ],
      },
    };

    const financialPairPlan = {
      phase: 'production',
      risk: 'financial',
      gate: 'npm run calc-gate',
      workflow: {
        selected: 'pair',
        steps: [
          {
            role: 'owner',
            model: 'codex',
            action: 'execute production-financial worker-executor lane',
          },
          {
            role: 'specialist',
            model: 'precision-specialist',
            action: 'review financial risk before completion',
          },
          { role: 'reviewer', model: 'claude', action: 'review diff plus truth-case notes' },
          { role: 'audit', model: 'kimi', action: 'audit financial readiness evidence' },
          { role: 'gate', model: null, action: 'run npm run calc-gate' },
        ],
      },
    };

    test('throws without an injected step runner', async () => {
      await expect(
        executeWorkflow(pairPlan, { gateRunner: () => ({ status: 0 }) })
      ).rejects.toThrow('requires deps.runStep');
    });

    test('throws when the plan has no workflow steps', async () => {
      await expect(executeWorkflow({ phase: 'production' }, {})).rejects.toThrow(
        'workflow.steps array'
      );
    });

    test('runs owner then reviewer and passes the gate when the reviewer approves first', async () => {
      const { runStep, calls } = makeRunner({
        owner: { output: 'owner-diff' },
        reviewer: { approved: true },
      });
      const gateCalls: string[] = [];

      const record = await executeWorkflow(pairPlan, {
        runStep,
        gateRunner: (bin: string, args: string[]) => {
          gateCalls.push([bin, ...args].join(' '));
          return { status: 0 };
        },
        writeRunLedger: null,
      });

      expect(record.approved).toBe(true);
      expect(record.repairs).toBe(0);
      expect(record.exitCode).toBe(0);
      expect(record.gate).toMatchObject({ command: 'npm run check', status: 0 });
      expect(gateCalls).toEqual(['npm run check']);
      expect(calls.map((call) => call.role)).toEqual(['owner', 'reviewer']);
      expect(calls[1].input).toBe('owner-diff');
    });

    test('threads review feedback back to the owner across a bounded repair loop', async () => {
      const { runStep, calls } = makeRunner({
        owner: (attempt) => ({ output: `owner-diff-${attempt}` }),
        reviewer: (attempt) => ({
          approved: attempt >= 1,
          output: `please-fix-${attempt}`,
        }),
      });

      const record = await executeWorkflow(pairPlan, {
        runStep,
        gateRunner: () => ({ status: 0 }),
        writeRunLedger: null,
      });

      expect(record.repairs).toBe(1);
      expect(record.approved).toBe(true);
      expect(record.exitCode).toBe(0);
      expect(calls.map((call) => call.role)).toEqual(['owner', 'reviewer', 'owner', 'reviewer']);
      expect(calls[2].input).toBe('please-fix-0');
      expect(calls[3].input).toBe('owner-diff-1');
    });

    test('stops at the repair cap and reports not-ready when the reviewer never approves', async () => {
      const { runStep, calls } = makeRunner({
        owner: { output: 'owner-diff' },
        reviewer: { approved: false, output: 'still-wrong' },
      });

      const record = await executeWorkflow(pairPlan, {
        runStep,
        gateRunner: () => ({ status: 0 }),
        writeRunLedger: null,
      });

      expect(record.repairs).toBe(2);
      expect(record.approved).toBe(false);
      expect(record.exitCode).toBe(1);
      expect(calls.filter((call) => call.role === 'owner')).toHaveLength(3);
      expect(calls.filter((call) => call.role === 'reviewer')).toHaveLength(3);
    });

    test('honors a custom repair cap from deps.maxRepairs', async () => {
      const { runStep, calls } = makeRunner({
        owner: { output: 'owner-diff' },
        reviewer: { approved: false, output: 'still-wrong' },
      });

      const record = await executeWorkflow(pairPlan, {
        runStep,
        gateRunner: () => ({ status: 0 }),
        maxRepairs: 1,
        writeRunLedger: null,
      });

      expect(record.repairs).toBe(1);
      expect(calls.filter((call) => call.role === 'owner')).toHaveLength(2);
    });

    test('reports the gate exit code when the gate fails after approval', async () => {
      const { runStep } = makeRunner({
        owner: { output: 'owner-diff' },
        reviewer: { approved: true },
      });

      const record = await executeWorkflow(pairPlan, {
        runStep,
        gateRunner: () => ({ status: 2 }),
        writeRunLedger: null,
      });

      expect(record.approved).toBe(true);
      expect(record.exitCode).toBe(2);
      expect(record.gate.status).toBe(2);
    });

    test('runs specialist before and audit after the loop for a financial pair', async () => {
      const { runStep, calls } = makeRunner({
        owner: { output: 'owner-diff' },
        specialist: { output: 'risk-reviewed' },
        reviewer: { approved: true },
        audit: { output: 'audited' },
      });
      const gateCalls: string[] = [];

      const record = await executeWorkflow(financialPairPlan, {
        runStep,
        gateRunner: (bin: string, args: string[]) => {
          gateCalls.push([bin, ...args].join(' '));
          return { status: 0 };
        },
        writeRunLedger: null,
      });

      expect(record.exitCode).toBe(0);
      expect(record.approved).toBe(true);
      expect(gateCalls).toEqual(['npm run calc-gate']);
      expect(calls.map((call) => call.role)).toEqual(['owner', 'specialist', 'reviewer', 'audit']);
    });

    test('routes the owner diff with specialist notes to the reviewer in a financial pair', async () => {
      const { runStep, calls } = makeRunner({
        owner: { output: 'owner-diff' },
        specialist: { output: 'risk-notes' },
        reviewer: { approved: true },
        audit: { output: 'audited' },
      });

      await executeWorkflow(financialPairPlan, {
        runStep,
        gateRunner: () => ({ status: 0 }),
        writeRunLedger: null,
      });

      const reviewerCall = calls.find((call) => call.role === 'reviewer');
      expect(reviewerCall?.input).toBe('owner-diff');
      expect(reviewerCall?.notes).toBe('risk-notes');
    });

    test('asserts the financial readiness gate before running it', async () => {
      const { runStep } = makeRunner({
        owner: { output: 'owner-diff' },
        specialist: { output: 'risk-reviewed' },
        reviewer: { approved: true },
        audit: { output: 'audited' },
      });

      const misconfigured = {
        ...financialPairPlan,
        gate: 'npm run check',
      };
      let gateRan = false;

      await expect(
        executeWorkflow(misconfigured, {
          runStep,
          gateRunner: () => {
            gateRan = true;
            return { status: 0 };
          },
          writeRunLedger: null,
        })
      ).rejects.toThrow('npm run calc-gate');

      expect(gateRan).toBe(false);
    });

    test('persists a run ledger capturing steps, repairs, gate, and exit code', async () => {
      const { runStep } = makeRunner({
        owner: { output: 'owner-diff' },
        reviewer: { approved: true },
      });
      const ledgerCalls: Array<Record<string, unknown>> = [];

      const record = await executeWorkflow(pairPlan, {
        runStep,
        gateRunner: () => ({ status: 0 }),
        clock: () => new Date('2026-05-20T18:30:45.123Z'),
        writeRunLedger: (entry: Record<string, unknown>) => ledgerCalls.push(entry),
      });

      expect(record.runId).toBe('hermes-2026-05-20T18-30-45-123Z');
      expect(ledgerCalls).toHaveLength(1);
      expect(ledgerCalls[0]).toMatchObject({
        runId: 'hermes-2026-05-20T18-30-45-123Z',
        workflow: 'pair',
        approved: true,
        repairs: 0,
        exitCode: 0,
      });
      expect(record.steps.map((step: { role: string }) => step.role)).toEqual([
        'owner',
        'reviewer',
      ]);
    });

    const debatePlan = {
      phase: 'production',
      risk: 'standard',
      gate: 'npm run check',
      workflow: {
        selected: 'debate',
        steps: [
          { role: 'comparator', model: 'claude', action: 'compare production options' },
          { role: 'comparator', model: 'codex', action: 'compare production options' },
          { role: 'comparator', model: 'kimi', action: 'compare production options' },
          {
            role: 'synthesis',
            model: 'claude',
            action: 'synthesize production options into diff plus tests',
          },
          { role: 'gate', model: null, action: 'run npm run check' },
        ],
      },
    };

    const chainPlan = {
      phase: 'research',
      risk: 'standard',
      gate: 'npm run doctor:quick',
      workflow: {
        selected: 'chain',
        steps: [
          { role: 'owner', model: 'claude', action: 'execute research leader-coordinator lane' },
          { role: 'reviewer', model: 'kimi', action: 'review implementation brief' },
          { role: 'gate', model: null, action: 'run npm run doctor:quick' },
        ],
      },
    };

    // NOTE: the synthesis step receives an ARRAY of comparator outputs as `input`,
    // unlike every other role which receives a string or null. This test therefore
    // uses its own inline runStep typed `input: unknown`. Do NOT reuse makeRunner
    // here and do NOT "fix" the array-vs-string type difference; it is intentional.
    test('runs every comparator then synthesis for a debate workflow', async () => {
      const calls: Array<{ role: string; model: string | null; input: unknown }> = [];
      const runStep = async ({
        step,
        input,
      }: {
        step: { role: string; model: string | null };
        input: unknown;
      }) => {
        calls.push({ role: step.role, model: step.model, input });
        return { code: 0, output: `${step.model}-option`, approved: undefined };
      };

      const record = await executeWorkflow(debatePlan, {
        runStep,
        gateRunner: () => ({ status: 0 }),
        writeRunLedger: null,
      });

      expect(record.workflow).toBe('debate');
      expect(record.exitCode).toBe(0);
      expect(record.approved).toBe(true);
      expect(calls.map((call) => call.role)).toEqual([
        'comparator',
        'comparator',
        'comparator',
        'synthesis',
      ]);
      const synthesisCall = calls.find((call) => call.role === 'synthesis');
      expect(synthesisCall?.input).toEqual(['claude-option', 'codex-option', 'kimi-option']);
    });

    test('reports a debate comparator failure even when the gate passes', async () => {
      const runStep = async ({
        step,
      }: {
        step: { role: string; model: string | null };
        input: unknown;
      }) => {
        return {
          code: step.role === 'comparator' && step.model === 'codex' ? 7 : 0,
          output: `${step.model}-option`,
          approved: undefined,
        };
      };

      const record = await executeWorkflow(debatePlan, {
        runStep,
        gateRunner: () => ({ status: 0 }),
        writeRunLedger: null,
      });

      expect(record.exitCode).toBe(7);
      expect(record.steps.find((step) => step.model === 'codex')?.code).toBe(7);
      expect(evaluateReadiness(debatePlan, record)).toEqual({
        ready: false,
        reason: 'workflow exited with code 7',
      });
    });

    test('executes a research chain through the generic engine', async () => {
      const { runStep, calls } = makeRunner({
        owner: { output: 'brief' },
        reviewer: { approved: true },
      });

      const record = await executeWorkflow(chainPlan, {
        runStep,
        gateRunner: () => ({ status: 0 }),
        writeRunLedger: null,
      });

      expect(record.workflow).toBe('chain');
      expect(record.exitCode).toBe(0);
      expect(record.approved).toBe(true);
      expect(calls.map((call) => call.role)).toEqual(['owner', 'reviewer']);
      expect(calls[1].input).toBe('brief');
    });

    describe('evaluateReadiness', () => {
      test('is ready for a financial plan that resolves the correct gate', () => {
        expect(
          evaluateReadiness({ phase: 'production', risk: 'financial', gate: 'npm run calc-gate' })
        ).toEqual({ ready: true, reason: null });
      });

      test('blocks a financial plan whose gate is not the calc gate', () => {
        const verdict = evaluateReadiness({
          phase: 'production',
          risk: 'financial',
          gate: 'npm run check',
        });
        expect(verdict.ready).toBe(false);
        expect(verdict.reason).toContain('npm run calc-gate');
      });

      test('is ready for a non-financial plan', () => {
        expect(
          evaluateReadiness({ phase: 'production', risk: 'standard', gate: 'npm run check' }).ready
        ).toBe(true);
      });

      test('blocks when the execution result has a nonzero exit code', () => {
        const verdict = evaluateReadiness(
          { phase: 'production', risk: 'standard', gate: 'npm run check' },
          { exitCode: 2, approved: true }
        );
        expect(verdict.ready).toBe(false);
        expect(verdict.reason).toContain('2');
      });

      test('blocks when the reviewer did not approve', () => {
        const verdict = evaluateReadiness(
          { phase: 'production', risk: 'standard', gate: 'npm run check' },
          { exitCode: 0, approved: false }
        );
        expect(verdict.ready).toBe(false);
      });
    });
  });
});
