/** Node facade: retain existing callers and the canonical synchronous hash backend. */
import { sha256CanonicalJson } from '../canonical-json';
import * as core from './source-materialization-core';

export type {
  CapitalRawSource,
  CapitalMaterializationResult,
  CapitalSourcePreviewInspection,
} from './source-materialization-core';

export function fingerprintCapitalSource(source: core.CapitalRawSource) {
  return core.fingerprintCapitalSource(source, sha256CanonicalJson);
}

export function inspectCapitalSourcePreview(source: core.CapitalRawSource) {
  return core.inspectCapitalSourcePreview(source, sha256CanonicalJson);
}

export function materializeCapitalSource(
  args: Parameters<typeof core.materializeCapitalSource>[0]
) {
  return core.materializeCapitalSource(args, sha256CanonicalJson);
}

export function verifyPinnedCapitalSourceBundle(
  args: Parameters<typeof core.verifyPinnedCapitalSourceBundle>[0]
) {
  return core.verifyPinnedCapitalSourceBundle(args, sha256CanonicalJson);
}
