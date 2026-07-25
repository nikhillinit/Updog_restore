// brace-expansion 5.0.8 fixes CVE-2026-14257 but its CommonJS entry exports an
// object. Older supported minimatch releases require that entry as a callable
// function. Keep the patched implementation while restoring the legacy
// callable shape expected by those transitive consumers.
//
// Fail closed when the pinned package shape changes: silently skipping this
// compatibility patch would leave npm install green while lint/runtime glob
// consumers fail later.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const TARGET = 'node_modules/brace-expansion/dist/commonjs/index.js';
const MARKER = '__updogBraceExpansionCallableCjs';
const NEEDLE = 'exports.expand = expand;';

if (!existsSync(TARGET)) {
  throw new Error(`[patch-brace-expansion-commonjs] missing target: ${TARGET}`);
}

const original = readFileSync(TARGET, 'utf8');
if (original.includes(MARKER)) {
  process.exit(0);
}
if (!original.includes(NEEDLE)) {
  throw new Error('[patch-brace-expansion-commonjs] unsupported upstream CommonJS shape');
}

const compatibilityShim = [
  '',
  `// ${MARKER}`,
  'const __updogBraceExpansionExports = module.exports;',
  'if (',
  "  typeof __updogBraceExpansionExports !== 'function' &&",
  "  typeof __updogBraceExpansionExports.expand === 'function'",
  ') {',
  '  const __updogBraceExpansionCallable = __updogBraceExpansionExports.expand;',
  '  Object.defineProperties(',
  '    __updogBraceExpansionCallable,',
  '    Object.getOwnPropertyDescriptors(__updogBraceExpansionExports)',
  '  );',
  '  module.exports = __updogBraceExpansionCallable;',
  '}',
  '',
].join('\n');

writeFileSync(TARGET, `${original.trimEnd()}${compatibilityShim}`);
console.log('[patch-brace-expansion-commonjs] restored callable CommonJS export');
