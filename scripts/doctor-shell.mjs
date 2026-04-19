import { env, platform } from 'node:process';
import process from 'node:process';
import {
  analyzeDoctorShellEnvironment,
  emitDoctorResult,
} from './doctor-core.mjs';

const result = analyzeDoctorShellEnvironment({ platform, env });
emitDoctorResult(result);
process.exit(result.exitCode);
