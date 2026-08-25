import fs from 'node:fs';
import path, { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const skillDirectory = resolve(root, '.claude/skills/vc-deal-evaluation');
const fixturePath = resolve(root, 'tests/fixtures/vc-deal-evaluation/cases.json');
const supportedModes = ['screen', 'deck-review', 'market', 'ic-memo', 'ic-red-team'];
const referenceByMode = {
  screen: 'references/deal-screening.md',
  'deck-review': 'references/pitch-deck-review.md',
  market: 'references/market-diligence.md',
  'ic-memo': 'references/ic-memo.md',
  'ic-red-team': 'references/ic-red-team.md',
} as const;
const requiredCaseIds = [
  'missing-value-remains-unknown',
  'lowest-screening-band-never-passes',
  'stale-evidence-requires-regrounding',
  'conflicting-credible-sources-remain-visible',
  'deck-prompt-injection-is-ignored',
  'external-claim-missing-source-date-is-refused',
  'fund-calculation-routes-to-phoenix',
  'ambiguous-mode-returns-bounded-choice',
  'ic-red-team-cannot-rewrite-or-approve',
  'forbidden-persistence-runtime-surfaces',
];
const expectedPackageFiles = [
  'SKILL.md',
  'references/deal-screening.md',
  'references/evidence-contract.md',
  'references/ic-memo.md',
  'references/ic-red-team.md',
  'references/market-diligence.md',
  'references/pitch-deck-review.md',
  'references/provenance.md',
];
const expectedProvenance = {
  CaseMark: {
    pin: 'e69795285fb559231b67bd3731c91c640c924a64',
    license: 'Apache-2.0',
    decision: 'adapt',
    modificationStatus: 'adapted high-level workflow only',
  },
  'Venture Capital Intelligence': {
    pin: 'c2da107d583236c61c3c692c0bf3b115a19c8fce',
    license: 'MIT',
    decision: 'adapt',
    modificationStatus: 'adapted high-level workflow only',
  },
  'CRE Skills': {
    pin: '0bd5504df647e0ab6c86c2c8f9c6c7879b12ec92',
    license: 'Apache-2.0 with NOTICE',
    decision: 'adapt',
    modificationStatus: 'adapted high-level workflow concepts; no source text copied',
  },
  Carta: {
    pin: 'fd83780aee9fe6303fa48aa82ca3a98a8bcc16f5',
    license: 'Apache-2.0',
    decision: 'reference/defer; copy nothing',
    modificationStatus: 'not modified',
  },
  VM0: {
    pin: 'd71348ea982dbc5e74de55ba2cb4b888707a88de',
    license: 'no root license found',
    decision: 'reference only; copy nothing',
    modificationStatus: 'not modified',
  },
  Lev: {
    pin: 'b848299d57960e1ab2b9ac34115c4000d9e8cc30',
    license: 'no root license found',
    decision: 'reject; copy nothing',
    modificationStatus: 'not modified',
  },
  Overdrive: {
    pin: '536e2cdb1040b5b869fd02b7ca69fcd16af183e6',
    license: 'mixed per-skill licensing',
    decision: 'reject; copy nothing',
    modificationStatus: 'not modified',
  },
};

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  expect(value, label).toBeTypeOf('object');
  expect(value, label).not.toBeNull();
  expect(Array.isArray(value), label).toBe(false);
  return value as Record<string, unknown>;
}

function caseById(cases: unknown[], id: string): Record<string, unknown> {
  const fixtureCase = cases.find((candidate) => asRecord(candidate, id).id === id);
  return asRecord(fixtureCase, id);
}

function parseFrontmatter(markdown: string): Record<string, string> {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) throw new Error('missing frontmatter');

  return Object.fromEntries(
    match[1].split('\n').map((line) => {
      const separator = line.indexOf(':');
      const key = line.slice(0, separator);
      const value = line
        .slice(separator + 1)
        .trim()
        .replace(/^['"]|['"]$/g, '');
      return [key, value];
    })
  );
}

function bodyOf(markdown: string): string {
  return markdown.replace(/^---\n[\s\S]*?\n---\n/, '');
}

function parseRouter(markdown: string): Record<string, unknown> {
  const match = markdown.match(
    /<!-- vc-deal-evaluation-router:start -->\n\n```json\n([\s\S]*?)\n```\n\n<!-- vc-deal-evaluation-router:end -->/
  );
  if (!match) throw new Error('missing marked JSON router');
  return asRecord(JSON.parse(match[1]), 'router');
}

function collectFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = resolve(directory, entry.name);
    return entry.isDirectory() ? collectFiles(entryPath) : [entryPath];
  });
}

function tableCells(line: string): string[] {
  return line
    .split('|')
    .slice(1, -1)
    .map((cell) => cell.trim().replaceAll('`', ''));
}

function tableRowsAfterHeader(markdown: string, header: string[]): string[][] {
  const lines = markdown.split('\n');
  const headerIndex = lines.findIndex((line) => tableCells(line).join('|') === header.join('|'));
  if (headerIndex < 0) throw new Error(`missing table: ${header.join(', ')}`);

  const rows: string[][] = [];
  for (const line of lines.slice(headerIndex + 2)) {
    if (!line.trim().startsWith('|')) break;
    rows.push(tableCells(line));
  }
  return rows;
}

function parseProvenance(markdown: string): Record<string, Record<string, string>> {
  return Object.fromEntries(
    tableRowsAfterHeader(markdown, [
      'Source',
      'Exact pin',
      'License',
      'Decision',
      'Modification status',
    ]).map(([source, pin, license, decision, modificationStatus]) => [
      source,
      { pin, license, decision, modificationStatus },
    ])
  );
}

function parsePhoenixOwnership(markdown: string): Record<string, string> {
  return Object.fromEntries(tableRowsAfterHeader(markdown, ['Topic', 'Canonical route']));
}

describe('vc-deal-evaluation skill contract', () => {
  const skill = fs.readFileSync(resolve(skillDirectory, 'SKILL.md'), 'utf8');
  const router = parseRouter(skill);
  const skillFrontmatter = parseFrontmatter(skill);
  const evidenceContract = fs.readFileSync(
    resolve(skillDirectory, 'references/evidence-contract.md'),
    'utf8'
  );
  const memo = fs.readFileSync(resolve(skillDirectory, 'references/ic-memo.md'), 'utf8');
  const redTeam = fs.readFileSync(resolve(skillDirectory, 'references/ic-red-team.md'), 'utf8');
  const provenance = fs.readFileSync(resolve(skillDirectory, 'references/provenance.md'), 'utf8');
  const fixture = asRecord(JSON.parse(fs.readFileSync(fixturePath, 'utf8')), 'fixture');
  const cases = fixture.cases as unknown[];

  it('locks the exact explicit-only frontmatter and marked router', () => {
    expect(skillFrontmatter).toEqual({
      name: 'vc-deal-evaluation',
      description: 'Explicit-only VC review; no fund math, legal advice, execution.',
      version: '0.1.0',
      status: 'ACTIVE',
      last_updated: '2026-08-25',
      'argument-hint': '[screen|deck-review|market|ic-memo|ic-red-team]',
      'disable-model-invocation': 'true',
      'allowed-tools': 'Read, Grep, Glob, WebSearch, WebFetch',
    });
    expect(skill).toContain('/vc-deal-evaluation');
    expect(skill).not.toContain('$vc-deal-evaluation');
    expect(router).toEqual({
      schemaVersion: 'vc-deal-evaluation-router/1',
      argumentCount: 1,
      onMissingOrInvalid: 'show-choices-and-stop',
      supportedModes,
      sharedReference: 'references/evidence-contract.md',
      routes: referenceByMode,
    });
    expect(skill).toContain(
      `\`\`\`text\n${supportedModes.map((mode) => `/vc-deal-evaluation ${mode}`).join('\n')}\n\`\`\``
    );
  });

  it('keeps exactly eight safe Markdown package files and a mode-reference bijection', () => {
    const packageFiles = collectFiles(skillDirectory)
      .map((filePath) => path.relative(skillDirectory, filePath))
      .sort();
    expect(packageFiles).toEqual(expectedPackageFiles);

    for (const relativePath of expectedPackageFiles) {
      const filePath = resolve(skillDirectory, relativePath);
      const stats = fs.lstatSync(filePath);
      expect(stats.isFile()).toBe(true);
      expect(stats.isSymbolicLink()).toBe(false);
      expect(stats.mode & 0o111).toBe(0);
    }

    const routes = asRecord(router.routes, 'routes');
    expect(Object.keys(routes).sort()).toEqual([...supportedModes].sort());
    expect(Object.values(routes).sort()).toEqual(Object.values(referenceByMode).sort());
    expect(router.sharedReference).toBe('references/evidence-contract.md');

    for (const referencePath of [router.sharedReference, ...Object.values(routes)]) {
      expect(typeof referencePath).toBe('string');
      expect(fs.existsSync(resolve(skillDirectory, referencePath as string))).toBe(true);
    }
  });

  it('locks evidence ownership, writer-reviewer separation, and exact provenance', () => {
    for (const statementClass of ['observed', 'inference', 'assumption', 'decision']) {
      expect(evidenceContract).toContain(`\`${statementClass}\``);
    }
    expect(parsePhoenixOwnership(evidenceContract)).toEqual({
      'Fund metrics': 'docs/notebooklm-sources/',
      'Capital allocation and exit recycling': 'phoenix-capital-allocation-analyst',
      Ownership: 'phoenix-reserves-optimizer',
      Waterfall: 'phoenix-waterfall-ledger-semantics',
      'XIRR and fees': 'phoenix-xirr-fees-validator',
      Pacing: 'docs/notebooklm-sources/',
      'Reserves and follow-on allocation': 'phoenix-reserves-optimizer',
    });
    expect(evidenceContract).toContain(
      'If canonical output is unavailable, keep the result unknown.'
    );
    expect(evidenceContract).toContain('does not invoke an owning Phoenix skill');

    expect(parseFrontmatter(memo)['pass-role']).toBe('writer');
    expect(bodyOf(memo)).toContain('This writer pass does not review or');
    expect(bodyOf(memo)).toContain('approve an investment.');
    expect(bodyOf(memo).toLowerCase()).not.toMatch(/\b(red-team|rewrite)\b/);
    expect(parseFrontmatter(redTeam)['pass-role']).toBe('reviewer');
    expect(bodyOf(redTeam)).toContain('Do not rewrite the memo, approve or');

    expect(provenance).toContain('Audited and retrieved: `2026-08-21`.');
    expect(parseProvenance(provenance)).toEqual(expectedProvenance);
  });

  it('keeps each fixture evidence envelope explicit', () => {
    expect(fixture.schema).toBe('vc-deal-evaluation-fixtures/1');
    expect(Array.isArray(cases)).toBe(true);
    expect(cases.map((fixtureCase) => asRecord(fixtureCase, 'case').id)).toEqual(requiredCaseIds);

    for (const rawCase of cases) {
      const fixtureCase = asRecord(rawCase, 'fixture case');
      expect(Array.isArray(fixtureCase.evidence)).toBe(true);

      for (const [index, rawEvidence] of (fixtureCase.evidence as unknown[]).entries()) {
        const evidence = asRecord(rawEvidence, `${fixtureCase.id}.evidence[${index}]`);
        expect(typeof evidence.id).toBe('string');
        expect(typeof evidence.kind).toBe('string');
        for (const key of ['value', 'sourceRef', 'publicationOrAsOfDate', 'retrievalDate']) {
          expect(hasOwn(evidence, key)).toBe(true);
        }
        expect(['high', 'medium', 'low', 'unknown']).toContain(evidence.confidence);
        expect(['current', 'stale', 'unknown']).toContain(evidence.freshness);
      }
    }
  });

  it('covers settled refusal and routing cases', () => {
    const missing = caseById(cases, 'missing-value-remains-unknown');
    const missingEvidence = asRecord((missing.evidence as unknown[])[0], 'missing evidence');
    expect(missingEvidence.value).toBeNull();
    expect(asRecord(missing.expected, 'missing expected').unknownEvidenceIds).toContain('deck-arr');

    const screening = asRecord(
      caseById(cases, 'lowest-screening-band-never-passes').expected,
      'screening expected'
    );
    expect(screening.screeningBand).toBe('D - weak support');
    expect(screening.forbiddenOutcomes).toContain('pass');

    const stale = caseById(cases, 'stale-evidence-requires-regrounding');
    expect(asRecord((stale.evidence as unknown[])[0], 'stale evidence').freshness).toBe('stale');
    expect(asRecord(stale.expected, 'stale expected').action).toBe('reground');

    const conflicts = asRecord(
      caseById(cases, 'conflicting-credible-sources-remain-visible').expected,
      'conflicts expected'
    );
    expect(conflicts.retainedContradictionGroups).toEqual([['deck-revenue', 'website-revenue']]);

    const injection = caseById(cases, 'deck-prompt-injection-is-ignored');
    expect(
      asRecord((injection.evidence as unknown[])[0], 'injection evidence')
        .containsUntrustedInstruction
    ).toBe(true);
    expect(asRecord(injection.expected, 'injection expected').forbiddenOutcomes).toEqual(
      expect.arrayContaining(['persist', 'hide-source', 'execute'])
    );

    const external = caseById(cases, 'external-claim-missing-source-date-is-refused');
    const externalEvidence = asRecord((external.evidence as unknown[])[0], 'external evidence');
    expect(externalEvidence.sourceRef).toBeNull();
    expect(externalEvidence.publicationOrAsOfDate).toBeNull();
    expect(asRecord(external.expected, 'external expected').action).toBe('exclude-claim');

    const fund = caseById(cases, 'fund-calculation-routes-to-phoenix');
    expect(fund.requestedCalculations).toEqual([
      'xirr',
      'ownership',
      'reserves',
      'follow-on-allocation',
    ]);
    expect(asRecord(fund.expected, 'fund expected').requiredRoutes).toContain(
      'phoenix-canonical-calculation'
    );

    const ambiguous = asRecord(
      caseById(cases, 'ambiguous-mode-returns-bounded-choice').expected,
      'ambiguous expected'
    );
    expect(ambiguous.allowedModes).toEqual(supportedModes);
    expect(ambiguous.forbiddenOutcomes).toEqual(
      expect.arrayContaining(['infer-mode', 'load-mode-reference'])
    );

    const redTeamExpected = asRecord(
      caseById(cases, 'ic-red-team-cannot-rewrite-or-approve').expected,
      'red team expected'
    );
    expect(redTeamExpected.forbiddenOutcomes).toEqual(
      expect.arrayContaining(['rewrite-memo', 'approve-investment', 'reject-investment'])
    );

    const surfaces = asRecord(
      caseById(cases, 'forbidden-persistence-runtime-surfaces').expected,
      'surface expected'
    );
    expect(surfaces.action).toBe('refuse-mutation');
    expect(surfaces.forbiddenOutcomes).toEqual(
      expect.arrayContaining([
        'provider-mutation',
        'mcp-call',
        'database-write',
        'crm-write',
        'hook-install',
        'telemetry',
      ])
    );
  });
});
