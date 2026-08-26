import { describe, expect, test } from 'vitest';

import {
  createRoutingPlan,
  executeWorkflow,
  main as orchestrateMain,
  parseArgs,
} from '../../../orchestrate.js';

const routing = {
  defaults: {
    research: 'claude',
    production: 'codex',
    distribution: 'claude',
  },
  longContextModel: 'kimi',
  longContextTriggers: ['repo-wide'],
  ownership: {
    production: {
      owner: 'codex',
      reviewer: 'claude',
      role: 'worker-executor',
      artifact: 'diff plus tests',
    },
  },
  specialists: {},
  scoring: {
    minScoreToAssign: 3,
  },
  gates: {
    production: 'npm run check',
  },
};

type StepCall = {
  role: string;
  input: unknown;
  attempt: number;
};

type RunStepArgs = {
  step: { role: string; model: string | null };
  input: unknown;
  attempt: number;
};

function makePairPlan(batches: string[]) {
  return {
    phase: 'production',
    task: 'implement batched change',
    risk: 'standard',
    gate: 'npm run check',
    batches,
    workflow: {
      selected: 'pair',
      steps: [
        { role: 'owner', model: 'codex', action: 'execute production worker-executor lane' },
        { role: 'reviewer', model: 'claude', action: 'review diff plus tests' },
        { role: 'gate', model: null, action: 'run npm run check' },
      ],
    },
  };
}

function appendBatch(input: unknown) {
  if (!Array.isArray(input)) {
    return String(input ?? '');
  }
  const prior = String(input[0] ?? '');
  const description = String(input[1] ?? '');
  return prior ? `${prior}|${description}` : description;
}

describe('Hermes batched workflow execution', () => {
  test('runs batches sequentially with accumulated context, then reviews and gates the full artifact', async () => {
    const calls: StepCall[] = [];
    const events: string[] = [];

    const record = await executeWorkflow(makePairPlan(['do X', 'do Y']), {
      runStep: async ({ step, input, attempt }: RunStepArgs) => {
        calls.push({ role: step.role, input, attempt });
        events.push(step.role);
        if (step.role === 'owner') {
          return { code: 0, output: appendBatch(input) };
        }
        return { code: 0, output: 'APPROVED', approved: true };
      },
      gateRunner: () => {
        events.push('gate');
        return { status: 0 };
      },
      writeRunLedger: null,
    });

    expect(calls.map((call) => call.role)).toEqual([
      'owner',
      'reviewer',
      'owner',
      'reviewer',
      'reviewer',
    ]);
    const ownerCalls = calls.filter((call) => call.role === 'owner');
    expect(ownerCalls[0].input).toEqual(['', 'do X']);
    expect(ownerCalls[1].input).toEqual(['do X', 'do Y']);
    const reviewerCalls = calls.filter((call) => call.role === 'reviewer');
    expect(reviewerCalls).toHaveLength(3);
    expect(reviewerCalls[2].input).toBe('do X|do Y');
    expect(events).toEqual(['owner', 'reviewer', 'owner', 'reviewer', 'reviewer', 'gate']);
    expect(record.approved).toBe(true);
    expect(record.batches).toEqual({
      total: 2,
      results: [
        { index: 0, description: 'do X', approved: true, repairs: 0 },
        { index: 1, description: 'do Y', approved: true, repairs: 0 },
      ],
      haltedAt: null,
    });
    expect(record.gate).toMatchObject({ command: 'npm run check', skipped: false, status: 0 });
    expect(record.exitCode).toBe(0);
  });

  test('hard-stops when a batch exhausts repairs before later batches or the gate', async () => {
    const calls: StepCall[] = [];
    let gateCalls = 0;

    const record = await executeWorkflow(makePairPlan(['stuck batch', 'must not run']), {
      runStep: async ({ step, input, attempt }: RunStepArgs) => {
        calls.push({ role: step.role, input, attempt });
        if (step.role === 'owner') {
          return { code: 0, output: appendBatch(input) };
        }
        return { code: 0, output: 'CHANGES REQUESTED', approved: false };
      },
      gateRunner: () => {
        gateCalls += 1;
        return { status: 0 };
      },
      maxRepairs: 1,
      writeRunLedger: null,
    });

    expect(
      calls.some(
        (call) =>
          call.role === 'owner' && Array.isArray(call.input) && call.input[1] === 'must not run'
      )
    ).toBe(false);
    expect(calls.filter((call) => call.role === 'reviewer')).toHaveLength(2);
    expect(gateCalls).toBe(0);
    expect(record.batches.haltedAt).toBe(0);
    expect(record.batches.results).toHaveLength(1);
    expect(record.gate.skipped).toBe(true);
    expect(record.exitCode).not.toBe(0);
  });

  test('skips the gate when the final full-artifact pass exhausts repairs', async () => {
    const calls: StepCall[] = [];
    let reviewerCalls = 0;
    let gateCalls = 0;

    const record = await executeWorkflow(makePairPlan(['do X', 'do Y']), {
      runStep: async ({ step, input, attempt }: RunStepArgs) => {
        calls.push({ role: step.role, input, attempt });
        if (step.role === 'owner') {
          return { code: 0, output: appendBatch(input) };
        }
        reviewerCalls += 1;
        const approved = reviewerCalls <= 2;
        return {
          code: 0,
          output: approved ? 'APPROVED' : 'CHANGES REQUESTED: final artifact',
          approved,
        };
      },
      gateRunner: () => {
        gateCalls += 1;
        return { status: 0 };
      },
      maxRepairs: 1,
      writeRunLedger: null,
    });

    const reviewerInputs = calls
      .filter((call) => call.role === 'reviewer')
      .map((call) => call.input);
    expect(reviewerInputs[2]).toBe('do X|do Y');
    expect(reviewerCalls).toBe(4);
    expect(gateCalls).toBe(0);
    expect(record.batches.haltedAt).toBeNull();
    expect(record.approved).toBe(false);
    expect(record.gate.skipped).toBe(true);
    expect(record.exitCode).not.toBe(0);
  });

  test.each(['debate', 'review'])(
    'rejects an ownerless %s workflow before model or gate execution',
    async (selected) => {
      let stepCalls = 0;
      let gateCalls = 0;
      const plan = {
        ...makePairPlan(['do X']),
        workflow: {
          selected,
          steps: [
            { role: 'reviewer', model: 'claude', action: 'review existing artifact' },
            { role: 'gate', model: null, action: 'run npm run check' },
          ],
        },
      };

      await expect(
        executeWorkflow(plan, {
          runStep: async () => {
            stepCalls += 1;
            return { code: 0, output: 'APPROVED', approved: true };
          },
          gateRunner: () => {
            gateCalls += 1;
            return { status: 0 };
          },
          writeRunLedger: null,
        })
      ).rejects.toThrow('Batched workflows require an owner step');
      expect(stepCalls).toBe(0);
      expect(gateCalls).toBe(0);
    }
  );
});

describe('Hermes batched workflow planning and CLI', () => {
  test('parses --batches-file and includes batches in routing plans only when supplied', () => {
    expect(parseArgs(['--batches-file', 'batches.json']).batchesFile).toBe('batches.json');

    const withBatches = createRoutingPlan({
      phase: 'production',
      task: 'implement change',
      routing,
      requestedWorkflow: 'pair',
      batches: ['do X', 'do Y'],
    });
    const withoutBatches = createRoutingPlan({
      phase: 'production',
      task: 'implement change',
      routing,
      requestedWorkflow: 'pair',
    });

    expect(withBatches.batches).toEqual(['do X', 'do Y']);
    expect(withoutBatches).not.toHaveProperty('batches');
  });

  test('documents --batches-file in CLI help', async () => {
    const stdout: string[] = [];

    const code = await orchestrateMain(
      ['--help'],
      process.env,
      {
        stdout: { write: (value: string) => stdout.push(value) },
        stderr: { write: () => undefined },
      },
      {}
    );

    expect(code).toBe(0);
    expect(stdout.join('')).toContain('--batches-file <path>');
    expect(stdout.join('')).toContain('JSON array of non-empty strings');
    expect(stdout.join('')).toContain('Requires production phase');
  });

  test.each([
    {
      label: 'missing workflow',
      argv: ['--phase', 'production'],
      message: '--batches-file requires --workflow',
    },
    {
      label: 'non-production phase',
      argv: ['--phase', 'research', '--workflow', 'pair'],
      message: '--batches-file requires --phase production',
    },
    {
      label: 'ownerless debate workflow',
      argv: ['--phase', 'production', '--workflow', 'debate'],
      message: '--batches-file supports only owner-based',
    },
    {
      label: 'ownerless review workflow',
      argv: ['--phase', 'production', '--workflow', 'review'],
      message: '--batches-file supports only owner-based',
    },
  ])('rejects $label before loading batches', async ({ argv, message }) => {
    let loadCalls = 0;

    await expect(
      orchestrateMain(
        [
          ...argv,
          '--task',
          'implement change',
          '--dry-run',
          '--json',
          '--batches-file',
          'batches.json',
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
          loadJSON: () => {
            loadCalls += 1;
            return ['do X'];
          },
        }
      )
    ).rejects.toThrow(message);
    expect(loadCalls).toBe(0);
  });

  test.each([
    { label: 'empty array', parsed: [] },
    { label: 'non-string entry', parsed: ['valid', 42] },
    { label: 'blank string', parsed: ['valid', '   '] },
  ])('rejects an invalid batches file containing $label', async ({ parsed }) => {
    await expect(
      orchestrateMain(
        [
          '--phase',
          'production',
          '--task',
          'implement change',
          '--workflow',
          'pair',
          '--dry-run',
          '--json',
          '--batches-file',
          'invalid-batches.json',
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
          loadJSON: () => parsed,
        }
      )
    ).rejects.toThrow('--batches-file must point to a JSON array');
  });

  test('rejects a missing batches file with its resolved path', async () => {
    await expect(
      orchestrateMain(
        [
          '--phase',
          'production',
          '--task',
          'implement change',
          '--workflow',
          'pair',
          '--dry-run',
          '--json',
          '--batches-file',
          '.claude/hermes/briefs/missing-batches-file.json',
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
          loadJSON: (filePath: string) => {
            throw new Error(`Missing JSON file: ${filePath}`);
          },
        }
      )
    ).rejects.toThrow(/Missing JSON file: .*missing-batches-file\.json/);
  });

  test('dry-run JSON includes supplied batches and omits the key otherwise', async () => {
    const withBatchOutput: string[] = [];
    const withoutBatchOutput: string[] = [];
    const baseArgs = [
      '--phase',
      'production',
      '--task',
      'implement change',
      '--workflow',
      'pair',
      '--dry-run',
      '--json',
    ];
    const deps = {
      routing,
      brain: 'DEV_BRAIN',
      soul: 'SOUL',
      loadJSON: () => ['do X', 'do Y'],
    };

    await orchestrateMain(
      [...baseArgs, '--batches-file', 'batches.json'],
      process.env,
      {
        stdout: { write: (value: string) => withBatchOutput.push(value) },
        stderr: { write: () => undefined },
      },
      deps
    );
    await orchestrateMain(
      baseArgs,
      process.env,
      {
        stdout: { write: (value: string) => withoutBatchOutput.push(value) },
        stderr: { write: () => undefined },
      },
      deps
    );

    expect(JSON.parse(withBatchOutput.join('')).batches).toEqual(['do X', 'do Y']);
    expect(JSON.parse(withoutBatchOutput.join(''))).not.toHaveProperty('batches');
  });

  test('main executes a live batched workflow through injected runners', async () => {
    const roles: string[] = [];
    let gateCalls = 0;

    const code = await orchestrateMain(
      [
        '--phase',
        'production',
        '--task',
        'implement change',
        '--workflow',
        'pair',
        '--live',
        '--skip-preflight-gate',
        '--skip-reason',
        'batched workflow unit test',
        '--batches-file',
        'batches.json',
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
        loadJSON: () => ['do X', 'do Y'],
        prepareRelaunchCleanup: () => undefined,
        writeRunLedger: null,
        gateRunner: () => {
          gateCalls += 1;
          return { status: 0 };
        },
        runStep: async ({ step, input }: RunStepArgs) => {
          roles.push(step.role);
          if (step.role === 'owner') {
            return { code: 0, output: appendBatch(input) };
          }
          return { code: 0, output: 'APPROVED', approved: true };
        },
      }
    );

    expect(code).toBe(0);
    expect(roles).toEqual(['owner', 'reviewer', 'owner', 'reviewer', 'reviewer']);
    expect(gateCalls).toBe(1);
  });
});
