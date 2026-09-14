import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.unmock('fs');

const generator = path.resolve('scripts/generate-discovery-map.ts');
const tsx = path.resolve('node_modules/tsx/dist/cli.mjs');
const fastPath = 'docs/_generated/router-fast.json';
const fullPaths = ['docs/_generated/router-index.json', 'docs/_generated/staleness-report.md'];
const expectedDocs = ['README.md', 'docs/guide.md', 'docs/nested/deep.md'];
let fixture: string;

function write(file: string, content: string): void {
  const target = path.join(fixture, file);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content);
}

function run(args: string[] = ['--check'], fault?: { method: string; file: string }) {
  return spawnSync(process.execPath, [tsx, generator, ...args], {
    cwd: fixture,
    encoding: 'utf8',
    timeout: 20_000,
    env: {
      ...process.env,
      TZ: 'UTC',
      NODE_OPTIONS: `--no-experimental-webstorage --import=${pathToFileURL(path.join(fixture, 'fault.mjs')).href}`,
      ROUTING_TEST_METHOD: fault?.method ?? '',
      ROUTING_TEST_PATH: fault?.file ?? '',
    },
  });
}

function fastStructure() {
  const { generatedAt: _generatedAt, ...structure } = JSON.parse(
    readFileSync(path.join(fixture, fastPath), 'utf8')
  );
  return structure;
}

beforeEach(() => {
  fixture = mkdtempSync(path.join(tmpdir(), 'discovery-generator-'));
  write(
    'docs/DISCOVERY-MAP.source.yaml',
    `version: '2.0'
configuration:
  scan_paths: ['*.md', 'docs/**/*.md']
  exclude_paths: ['docs/_generated/**', 'docs/**/archive/**', 'IGNORE.md']
  generic_terms: ['help']
patterns:
  - id: guide
    priority: 1
    category: Guide
    keywords: ['Guide']
    target: docs/guide.md
`
  );
  for (const file of [...expectedDocs, 'IGNORE.md', 'docs/nested/archive/retired.md']) {
    write(file, '---\nstatus: ACTIVE\nlast_updated: 2026-09-14\n---\nFixture document.\n');
  }
  write(
    fastPath,
    JSON.stringify({
      version: '2.0',
      generatedAt: '2020-01-01T00:00:00.000Z',
      scoring: { generic_terms: ['help'], min_score: 2 },
      config: { max_docs_per_keyword: 25 },
      patterns: [
        {
          id: 'guide',
          priority: 1,
          match_any: ['Guide'],
          match_any_normalized: ['guide'],
          route_to: 'docs/guide.md',
          why: 'Guide routing (priority 1)',
        },
      ],
      keyword_to_docs: { guide: ['docs/guide.md'] },
    })
  );
  execFileSync('git', ['init', '--quiet'], { cwd: fixture });
  execFileSync('git', ['add', '--all'], { cwd: fixture });
  write('.claude/memory/local.md', 'Untracked local document.');
  write('docs/local.md', 'Untracked local document.');
  write(
    'fault.mjs',
    `import fs from 'node:fs/promises';
const method = process.env.ROUTING_TEST_METHOD;
if (method) {
  const operation = method === 'omit' ? 'readdir' : method;
  const original = fs[operation];
  fs[operation] = async function (file, ...args) {
    if (String(file).replaceAll('\\\\', '/') === process.env.ROUTING_TEST_PATH) {
      if (method === 'omit') return [];
      throw Object.assign(new Error('injected EACCES: ' + file), { code: 'EACCES' });
    }
    return original.call(this, file, ...args);
  };
}
`
  );
});

afterEach(() => {
  rmSync(fixture, { recursive: true, force: true });
});

describe('discovery generator CLI', () => {
  it('checks with both full reports absent and preserves structure across repeated generation', () => {
    const check = run();
    expect(check.status, check.stderr).toBe(0);
    const before = fastStructure();

    for (let iteration = 0; iteration < 2; iteration++) {
      const generated = run([]);
      expect(generated.status, generated.stderr).toBe(0);
      expect(fastStructure()).toEqual(before);
      const index = JSON.parse(readFileSync(path.join(fixture, fullPaths[0]), 'utf8'));
      expect(index.docs.map((doc: { path: string }) => doc.path)).toEqual(expectedDocs);
      expect(index.stats.total_docs).toBe(expectedDocs.length);
      for (const file of fullPaths) rmSync(path.join(fixture, file));
      const checked = run();
      expect(checked.status, checked.stderr).toBe(0);
    }
  });

  it.each(['missing', 'malformed', 'stale'])('rejects %s fast-router output', (state) => {
    if (state === 'missing') rmSync(path.join(fixture, fastPath));
    if (state === 'malformed') write(fastPath, '{bad json');
    if (state === 'stale')
      write(fastPath, JSON.stringify({ ...fastStructure(), version: 'stale' }));
    const result = run();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('router-fast.json');
  });

  it.each([
    ['readFile', 'docs/guide.md'],
    ['readdir', 'docs/nested'],
    ['omit', 'docs/nested'],
  ])('fails closed on %s failure for eligible tracked documents', (method, file) => {
    for (const args of [[], ['--check'], ['--check', '--allow-doc-inventory-drift']]) {
      const result = run(args, { method, file });
      expect(result.status, `${method}: ${result.stdout}\n${result.stderr}`).toBe(1);
      expect(result.stderr).toContain(file);
    }
  });
});
