import { describe, expect, test } from 'vitest';

import { buildDoctorReport } from '../../../orchestrate.js';

describe('Hermes doctor report', () => {
  test('resolves configured CLI bins from env overrides and defaults', () => {
    const routing = {
      commands: {
        claude: {
          binEnv: 'CLAUDE_CODE_BIN',
          defaultBin: 'claude',
        },
        codex: {
          binEnv: 'CODEX_BIN',
          defaultBin: 'codex',
        },
        kimi: {
          binEnv: 'KIMI_CODE_BIN',
          defaultBin: 'kimi-cli',
        },
      },
    };
    const env = {
      CLAUDE_CODE_BIN: 'claude-local',
      KIMI_CODE_BIN: 'kimi-custom',
    };

    const report = buildDoctorReport({
      routing,
      env,
      providers: ['claude', 'codex', 'kimi-cli', 'gemini', 'agy'],
      commandExists: (bin: string) => ['claude-local', 'codex', 'kimi-custom'].includes(bin),
    });

    expect(report).toEqual([
      { provider: 'claude', bin: 'claude-local', source: 'env:CLAUDE_CODE_BIN', found: true },
      { provider: 'codex', bin: 'codex', source: 'default', found: true },
      { provider: 'kimi-cli', bin: 'kimi-custom', source: 'env:KIMI_CODE_BIN', found: true },
      { provider: 'gemini', bin: 'gemini', source: 'default', found: false },
      { provider: 'agy', bin: 'agy', source: 'default', found: false },
    ]);
  });

  test('resolves gemini and agy bins from configured commands and env overrides', () => {
    const routing = {
      commands: {
        gemini: { binEnv: 'GEMINI_BIN', defaultBin: 'gemini' },
        agy: { binEnv: 'AGY_BIN', defaultBin: 'agy' },
      },
    };

    const report = buildDoctorReport({
      routing,
      env: { GEMINI_BIN: 'gemini-local' },
      providers: ['gemini', 'agy'],
      commandExists: (bin: string) => bin === 'gemini-local',
    });

    expect(report).toEqual([
      { provider: 'gemini', bin: 'gemini-local', source: 'env:GEMINI_BIN', found: true },
      { provider: 'agy', bin: 'agy', source: 'default', found: false },
    ]);
  });
});
