import { createHash } from 'node:crypto';
import {
  canonicalScenarioInputString,
  type ScenarioInputHashEnvelope,
} from '@shared/lib/scenarios/scenario-input-envelope';

export function createScenarioInputHash(envelope: ScenarioInputHashEnvelope): string {
  return createHash('sha256')
    .update(canonicalScenarioInputString(envelope))
    .digest('hex');
}
