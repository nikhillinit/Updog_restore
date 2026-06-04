import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { URL } from 'node:url';

import {
  DOCS_ONLY_CLASSIFICATION,
  FULL_RUN_CLASSIFICATION,
  TARGETED_CLASSIFICATION,
  TYPE_FIX_ONLY_CLASSIFICATION,
  classifyChangedFiles,
} from '../../scripts/pre-push-classification.mjs';

const targetedClassification = classifyChangedFiles(['server/routes/funds.ts']);
const docsClassification = classifyChangedFiles(['docs/governance/cleanup-manifest.md']);
const fullRunClassification = classifyChangedFiles(['package.json']);
const typeFixClassification = classifyChangedFiles(['client/src/components/ErrorBoundary.tsx']);
const hookSource = await readFile(new URL('../../.husky/pre-push', import.meta.url), 'utf8');
const prePushScriptSource = await readFile(
  new URL('../../scripts/pre-push.mjs', import.meta.url),
  'utf8'
);

assert.equal(targetedClassification, TARGETED_CLASSIFICATION);
assert.notEqual(targetedClassification, DOCS_ONLY_CLASSIFICATION);
assert.notEqual(targetedClassification, FULL_RUN_CLASSIFICATION);
assert.equal(docsClassification, DOCS_ONLY_CLASSIFICATION);
assert.equal(fullRunClassification, FULL_RUN_CLASSIFICATION);
assert.equal(typeFixClassification, TYPE_FIX_ONLY_CLASSIFICATION);
assert.match(hookSource, /exec node scripts\/pre-push\.mjs "\$@"/);
assert.match(prePushScriptSource, /output\('node', \['scripts\/pre-push-classification\.mjs'\]/);
assert.match(prePushScriptSource, /case 'docs-only-skip':/);
assert.match(
  prePushScriptSource,
  /case 'full-run':\s+case 'type-fix-only-skip':\s+case 'targeted':/
);
assert.match(prePushScriptSource, /if \(classification === 'full-run'\) {/);
assert.match(prePushScriptSource, /if \(classification === 'type-fix-only-skip'\) {/);
assert.match(prePushScriptSource, /'vitest',\s+'related'/);
assert.match(prePushScriptSource, /'--project=server'/);
assert.match(prePushScriptSource, /'--project=client'/);

process.stdout.write(
  'PASS: pre-push hook delegates to the Node classifier and preserves live classification branches.\n'
);
