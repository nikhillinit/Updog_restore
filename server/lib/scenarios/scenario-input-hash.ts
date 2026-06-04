import { createHash } from 'node:crypto';
import {
  canonicalScenarioInputString,
  type ScenarioInputHashEnvelopeV1,
} from '@shared/lib/scenarios/scenario-input-envelope';

export function createScenarioInputHash(
  envelope: ScenarioInputHashEnvelopeV1
): string {
  return createHash('sha256')
    .update(canonicalScenarioInputString(envelope))
    .digest('hex');
}
