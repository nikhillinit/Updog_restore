import process from 'node:process';
import { emitDoctorResult, analyzeDoctorQuick } from './doctor-core.mjs';

const result = analyzeDoctorQuick();
emitDoctorResult(result);
process.exit(result.exitCode);
