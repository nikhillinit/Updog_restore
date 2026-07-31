import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  DOCS_ONLY_CLASSIFICATION,
  FULL_RUN_CLASSIFICATION,
  NO_CHANGES_CLASSIFICATION,
  TARGETED_CLASSIFICATION,
  classifyChangedFiles,
} from '../../../scripts/pre-push-classification.mjs';
describe('pre-push changed-file classification', () => {
  it.each([
    [[], NO_CHANGES_CLASSIFICATION],
    [['docs/governance/cleanup-manifest.md'], DOCS_ONLY_CLASSIFICATION],
    [['CHANGELOG.md'], DOCS_ONLY_CLASSIFICATION],
    [['vitest.config.mjs'], FULL_RUN_CLASSIFICATION],
    [['vitest.config.int.ts'], FULL_RUN_CLASSIFICATION],
    [['vitest.config.testcontainers.ts'], FULL_RUN_CLASSIFICATION],
    [['tsconfig.client.json'], FULL_RUN_CLASSIFICATION],
    [['tsconfig.server.json'], FULL_RUN_CLASSIFICATION],
    [['.github/workflows/ci-unified.yml'], FULL_RUN_CLASSIFICATION],
    [['.github/path-filters.yml'], FULL_RUN_CLASSIFICATION],
    [['docker-compose.yml'], FULL_RUN_CLASSIFICATION],
    [['client/src/components/ErrorBoundary.tsx'], TARGETED_CLASSIFICATION],
    [['config/tooling.yaml'], TARGETED_CLASSIFICATION],
    [['config/tooling.toml'], TARGETED_CLASSIFICATION],
    [['server/routes/funds.ts'], TARGETED_CLASSIFICATION],
  ])('classifies %j as %s', (files, expected) => {
    expect(classifyChangedFiles(files)).toBe(expected);
  });
  it('lets a full-run file override a mixed documentation diff', () => {
    expect(
      classifyChangedFiles(['docs/readme.md', '.github/workflows/ci-unified.yml'])
    ).toBe(FULL_RUN_CLASSIFICATION);
  });
  it('keeps the pre-push hook wired to the classifier and Vitest related mode', async () => {
    const source = await readFile('scripts/pre-push.mjs', 'utf8');
    expect(source).toContain("['scripts/pre-push-classification.mjs']");
    expect(source).toContain("case 'docs-only-skip':");
    expect(source).toContain("case 'full-run':");
    expect(source).toContain("case 'targeted':");
    expect(source).toContain("'vitest',");
    expect(source).toContain("'related',");
    expect(source).toContain("'--run',");
  });
});
