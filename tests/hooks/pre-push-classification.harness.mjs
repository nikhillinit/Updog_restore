import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { URL } from 'node:url';

import {
  DOCS_ONLY_CLASSIFICATION,
  FULL_RUN_CLASSIFICATION,
  TARGETED_CLASSIFICATION,
  classifyChangedFiles,
} from '../../scripts/pre-push-classification.mjs';

const classification = classifyChangedFiles(['server/routes/funds.ts']);
const hookSource = await readFile(new URL('../../.husky/pre-push', import.meta.url), 'utf8');

assert.equal(classification, TARGETED_CLASSIFICATION);
assert.notEqual(classification, DOCS_ONLY_CLASSIFICATION);
assert.notEqual(classification, FULL_RUN_CLASSIFICATION);
assert.match(
  hookSource,
  /CLASSIFICATION=\$\(printf '%s\\n' "\$CHANGED" \| node scripts\/pre-push-classification\.mjs\)/
);
assert.match(hookSource, /docs-only-skip\)/);
assert.match(hookSource, /full-run\|type-fix-only-skip\|targeted\)/);
assert.match(hookSource, /if \[ "\$CLASSIFICATION" = "full-run" \]; then/);
assert.match(hookSource, /if \[ "\$CLASSIFICATION" = "type-fix-only-skip" \]; then/);
assert.match(
  hookSource,
  /npx vitest related "\$\{CHANGED_FILES\[@\]\}" --run --project=server --project=client/
);

process.stdout.write(
  'PASS: server/routes/funds.ts classifies to the live targeted vitest related hook branch.\n'
);
