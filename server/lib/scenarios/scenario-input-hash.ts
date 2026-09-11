import { createHash } from 'node:crypto';
import {
  canonicalScenarioInputString,
  canonicalCapitalScenarioInputString,
  type CapitalScenarioInputHashEnvelope,
  type ScenarioInputHashEnvelope,
} from '@shared/lib/scenarios/scenario-input-envelope';
import { sha256CanonicalJson } from '@shared/lib/canonical-json';

export function createScenarioInputHash(envelope: ScenarioInputHashEnvelope): string {
  return createHash('sha256').update(canonicalScenarioInputString(envelope)).digest('hex');
}

export function createCapitalScenarioInputHash(envelope: CapitalScenarioInputHashEnvelope): string {
  const canonical = canonicalCapitalScenarioInputString(envelope);
  for (const variant of envelope.variants) {
    const bundle = variant.override.payload.sourceBundle;
    if (sha256CanonicalJson(bundle.projection) !== bundle.sourceBundleHash) {
      throw new TypeError('Capital source projection hash is inconsistent');
    }
  }
  return createHash('sha256').update(canonical).digest('hex');
}
