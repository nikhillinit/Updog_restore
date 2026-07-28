import fs from 'node:fs';

import { describe, expect, test } from 'vitest';

import checkedInRouting from '../../../.claude/hermes/model-routing.json';
import { parseArgs } from '../../../orchestrate.js';

describe('text-only lane policy', () => {
  test('keeps qwen out of production ownership and uses it as a review lens', () => {
    expect(checkedInRouting.tiers.T0.modelByPhase.production).toBe('sol');
    expect(checkedInRouting.moaReview.reviewers).toContainEqual({
      model: 'qwen',
      lens: 'simplicity-efficiency',
    });
  });
});

describe('model roster expansion', () => {
  test.each([
    ['--sol', 'sol'],
    ['--luna', 'luna'],
    ['--terra', 'terra'],
    ['--qwen', 'qwen'],
  ])('%s sets manualModel %s', (flag, model) => {
    const options = parseArgs([flag, '--task', 'demo task']);
    expect(options.manualModel).toBe(model);
  });

  test('--model accepts the new names', () => {
    const options = parseArgs(['--model', 'terra', '--task', 'demo task']);
    expect(options.manualModel).toBe('terra');
  });

  test('--model rejects unknown names', () => {
    expect(() => parseArgs(['--model', 'gpt6', '--task', 'demo task'])).toThrow(/Unknown model/);
  });
});

import { classifyTier } from '../../../orchestrate.js';

const tierRouting = {
  tiers: {
    T0: {
      label: 'trivial',
      keywords: [
        { phrase: 'fix typo', weight: 3 },
        { phrase: 'rename', weight: 3 },
        { phrase: 'reformat', weight: 3 },
      ],
      minScore: 3,
      modelByPhase: {
        research: 'qwen',
        production: 'sol',
        distribution: 'qwen',
      },
      review: 'none',
    },
    T2: {
      label: 'complex',
      keywords: [
        { phrase: 'multi-module', weight: 4 },
        { phrase: 'architecture', weight: 3 },
        { phrase: 'race condition', weight: 4 },
      ],
      minScore: 3,
      modelByPhase: {
        research: 'claude',
        production: 'sol',
        distribution: 'claude',
      },
      review: 'moa',
    },
    T3: {
      label: 'critical',
      modelByPhase: {
        research: 'claude',
        production: 'sol',
        distribution: 'claude',
      },
      review: 'moa-strict',
    },
  },
};

describe('classifyTier', () => {
  test('explicit tier flag wins over keywords', () => {
    const result = classifyTier('fix typo in README', tierRouting, 'T2');
    expect(result).toEqual({ tier: 'T2', source: 'flag', matched: [] });
  });

  test('keyword match selects T0', () => {
    const result = classifyTier('fix typo in the settings page', tierRouting, null);
    expect(result.tier).toBe('T0');
    expect(result.source).toBe('keyword');
    expect(result.matched).toContain('fix typo');
  });

  test('keyword match selects T2', () => {
    const result = classifyTier('untangle race condition in queue worker', tierRouting, null);
    expect(result.tier).toBe('T2');
  });

  test('higher tier wins when both match', () => {
    const result = classifyTier('reformat the multi-module architecture docs', tierRouting, null);
    expect(result.tier).toBe('T2');
  });

  test('no match defaults to T1', () => {
    const result = classifyTier('add pagination to funds endpoint', tierRouting, null);
    expect(result).toEqual({ tier: 'T1', source: 'default', matched: [] });
  });

  test('T3 is never keyword-assigned (no keywords configured)', () => {
    const result = classifyTier('critical urgent important', tierRouting, null);
    expect(result.tier).toBe('T1');
  });

  test('invalid explicit tier throws', () => {
    expect(() => classifyTier('demo', tierRouting, 'T9')).toThrow(/Unknown tier/);
  });

  test('missing tiers config defaults to T1', () => {
    const result = classifyTier('anything at all', {}, null);
    expect(result).toEqual({ tier: 'T1', source: 'default', matched: [] });
  });
});

describe('parseArgs --tier', () => {
  test('accepts valid tier', () => {
    const options = parseArgs(['--tier', 'T2', '--task', 'demo task']);
    expect(options.tier).toBe('T2');
  });

  test('rejects invalid tier', () => {
    expect(() => parseArgs(['--tier', 'T5', '--task', 'demo task'])).toThrow(/Unknown tier/);
  });

  test('defaults to null', () => {
    const options = parseArgs(['--task', 'demo task']);
    expect(options.tier).toBeNull();
  });
});

import { chooseModel, createRoutingPlan } from '../../../orchestrate.js';

const fullRouting = {
  defaults: { research: 'claude', production: 'codex', distribution: 'claude' },
  longContextModel: 'kimi',
  longContextTriggers: ['full repo audit'],
  gates: {
    research: 'npm run doctor:quick',
    production: 'npm run check',
    'production-financial': 'npm run calc-gate',
    distribution: 'npm run lint',
  },
  specialists: {
    'waterfall-specialist': {
      keywords: [{ phrase: 'waterfall calculation', weight: 4 }],
      risk: 'financial',
    },
  },
  scoring: {
    minScoreToAssign: 3,
    riskOrder: ['financial', 'operational', 'quality'],
  },
  ...tierRouting,
};

describe('tier-aware routing', () => {
  test('T0 keyword task routes to sol with review none', () => {
    const plan = createRoutingPlan({
      phase: 'production',
      task: 'fix typo in banner',
      routing: fullRouting,
    });
    expect(plan.model).toBe('sol');
    expect(plan.tier).toEqual({
      name: 'T0',
      source: 'keyword',
      matched: ['fix typo'],
    });
    expect(plan.review).toBe('none');
  });

  test('T1 default keeps phase default model and standard review', () => {
    const plan = createRoutingPlan({
      phase: 'production',
      task: 'add pagination to funds endpoint',
      routing: fullRouting,
    });
    expect(plan.model).toBe('codex');
    expect(plan.tier.name).toBe('T1');
    expect(plan.review).toBe('standard');
  });

  test('T2 keyword task routes production to sol with moa review', () => {
    const plan = createRoutingPlan({
      phase: 'production',
      task: 'untangle race condition in worker pool',
      routing: fullRouting,
    });
    expect(plan.model).toBe('sol');
    expect(plan.review).toBe('moa');
  });

  test('financial specialist promotes any tier to T3 moa-strict', () => {
    const plan = createRoutingPlan({
      phase: 'production',
      task: 'fix typo in waterfall calculation docs',
      routing: fullRouting,
      explicitTier: 'T0',
    });
    expect(plan.tier).toEqual({
      name: 'T3',
      source: 'financial-promotion',
      matched: [],
    });
    expect(plan.review).toBe('moa-strict');
    expect(plan.gate).toBe('npm run calc-gate');
  });

  test('manual model override beats tier model', () => {
    const plan = createRoutingPlan({
      phase: 'production',
      task: 'fix typo in banner',
      routing: fullRouting,
      manualModel: 'claude',
    });
    expect(plan.model).toBe('claude');
    expect(plan.tier.name).toBe('T0');
  });

  test('long-context trigger beats tier model', () => {
    expect(
      chooseModel(
        'full repo audit of typo fixes',
        'research',
        fullRouting,
        null,
        fullRouting.tiers.T0
      )
    ).toBe('kimi');
  });

  test('explicit tier flows through createRoutingPlan', () => {
    const plan = createRoutingPlan({
      phase: 'research',
      task: 'plain task',
      routing: fullRouting,
      explicitTier: 'T2',
    });
    expect(plan.model).toBe('claude');
    expect(plan.tier).toEqual({ name: 'T2', source: 'flag', matched: [] });
  });

  test('tier model override is reflected in ownership owner', () => {
    const routingWithOwnership = {
      ...fullRouting,
      ownership: {
        production: {
          owner: 'codex',
          reviewer: 'claude',
          role: 'worker-executor',
          artifact: 'diff plus tests',
        },
      },
    };
    const plan = createRoutingPlan({
      phase: 'production',
      task: 'untangle race condition in worker pool',
      routing: routingWithOwnership,
    });
    expect(plan.ownership.owner).toBe('sol');
  });

  test('T1 ownership owner is unchanged', () => {
    const routingWithOwnership = {
      ...fullRouting,
      ownership: {
        production: {
          owner: 'codex',
          reviewer: 'claude',
          role: 'worker-executor',
          artifact: 'diff plus tests',
        },
      },
    };
    const plan = createRoutingPlan({
      phase: 'production',
      task: 'add pagination to funds endpoint',
      routing: routingWithOwnership,
    });
    expect(plan.ownership.owner).toBe('codex');
  });
});

import { main } from '../../../orchestrate.js';

describe('main --tier plumbing', () => {
  function captureIo() {
    let stdout = '';
    return {
      io: {
        stdout: {
          write: (chunk: string) => {
            stdout += chunk;
          },
        },
        stderr: { write: () => {} },
      },
      read: () => stdout,
    };
  }

  test('--json includes tier and review from explicit flag', async () => {
    const { io, read } = captureIo();
    const code = await main(
      ['--json', '--tier', 'T2', '--phase', 'production', '--task', 'plain task'],
      {},
      io as never,
      { routing: fullRouting, brain: 'stub', soul: '' }
    );
    expect(code).toBe(0);
    const plan = JSON.parse(read());
    expect(plan.tier).toEqual({ name: 'T2', source: 'flag', matched: [] });
    expect(plan.review).toBe('moa');
    expect(plan.model).toBe('sol');
  });

  test('help text documents --tier', async () => {
    const { io, read } = captureIo();
    await main(['--help'], {}, io as never, {});
    expect(read()).toContain('--tier');
  });

  test('rejects planning-only workflow before reading routing config', async () => {
    const { io } = captureIo();
    let routingRead = false;
    const deps = {
      get routing() {
        routingRead = true;
        throw new Error('routing config should not be read');
      },
    };

    await expect(
      main(
        ['--workflow', 'pair', '--phase', 'production', '--task', 'plain task'],
        {},
        io as never,
        deps as never
      )
    ).rejects.toThrow('--workflow is planning-only');
    expect(routingRead).toBe(false);
  });

  test('T2 production dispatch auto-upgrades to live workflow with MOA', async () => {
    const { io } = captureIo();
    let moaCalled = false;
    const moaRunner = async () => {
      moaCalled = true;
      return {
        approved: true,
        degraded: false,
        findings: [],
        votes: [],
        aggregatorSummary: null,
      };
    };
    const runStep = async ({ step }: { step: { role: string } }) =>
      step.role === 'reviewer'
        ? { code: 0, output: 'APPROVED', approved: true }
        : { code: 0, output: 'artifact' };
    const gateRunner = () => ({ status: 0 });
    const code = await main(
      ['--phase', 'production', '--task', 'untangle race condition in worker pool'],
      {},
      io as never,
      {
        routing: fullRouting,
        brain: 'stub',
        soul: '',
        runStep,
        moaRunner,
        gateRunner,
        writeRunLedger: null,
      }
    );
    expect(code).toBe(0);
    expect(moaCalled).toBe(true);
  });
});

describe('model-routing.json v3 integrity', () => {
  // Server test setup mocks named fs exports; default export remains real.
  const real = JSON.parse(
    fs.readFileSync(new URL('../../../.claude/hermes/model-routing.json', import.meta.url), 'utf8')
  );

  test('every tier model has a commands entry', () => {
    for (const tier of Object.values(real.tiers) as Array<{
      modelByPhase?: Record<string, string>;
    }>) {
      for (const model of Object.values(tier.modelByPhase ?? {})) {
        expect(real.commands[model]).toBeDefined();
      }
    }
  });

  test('every MOA reviewer and aggregator has a commands entry', () => {
    const models = [
      ...real.moaReview.reviewers.map((reviewer: { model: string }) => reviewer.model),
      ...real.moaReview.strictReviewers.map((reviewer: { model: string }) => reviewer.model),
      real.moaReview.aggregator,
    ];
    for (const model of models) {
      expect(real.commands[model]).toBeDefined();
    }
  });

  test('every MOA reviewer has non-empty model and lens fields', () => {
    const reviewers = [...real.moaReview.reviewers, ...real.moaReview.strictReviewers] as Array<{
      model: unknown;
      lens: unknown;
    }>;

    for (const reviewer of reviewers) {
      expect(typeof reviewer.model).toBe('string');
      expect((reviewer.model as string).trim()).not.toBe('');
      expect(typeof reviewer.lens).toBe('string');
      expect((reviewer.lens as string).trim()).not.toBe('');
    }
  });

  test('every manualFlags entry parses to its model', () => {
    for (const [flag, model] of Object.entries(real.manualFlags)) {
      expect(parseArgs([flag, '--task', 'demo']).manualModel).toBe(model);
    }
  });

  test('T3 resolves to moa-strict review with a valid gate', () => {
    const plan = createRoutingPlan({
      phase: 'production',
      task: 'plain task',
      routing: real,
      explicitTier: 'T3',
    });

    expect(plan.tier.name).toBe('T3');
    expect(plan.review).toBe('moa-strict');
    expect(plan.gate).toEqual(expect.stringMatching(/\S/));
  });
});
