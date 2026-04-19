import { describe, expect, it } from 'vitest';

import {
  CANONICAL_WINDOWS_DOCTOR_COMMAND,
  analyzeDoctorQuick,
  analyzeDoctorShellEnvironment,
} from '../../../scripts/doctor-core.mjs';

describe('doctor-core', () => {
  it('passes shell validation on non-Windows platforms', () => {
    const result = analyzeDoctorShellEnvironment({
      platform: 'linux',
      env: {},
    });

    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.stdoutLines.join('\n')).toContain(
      'non-Windows platform - shell validation skipped'
    );
  });

  it('fails shell validation in Git Bash and points to the canonical command', () => {
    const result = analyzeDoctorShellEnvironment({
      platform: 'win32',
      env: {
        SHELL: 'C:/Program Files/Git/bin/bash.exe',
        COMSPEC: 'C:\\Windows\\System32\\cmd.exe',
      },
      cwd: 'C:\\dev\\Updog_restore',
    });

    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(2);
    expect(result.stderrLines.join('\n')).toContain('PROBLEM: Running in Git Bash');
    expect(result.stderrLines.join('\n')).toContain(CANONICAL_WINDOWS_DOCTOR_COMMAND);
  });

  it('fails shell validation in WSL with a WSL-specific message', () => {
    const result = analyzeDoctorShellEnvironment({
      platform: 'win32',
      env: {
        SHELL: '/bin/bash',
        WSL_DISTRO_NAME: 'Ubuntu',
        COMSPEC: 'C:\\Windows\\System32\\cmd.exe',
      },
      cwd: 'C:\\dev\\Updog_restore',
    });

    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(2);
    expect(result.stderrLines.join('\n')).toContain('PROBLEM: Running in WSL');
    expect(result.stderrLines.join('\n')).toContain(CANONICAL_WINDOWS_DOCTOR_COMMAND);
  });

  it('fails shell validation when required Windows env vars are missing', () => {
    const result = analyzeDoctorShellEnvironment({
      platform: 'win32',
      env: {
        COMSPEC: 'C:\\Windows\\System32\\cmd.exe',
        SHELL: '',
      },
    });

    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(2);
    expect(result.stderrLines.join('\n')).toContain('missing Windows environment prerequisites');
    expect(result.stderrLines.join('\n')).toContain('USERPROFILE');
    expect(result.stderrLines.join('\n')).toContain(CANONICAL_WINDOWS_DOCTOR_COMMAND);
  });

  it('passes shell validation when Windows env prerequisites are present', () => {
    const env = {
      SHELL: '',
      COMSPEC: 'C:\\Windows\\System32\\cmd.exe',
      SystemRoot: 'C:\\Windows',
      windir: 'C:\\Windows',
      ProgramData: 'C:\\ProgramData',
      ALLUSERSPROFILE: 'C:\\ProgramData',
      USERPROFILE: 'C:\\Users\\nikhi',
      APPDATA: 'C:\\Users\\nikhi\\AppData\\Roaming',
      LOCALAPPDATA: 'C:\\Users\\nikhi\\AppData\\Local',
      TEMP: 'C:\\Users\\nikhi\\AppData\\Local\\Temp',
      TMP: 'C:\\Users\\nikhi\\AppData\\Local\\Temp',
    };

    const result = analyzeDoctorShellEnvironment({
      platform: 'win32',
      env,
    });

    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.stdoutLines.join('\n')).toContain(
      'shell environment is correct for Windows npm workflows'
    );
  });

  it('passes quick check when all required modules resolve', () => {
    const result = analyzeDoctorQuick({
      resolveModule: () => '/fake/module/path.js',
    });

    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.stdoutLines).toEqual(['doctor:quick PASS: core modules OK']);
  });

  it('fails quick check when one or more required modules do not resolve', () => {
    const result = analyzeDoctorQuick({
      resolveModule: (moduleName) => {
        if (moduleName === 'vite') {
          throw new Error('missing vite');
        }

        return '/fake/module/path.js';
      },
    });

    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.stderrLines.join('\n')).toContain('missing core modules: vite');
  });
});
