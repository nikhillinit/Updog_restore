import { env, platform } from 'node:process';
import process from 'node:process';
import {
  analyzeDoctorQuick,
  analyzeDoctorShellEnvironment,
  emitDoctorResult,
} from './doctor-core.mjs';

const shellResult = analyzeDoctorShellEnvironment({ platform, env });
emitDoctorResult(shellResult);

if (!shellResult.ok) {
  process.exit(shellResult.exitCode);
}

const quickResult = analyzeDoctorQuick();
emitDoctorResult(quickResult);
process.exit(quickResult.exitCode);
