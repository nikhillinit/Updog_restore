import { describe, it } from 'vitest';

const skipIt = it.skip;
const skipDescribe = describe.skip;

export type QuarantineReason =
  | 'flaky-timing'
  | 'bad-mock'
  | 'changed-feature'
  | 'race-condition'
  | 'env-dependent'
  | 'orphaned'
  | 'requires-real-db'
  | 'contract-drift';

export interface QuarantineTag {
  reason: QuarantineReason;
  owner: string;
  issue: `#${number}`;
  exitCriteria: string;
  quarantinedAt: `${number}-${number}-${number}`;
  slaDays?: number;
}

function formatTag(tag: QuarantineTag) {
  return `[Q:${tag.reason}] owner=${tag.owner} issue=${tag.issue} exit="${tag.exitCriteria}"`;
}

export function itQuarantined(name: string, tag: QuarantineTag, fn: Parameters<typeof it.skip>[1]) {
  // SKIP: helper intentionally wraps quarantined cases with structured metadata.
  return skipIt(`${formatTag(tag)} ${name}`, fn);
}

export function describeQuarantined(
  name: string,
  tag: QuarantineTag,
  fn: Parameters<typeof describe.skip>[1]
) {
  // SKIP: helper intentionally wraps quarantined suites with structured metadata.
  return skipDescribe(`${formatTag(tag)} ${name}`, fn);
}
