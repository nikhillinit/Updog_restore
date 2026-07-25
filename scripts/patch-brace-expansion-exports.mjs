// brace-expansion 5.0.8 fixes CVE-2026-14257 but changes both module surfaces:
// its CommonJS entry exports an object and its ESM entry has no default export.
// Supported minimatch releases require a callable CommonJS value or an ESM
// default. Keep the patched implementation while restoring both shapes.
//
// Fail closed when the pinned package shape changes: silently skipping this
// compatibility patch would leave npm install green while lint/runtime glob
// consumers fail later.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const CJS_TARGET = 'node_modules/brace-expansion/dist/commonjs/index.js';
const CJS_MARKER = '__updogBraceExpansionCallableCjs';
const CJS_NEEDLE = 'exports.expand = expand;';
const ESM_TARGET = 'node_modules/brace-expansion/dist/esm/index.js';
const ESM_MARKER = '__updogBraceExpansionDefaultEsm';
const ESM_NEEDLE = 'export function expand(';

function readTarget(target) {
  if (!existsSync(target)) {
    throw new Error(`[patch-brace-expansion-exports] missing target: ${target}`);
  }
  return readFileSync(target, 'utf8');
}

let patched = false;
const commonjs = readTarget(CJS_TARGET);
if (!commonjs.includes(CJS_MARKER)) {
  if (!commonjs.includes(CJS_NEEDLE)) {
    throw new Error('[patch-brace-expansion-exports] unsupported upstream CommonJS shape');
  }
  const commonjsShim = [
    '',
    `// ${CJS_MARKER}`,
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
  writeFileSync(CJS_TARGET, `${commonjs.trimEnd()}${commonjsShim}`);
  patched = true;
}

const esm = readTarget(ESM_TARGET);
if (!esm.includes(ESM_MARKER)) {
  if (!esm.includes(ESM_NEEDLE)) {
    throw new Error('[patch-brace-expansion-exports] unsupported upstream ESM shape');
  }
  const esmShim = ['', `// ${ESM_MARKER}`, 'export default expand;', ''].join('\n');
  writeFileSync(ESM_TARGET, `${esm.trimEnd()}${esmShim}`);
  patched = true;
}

if (patched) {
  console.log('[patch-brace-expansion-exports] restored CommonJS and ESM compatibility');
}
