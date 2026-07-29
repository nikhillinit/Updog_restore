import { Buffer } from 'node:buffer';
import { EventEmitter } from 'node:events';
import process from 'node:process';

import { describe, expect, it, vi } from 'vitest';

import {
  executeModel,
  executeModelCapture,
  forwardTerminationSignal,
  killProcessTree,
  prepareRelaunchCleanup,
  scrubSecrets,
  writeRunLedger,
} from '../../../orchestrate.js';

function makeRouting() {
  return {
    commands: {
      claude: {
        // Absolute path with a separator makes commandExists() resolve via
        // existsSync (deterministic, no real subprocess) instead of which/where.
        defaultBin: process.execPath,
        binEnv: 'CLAUDE_BIN',
        args: [],
        promptDelivery: 'stdin',
      },
    },
  };
}

function createFakeChild() {
  const child = new EventEmitter();
  child.pid = 4242;
  child.stdin = { write: vi.fn(), end: vi.fn() };
  child.stdout = new EventEmitter();
  child.kill = vi.fn();
  return child;
}

describe('killProcessTree', () => {
  it('sends SIGKILL to the negative pid (process group) on POSIX', () => {
    const kill = vi.fn();
    killProcessTree({ pid: 555 }, { platform: 'darwin', kill });
    expect(kill).toHaveBeenCalledWith(-555, 'SIGKILL');
  });

  it('falls back to child.kill if the process-group kill throws (group already gone)', () => {
    const kill = vi.fn(() => {
      throw new Error('ESRCH');
    });
    const childKill = vi.fn();
    killProcessTree({ pid: 555, kill: childKill }, { platform: 'darwin', kill });
    expect(childKill).toHaveBeenCalledWith('SIGKILL');
  });

  it('shells out to taskkill /T /F on win32', () => {
    const spawnSyncImpl = vi.fn();
    killProcessTree({ pid: 555 }, { platform: 'win32', spawnSyncImpl });
    expect(spawnSyncImpl).toHaveBeenCalledWith(
      'taskkill',
      ['/pid', '555', '/T', '/F'],
      expect.any(Object)
    );
  });

  it('does nothing when given a child with no pid', () => {
    const kill = vi.fn();
    killProcessTree(null, { kill });
    killProcessTree({}, { kill });
    expect(kill).not.toHaveBeenCalled();
  });
});

describe('executeModel', () => {
  it('does not kill the process or misfire when the model completes normally', async () => {
    vi.useFakeTimers();
    const child = createFakeChild();
    const spawnImpl = vi.fn(() => child);
    const killTree = vi.fn();
    const routing = makeRouting();

    try {
      const promise = executeModel(
        'claude',
        'hello',
        routing,
        {},
        {
          spawn: spawnImpl,
          killTree,
        }
      );
      const completion = expect(promise).resolves.toBe(0);

      await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
      child.emit('close', 0);

      await completion;
      expect(killTree).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('executeModelCapture', () => {
  it('captures stdout and resolves {code, output}', async () => {
    const child = createFakeChild();
    const spawnImpl = vi.fn(() => child);
    const routing = makeRouting();

    const promise = executeModelCapture(
      'claude',
      'hello',
      routing,
      {},
      {
        spawn: spawnImpl,
      }
    );
    child.stdout.emit('data', Buffer.from('partial '));
    child.stdout.emit('data', Buffer.from('output'));
    child.emit('close', 0);

    await expect(promise).resolves.toEqual({ code: 0, output: 'partial output' });
  });
});

describe('forwardTerminationSignal', () => {
  it.each([
    ['SIGINT', 130],
    ['SIGTERM', 143],
  ])('forwards %s to the registered model process tree and exits', async (signal, exitCode) => {
    const child = createFakeChild();
    const spawnImpl = vi.fn(() => child);
    const routing = makeRouting();
    const killTree = vi.fn();
    const exit = vi.fn();
    const modelRun = executeModel('claude', 'hello', routing, {}, { spawn: spawnImpl });

    forwardTerminationSignal(signal, { killTree, exit });

    expect(killTree).toHaveBeenCalledWith(child);
    expect(exit).toHaveBeenCalledWith(exitCode);
    child.emit('close', 0);
    await modelRun;
  });

  it('forwards termination to every concurrently registered model process tree', async () => {
    const firstChild = createFakeChild();
    const secondChild = createFakeChild();
    const spawnImpl = vi
      .fn()
      .mockImplementationOnce(() => firstChild)
      .mockImplementationOnce(() => secondChild);
    const routing = makeRouting();
    const killTree = vi.fn();
    const exit = vi.fn();
    const firstRun = executeModel('claude', 'first', routing, {}, { spawn: spawnImpl });
    const secondRun = executeModel('claude', 'second', routing, {}, { spawn: spawnImpl });

    forwardTerminationSignal('SIGTERM', { killTree, exit });

    expect(killTree).toHaveBeenCalledTimes(2);
    expect(killTree).toHaveBeenCalledWith(firstChild);
    expect(killTree).toHaveBeenCalledWith(secondChild);
    expect(exit).toHaveBeenCalledWith(143);
    firstChild.emit('close', 0);
    secondChild.emit('close', 0);
    await Promise.all([firstRun, secondRun]);
  });
});

describe('prepareRelaunchCleanup', () => {
  it('requests SIGTERM from a live prior orchestrator and overwrites the PID file', () => {
    const pidFile = '/repo/ai-logs/hermes/orchestrate.pid';
    const writes = [];
    const fs = {
      existsSync: vi.fn((file) => file === pidFile),
      mkdirSync: vi.fn(),
      readFileSync: vi.fn(() => '1234\n'),
      writeFileSync: vi.fn((file, content) => writes.push([file, content])),
    };
    const isProcessAlive = vi.fn(() => true);
    const killTree = vi.fn();
    const signalProcess = vi.fn();

    const result = prepareRelaunchCleanup({
      root: '/repo',
      fs,
      isProcessAlive,
      killTree,
      signalProcess,
      currentPid: 5678,
    });

    expect(result).toBe(pidFile);
    expect(isProcessAlive).toHaveBeenCalledWith(1234);
    expect(signalProcess).toHaveBeenCalledWith(1234, 'SIGTERM');
    expect(killTree).not.toHaveBeenCalled();
    expect(fs.mkdirSync).toHaveBeenCalledWith('/repo/ai-logs/hermes', { recursive: true });
    expect(writes).toEqual([[pidFile, '5678\n']]);
  });

  it('kills a live prior orchestrator process tree on win32', () => {
    const pidFile = '/repo/ai-logs/hermes/orchestrate.pid';
    const writes = [];
    const fs = {
      existsSync: vi.fn((file) => file === pidFile),
      mkdirSync: vi.fn(),
      readFileSync: vi.fn(() => '1234\n'),
      writeFileSync: vi.fn((file, content) => writes.push([file, content])),
    };
    const isProcessAlive = vi.fn(() => true);
    const killTree = vi.fn();
    const signalProcess = vi.fn();

    const result = prepareRelaunchCleanup({
      root: '/repo',
      fs,
      isProcessAlive,
      killTree,
      signalProcess,
      currentPid: 5678,
      platform: 'win32',
    });

    expect(result).toBe(pidFile);
    expect(isProcessAlive).toHaveBeenCalledWith(1234);
    expect(killTree).toHaveBeenCalledWith({ pid: 1234 });
    expect(signalProcess).not.toHaveBeenCalled();
    expect(fs.mkdirSync).toHaveBeenCalledWith('/repo/ai-logs/hermes', { recursive: true });
    expect(writes).toEqual([[pidFile, '5678\n']]);
  });

  it.each([
    {
      operation: 'create the PID directory',
      fs: {
        mkdirSync: () => {
          throw new Error('read-only directory');
        },
      },
    },
    {
      operation: 'write the current PID',
      fs: {
        existsSync: () => false,
        mkdirSync: () => undefined,
        readFileSync: () => '',
        writeFileSync: () => {
          throw new Error('read-only PID file');
        },
      },
    },
  ])('treats inability to $operation as best-effort cleanup', ({ fs }) => {
    expect(() =>
      prepareRelaunchCleanup({
        root: '/repo',
        fs,
        currentPid: 5678,
      })
    ).not.toThrow();
  });
});

describe('scrubSecrets', () => {
  it('redacts an API-key-shaped token embedded in free text', () => {
    const input = {
      task: 'call the model using sk-ant-api03-abcdefghijklmnopqrstuvwxyz1234567890',
    };
    const result = scrubSecrets(input);
    expect(result.task).not.toContain('sk-ant-api03-abcdefghijklmnopqrstuvwxyz1234567890');
    expect(result.task).toContain('[REDACTED]');
  });

  it('redacts key=value style secrets nested inside an object', () => {
    const input = { plan: { env: { note: 'export API_KEY=supersecretvalue123' } } };
    const result = scrubSecrets(input);
    expect(result.plan.env.note).not.toContain('supersecretvalue123');
  });

  it('redacts JSON-quoted key:value secrets', () => {
    const input = { task: 'dispatch with {"token":"obviouslyfakesecretvalue123"}' };
    const result = scrubSecrets(input);
    expect(result.task).not.toContain('obviouslyfakesecretvalue123');
    expect(result.task).toContain('[REDACTED]');
  });

  it('redacts a complete JSON-quoted secret containing an escaped quote', () => {
    const input = {
      task: String.raw`dispatch with {"password":"obviouslyfakeprefix\"obviouslyfakesuffix"}`,
    };
    const result = scrubSecrets(input);

    expect(result.task).toBe(String.raw`dispatch with {"password":"[REDACTED]"}`);
  });

  it('leaves ordinary text and non-string values untouched', () => {
    const input = { runId: 'hermes-1', exitCode: 0, ok: true, note: 'fix xirr calculation' };
    const result = scrubSecrets(input);
    expect(result).toEqual(input);
  });
});

describe('writeRunLedger secret scrubbing', () => {
  it('does not write a raw API key to the ledger file', () => {
    let written = '';
    const fs = {
      mkdirSync: () => {},
      writeFileSync: (_file, content) => {
        written = content;
      },
    };

    writeRunLedger(
      { runId: 'test-run', plan: { task: 'use token sk-proj-abcdefghijklmnopqrstuvwx' } },
      { root: '/tmp/orchestrate-ledger-test', fs }
    );

    expect(written).not.toContain('sk-proj-abcdefghijklmnopqrstuvwx');
    expect(written).toContain('[REDACTED]');
  });
});
