// Postinstall guard: make @vitest/utils' error-stack source-map reader resilient to a
// malformed inline `sourceMappingURL=data:...base64,` marker bundled inside a dependency
// (e.g. drizzle-kit/bin.cjs ships such a literal). Without this guard,
// convertSourceMap.fromSource() throws "Unexpected end of JSON input" while vitest
// symbolicates a failing test's stack; that throw escapes as an unhandled error and MASKS
// the real failure (CI shows "0 failed + 1 unhandled error", exit 1).
//
// Idempotent, fail-safe, and version-resilient: no-ops if the target file is absent,
// already guarded, or the upstream code shape changed; never throws (must not break install).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const TARGET = 'node_modules/@vitest/utils/dist/source-map/node.js';
const MARKER = '__updogSourcemapGuard';
const NEEDLE =
  'const map = (convertSourceMap.fromSource(code) || convertSourceMap.fromMapFileSource(code, createConvertSourceMapReadMap(filePath)))?.toObject();';

try {
  if (!existsSync(TARGET)) {
    process.exit(0);
  }
  const original = readFileSync(TARGET, 'utf8');
  if (original.includes(MARKER) || !original.includes(NEEDLE)) {
    process.exit(0);
  }
  const guarded = [
    `let map; // ${MARKER}`,
    '\ttry {',
    '\t\tmap = (convertSourceMap.fromSource(code) || convertSourceMap.fromMapFileSource(code, createConvertSourceMapReadMap(filePath)))?.toObject();',
    '\t} catch {',
    '\t\treturn undefined;',
    '\t}',
  ].join('\n');
  writeFileSync(TARGET, original.replace(NEEDLE, guarded));
  console.log('[patch-vitest-sourcemap] guarded @vitest/utils source-map reader');
} catch (error) {
  console.warn(
    '[patch-vitest-sourcemap] skipped:',
    error instanceof Error ? error.message : error
  );
}
