/* global console */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
const require = createRequire(import.meta.url);
const repository = path.resolve(import.meta.dirname, '../../..');
const scriptPath = path.join(repository, 'scripts/typescript-baseline.cjs');
const scriptSource = fs.readFileSync(scriptPath, 'utf8');
const {
  checkBaseline,
  collectCurrentTypeScriptState,
} = require('../../../scripts/typescript-baseline.cjs');

function emptyBaseline() {
  return collectCurrentTypeScriptState(() => '').baseline;
}

function loadScriptWithCompiler(execSync, command, baseline) {
  const loadedModule = { exports: {} };
  const processMock = {
    argv: ['node', scriptPath, command],
    env: { GITHUB_WORKSPACE: repository },
    exitCode: 0,
  };
  const writeFileSync = vi.fn();
  const requireMock = name => {
    if (name === 'child_process') return { execSync };
    if (name === 'fs') return {
      ...fs,
      readFileSync(file, ...args) {
        if (baseline && String(file).endsWith('.tsc-baseline.json')) {
          return JSON.stringify(baseline);
        }
        return fs.readFileSync(file, ...args);
      },
      writeFileSync,
    };
    return require(name);
  };
  requireMock.main = command ? loadedModule : undefined;

  vm.runInNewContext(scriptSource, {
    module: loadedModule,
    exports: loadedModule.exports,
    __dirname: path.dirname(scriptPath),
    process: processMock,
    console: { log() {}, error() {}, warn() {} },
    require: requireMock,
  }, { filename: scriptPath });

  return { exports: loadedModule.exports, processMock, writeFileSync };
}

describe('TypeScript baseline collection', () => {
  it('parses baseline data and detailed errors from one compiler collection', () => {
    const runCompiler = vi.fn(
      () =>
        'server/example.ts(1,7): error TS2322: Type string is not assignable to number.\n'
    );
    const state = collectCurrentTypeScriptState(runCompiler);
    expect(runCompiler).toHaveBeenCalledTimes(1);
    expect(state.errors).toHaveLength(1);
    expect(state.errors[0]).toMatchObject({
      code: '2322',
      line: 1,
      col: 7,
    });
    expect(state.baseline.totalErrors).toBe(1);
    expect(state.compilerFailures).toEqual([]);
  });

  it.each([
    ['missing compiler', { message: 'spawn npx ENOENT', code: 'ENOENT' }],
    ['empty failed output', { status: 1, stdout: '' }],
    ['fatal text', { status: 1, stdout: 'fatal: synthetic compiler process failure\n' }],
    ['unexpected exit with diagnostics', {
      status: 3,
      stdout: 'server/example.ts(1,7): error TS2322: synthetic diagnostic.\n',
    }],
    ['signal after diagnostics', {
      status: null,
      signal: 'SIGTERM',
      stdout: 'server/example.ts(1,7): error TS2322: synthetic diagnostic.\n',
    }],
    ['out of memory after diagnostics', {
      status: 137,
      stdout: 'server/example.ts(1,7): error TS2322: synthetic diagnostic.\n',
    }],
  ])('fails closed for %s', (_label, failure) => {
    const execSync = vi.fn(() => { throw Object.assign(new Error(failure.message), failure); });
    const loaded = loadScriptWithCompiler(execSync);
    const state = loaded.exports.collectCurrentTypeScriptState();
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(execSync).toHaveBeenCalledTimes(3);
    expect(state.compilerFailures).toHaveLength(3);
    expect(loaded.exports.checkBaseline({
      baseline: emptyBaseline(),
      collectState: () => state,
    })).toBe(1);
  });

  it.each(['save', 'progress'])('propagates compiler failure from %s command', command => {
    const execSync = vi.fn(() => {
      throw Object.assign(new Error('synthetic compiler failure'), { status: 1, stdout: '' });
    });
    const loaded = loadScriptWithCompiler(execSync, command);

    expect(execSync).toHaveBeenCalledTimes(3);
    expect(loaded.processMock.exitCode).toBe(1);
    expect(loaded.writeFileSync).not.toHaveBeenCalled();
  });

  it('does not let diagnostics from another project hide a compiler failure', () => {
    const diagnostic =
      'server/example.ts(1,7): error TS2322: Type string is not assignable to number.\n';
    const execSync = vi.fn()
      .mockImplementationOnce(() => {
        throw Object.assign(new Error('TypeScript diagnostics'), { status: 1, stdout: diagnostic });
      })
      .mockImplementationOnce(() => {
        throw Object.assign(new Error('fatal compiler failure'), { status: 1, stdout: 'fatal\n' });
      })
      .mockReturnValueOnce('');
    const loaded = loadScriptWithCompiler(execSync);
    const state = loaded.exports.collectCurrentTypeScriptState();
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(state.errors).toHaveLength(1);
    expect(state.compilerFailures).toHaveLength(1);
    expect(loaded.exports.checkBaseline({
      baseline: emptyBaseline(),
      collectState: () => state,
    })).toBe(1);
  });

  it.each([1, 2])(
    'preserves baseline handling for TypeScript diagnostic exit %s',
    status => {
      const output =
        'server/example.ts(1,7): error TS2322: Type string is not assignable to number.\n';
      const state = collectCurrentTypeScriptState(() => ({
        output,
        failures: [{ project: 'server', output, status, signal: null }],
      }));
      vi.spyOn(console, 'log').mockImplementation(() => {});

      expect(state.compilerFailures).toEqual([]);
      expect(checkBaseline({ baseline: state.baseline, collectState: () => state })).toBe(0);
      expect(checkBaseline({ baseline: emptyBaseline(), collectState: () => state })).toBe(1);
    }
  );

  it.each(
    [1, 2].flatMap(status =>
      ['check', 'save', 'progress'].map(command => [status, command])
    )
  )(
    'fails %s diagnostic exit for mixed handled and unhandled diagnostics in %s',
    (status, command) => {
      const positioned =
        "server/tsconfig.json(6,15): error TS5110: Option 'module' must be set to 'NodeNext' when option 'moduleResolution' is set to 'NodeNext'.\n";
      const mixed =
        "error TS2688: Cannot find type definition file for 'missing-types'.\n" +
        "  The file is in the program because:\n" +
        "    Entry point of type library 'missing-types' specified in compilerOptions\n" +
        positioned;
      const compiler = output => vi.fn(command => {
        if (!command.includes('tsconfig.server.json')) return '';
        throw Object.assign(new Error('TypeScript diagnostics'), {
          status,
          signal: null,
          stdout: output,
        });
      });
      const known = loadScriptWithCompiler(compiler(positioned));
      const baseline = known.exports.collectCurrentTypeScriptState().baseline;
      const loaded = loadScriptWithCompiler(compiler(mixed), command, baseline);

      expect(loaded.processMock.exitCode).toBe(1);
      expect(loaded.writeFileSync).not.toHaveBeenCalled();
    }
  );

  it('accepts a clean compiler result', () => {
    const state = collectCurrentTypeScriptState(() => ({ output: '', failures: [] }));
    vi.spyOn(console, 'log').mockImplementation(() => {});

    expect(checkBaseline({ baseline: state.baseline, collectState: () => state })).toBe(0);
  });

  it('checks a supplied baseline with one current-state collection', () => {
    const collectState = vi.fn(() => ({
      baseline: {
        version: '2.0.0',
        projects: {
          client: { errors: [], total: 0, lastUpdated: '2026-07-30T00:00:00.000Z' },
          server: { errors: [], total: 0, lastUpdated: '2026-07-30T00:00:00.000Z' },
          shared: { errors: [], total: 0, lastUpdated: '2026-07-30T00:00:00.000Z' },
        },
        totalErrors: 0,
        timestamp: '2026-07-30T00:00:00.000Z',
        buildMode: 'per-project',
        elapsedMs: 1,
      },
      errors: [],
    }));
    const baseline = collectState().baseline;
    collectState.mockClear();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(checkBaseline({ baseline, collectState })).toBe(0);
    expect(collectState).toHaveBeenCalledTimes(1);
  });
});
