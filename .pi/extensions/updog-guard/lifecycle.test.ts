// Run: node --experimental-strip-types --test .pi/extensions/updog-guard/lifecycle.test.ts

import assert from 'node:assert/strict';
import test from 'node:test';

import updogGuard from './index.ts';

type DirtyState = { status: string; fingerprint: string };

async function createHarness(initial: Record<string, DirtyState> = {}) {
  const handlers = new Map<string, (event: any, ctx: any) => Promise<any>>();
  const dirty = new Map(Object.entries(initial));
  const committedPaths: string[] = [];
  let head = 'a'.repeat(40);
  let failStatus = false;
  let toolInvocations = 0;

  const pi = {
    on(name: string, handler: (event: any, ctx: any) => Promise<any>) {
      handlers.set(name, handler);
    },
    getAllTools() {
      return [
        { name: 'grep', annotations: { readOnlyHint: true } },
        { name: 'bash', annotations: {} },
      ];
    },
    async exec(command: string, args: string[]) {
      if (command !== 'git') return { code: 1, stdout: '', stderr: 'unexpected command' };
      if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') {
        return { code: 0, stdout: process.cwd(), stderr: '' };
      }
      if (args[0] === 'rev-parse' && args[1] === 'HEAD') {
        return { code: 0, stdout: head, stderr: '' };
      }
      if (args[0] === 'status' && args.includes('-z')) {
        if (failStatus) return { code: 1, stdout: '', stderr: 'status unavailable' };
        const stdout = [...dirty.entries()]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([changedPath, state]) => `${state.status} ${changedPath}\0`)
          .join('');
        return { code: 0, stdout, stderr: '' };
      }
      if (args[0] === 'diff' && args.includes('--name-only')) {
        return { code: 0, stdout: committedPaths.join('\0'), stderr: '' };
      }
      if (args[0] === 'diff' || args[0] === 'hash-object') {
        const separator = args.lastIndexOf('--');
        const stdout = args
          .slice(separator + 1)
          .map((changedPath) => dirty.get(changedPath)?.fingerprint ?? '')
          .join('\n');
        return { code: 0, stdout, stderr: '' };
      }
      return { code: 0, stdout: '', stderr: '' };
    },
  };

  updogGuard(pi as any);
  const ctx = { cwd: process.cwd(), hasUI: false, ui: {} };
  await handlers.get('session_start')?.({}, ctx);

  return {
    dirty,
    committedPaths,
    set head(value: string) {
      head = value;
    },
    set failStatus(value: boolean) {
      failStatus = value;
    },
    get toolInvocations() {
      return toolInvocations;
    },
    async call(
      toolName: string,
      input: Record<string, unknown>,
      mutate?: () => void,
      isError = false
    ) {
      const toolCallId = `${toolName}-${toolInvocations + 1}`;
      const blocked = await handlers.get('tool_call')?.({ toolCallId, toolName, input }, ctx);
      if (blocked?.block) return blocked;
      toolInvocations++;
      mutate?.();
      await handlers.get('tool_result')?.(
        { toolCallId, toolName, input, isError, content: [], details: undefined },
        ctx
      );
      return undefined;
    },
    async settle() {
      return handlers.get('agent_before_settle')?.({ outcome: 'completed' }, ctx);
    },
  };
}

test('directory grep requires secret confirmation while explicit code files pass', async () => {
  for (const glob of [
    '.env',
    '**/.env',
    '.env*',
    '**/.env.*',
    '{.env,*.ts}',
    '[.]env',
    '!**/.env',
    '**/*.ts',
    'server/**/{*,.*}',
  ]) {
    const harness = await createHarness();
    const result = await harness.call('grep', { pattern: '.', path: '.', glob });
    assert.equal(result?.block, true, glob);
    assert.match(result.reason, /secret-read/);
    assert.equal(harness.toolInvocations, 0, glob);
  }

  const nested = await createHarness();
  assert.equal((await nested.call('grep', { pattern: '.', path: 'nested/.env' }))?.block, true);
  assert.equal(nested.toolInvocations, 0);

  const broad = await createHarness();
  assert.equal((await broad.call('grep', { pattern: '.', path: '.' }))?.block, true);
  assert.equal(broad.toolInvocations, 0);

  const directory = await createHarness();
  assert.equal((await directory.call('grep', { pattern: '.', path: 'server' }))?.block, true);
  assert.equal(directory.toolInvocations, 0);

  const code = await createHarness();
  assert.equal(
    await code.call('grep', { pattern: 'guard', path: '.pi/extensions/updog-guard/rules.ts' }),
    undefined
  );
  assert.equal(code.toolInvocations, 1);

  const missing = await createHarness();
  assert.equal(
    (await missing.call('grep', { pattern: '.', path: 'missing-directory' }))?.block,
    true
  );
  assert.equal(missing.toolInvocations, 0);
});

test('grep secret confirmation still honors the session kill switch', async () => {
  const previous = process.env.CLAUDE_HOOKS_DISABLE;
  process.env.CLAUDE_HOOKS_DISABLE = '1';
  try {
    const harness = await createHarness();
    assert.equal(
      await harness.call('grep', { pattern: '.', path: '.', glob: '**/.env' }),
      undefined
    );
    assert.equal(harness.toolInvocations, 1);
  } finally {
    if (previous === undefined) delete process.env.CLAUDE_HOOKS_DISABLE;
    else process.env.CLAUDE_HOOKS_DISABLE = previous;
  }
});

test('successful shell mutation arms reminder for clean and preexisting dirty financial paths', async () => {
  const financialPath = 'shared/lib/wizard-reserve.ts';
  const clean = await createHarness();
  await clean.call('bash', { command: 'npm run lint:fix' }, () => {
    clean.dirty.set(financialPath, { status: ' M', fingerprint: 'clean-to-dirty' });
  });
  assert.match(JSON.stringify(await clean.settle()), new RegExp(financialPath));

  const preexisting = await createHarness({
    [financialPath]: { status: ' M', fingerprint: 'before-shell' },
  });
  await preexisting.call('bash', { command: 'node scripts/generate.mjs' }, () => {
    preexisting.dirty.set(financialPath, { status: ' M', fingerprint: 'after-shell' });
  });
  assert.match(JSON.stringify(await preexisting.settle()), new RegExp(financialPath));
});

test('shell snapshots include staged and untracked financial path changes', async () => {
  const stagedPath = 'shared/core/staged.ts';
  const untrackedPath = 'client/src/core/generated.ts';
  const harness = await createHarness({
    [stagedPath]: { status: 'M ', fingerprint: 'staged-before' },
    [untrackedPath]: { status: '??', fingerprint: 'untracked-before' },
  });

  await harness.call('bash', { command: 'node scripts/generate.mjs' }, () => {
    harness.dirty.set(stagedPath, { status: 'M ', fingerprint: 'staged-after' });
    harness.dirty.set(untrackedPath, { status: '??', fingerprint: 'untracked-after' });
  });

  const reminder = JSON.stringify(await harness.settle());
  assert.match(reminder, new RegExp(stagedPath));
  assert.match(reminder, new RegExp(untrackedPath));
});

test('only a successful recognized truth run clears pending financial reminder', async () => {
  const financialPath = 'shared/lib/wizard-reserve.ts';
  const arm = async () => {
    const harness = await createHarness();
    await harness.call('bash', { command: 'npm run lint:fix' }, () => {
      harness.dirty.set(financialPath, { status: ' M', fingerprint: 'changed' });
    });
    return harness;
  };

  const successful = await arm();
  await successful.call('bash', { command: 'npm run phoenix:truth' });
  assert.equal(await successful.settle(), undefined);

  const failed = await arm();
  await failed.call('bash', { command: 'npm run phoenix:truth' }, undefined, true);
  assert.match(JSON.stringify(await failed.settle()), new RegExp(financialPath));

  const noOp = await arm();
  await noOp.call('bash', { command: 'echo phoenix:truth' });
  assert.match(JSON.stringify(await noOp.settle()), new RegExp(financialPath));
});

test('shell commits arm reminder even when financial paths become clean', async () => {
  const financialPath = 'shared/lib/wizard-reserve.ts';
  for (const initial of [{}, { [financialPath]: { status: ' M', fingerprint: 'before' } }]) {
    const harness = await createHarness(initial);
    await harness.call('bash', { command: 'node scripts/generate.mjs' }, () => {
      harness.dirty.clear();
      harness.head = 'b'.repeat(40);
      harness.committedPaths.push(financialPath);
    });
    assert.match(JSON.stringify(await harness.settle()), new RegExp(financialPath));
  }

  const docs = await createHarness();
  await docs.call('bash', { command: 'node scripts/generate.mjs' }, () => {
    docs.head = 'b'.repeat(40);
    docs.committedPaths.push('README.md');
  });
  assert.equal(await docs.settle(), undefined);
});

test('incomplete before snapshots cannot silently lose financial reminders', async () => {
  const unavailable = await createHarness();
  unavailable.failStatus = true;
  await unavailable.call('bash', { command: 'node scripts/generate.mjs' }, () => {
    unavailable.failStatus = false;
  });
  assert.match(JSON.stringify(await unavailable.settle()), /financial state unavailable/);

  const initial = Object.fromEntries(
    Array.from({ length: 65 }, (_, index) => [
      `shared/core/generated-${index}.ts`,
      { status: ' M', fingerprint: String(index) },
    ])
  );
  const overflow = await createHarness(initial);
  await overflow.call('bash', { command: 'node scripts/generate.mjs' }, () => {
    overflow.dirty.clear();
  });
  assert.match(JSON.stringify(await overflow.settle()), /shared\/core\/generated-/);
});
