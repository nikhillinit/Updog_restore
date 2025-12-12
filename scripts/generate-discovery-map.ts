/**
 * Discovery Map Generator
 *
 * Scans the codebase, parses frontmatter, applies routing logic,
 * checks staleness, and generates machine-readable artifacts.
 *
 * Usage:
 *   npm run docs:routing:generate  # Generate artifacts
 *   npm run docs:routing:check     # Verify sync (CI mode)
 *
 * Output:
 *   docs/_generated/router-index.json    # Machine-readable routing index
 *   docs/_generated/staleness-report.md  # Maintenance tracking report
 *
 * Frontmatter Validation Notes:
 * -----------------------------
 * This script uses a simplified frontmatter parser that extracts key-value
 * pairs between the first `---` and second `---` markers.
 *
 * Known limitations:
 * - Simple grep-based extraction may match `name:` in non-frontmatter content
 * - Nested YAML structures are not fully supported
 * - Multi-line values may not parse correctly
 *
 * For production use, consider:
 * - Installing `gray-matter` package for robust frontmatter parsing
 * - Installing `js-yaml` for full YAML support
 * - Adding schema validation against DOC-FRONTMATTER-SCHEMA.md
 *
 * To validate agent/skill names, use frontmatter-aware extraction:
 *   1. Parse only content between first `---` and next `---`
 *   2. Extract `name:` field from that block only
 *   3. Confirm uniqueness (name collisions resolve by scope precedence)
 */

import fs from 'node:fs/promises';
import path from 'node:path';

// Note: In production, use proper packages. This is a self-contained version.
// import glob from 'fast-glob';
// import matter from 'gray-matter';
// import yaml from 'js-yaml';

// =============================================================================
// TYPES
// =============================================================================

interface DiscoveryConfig {
  version: string;
  configuration: {
    min_score_to_route: number;
    staleness_cadence_default: string;
    scan_paths: string[];
    exclude_paths: string[];
    generic_terms: string[];
  };
  decision_tree: Record<string, DecisionNode>;
  patterns: Pattern[];
  agents: {
    phoenix: AgentEntry[];
  };
  staleness: {
    execution_claim_patterns: string[];
    cadence_overrides: Record<string, string>;
  };
}

interface DecisionNode {
  id: string;
  question: string;
  keywords?: string[];
  condition?: unknown;
  action_if_true?: unknown;
  action_if_false?: string;
  branches?: Record<string, unknown>;
  next?: string;
}

interface Pattern {
  id: string;
  priority: number;
  category: string;
  keywords: string[];
  target: string;
  command?: string;
  agent?: string;
  warning?: string;
  message?: string;
  gate?: string;
  secondary?: string;
  commands?: string[];
}

interface AgentEntry {
  name: string;
  skill: string;
  phase: (string | number)[];
}

type DocType = 'agent' | 'skill' | 'command' | 'doc';

interface DocMetadata {
  path: string;
  exists: boolean;
  docType: DocType;
  frontmatter: Record<string, unknown>;
  isStale: boolean;
  staleDays: number;
  hasExecutionClaims: boolean;
  lastUpdated: string | null;
  status: string;
  owner: string | null;
}

interface RouterIndex {
  generatedAt: string;
  version: string;
  config: {
    min_score_to_route: number;
    generic_terms: string[];
  };
  decision_tree: Record<string, DecisionNode>;
  patterns: Pattern[];
  agents: AgentEntry[];
  docs: DocMetadata[];
  stats: {
    total_docs: number;
    stale_docs: number;
    missing_frontmatter: number;
    by_status: Record<string, number>;
  };
}

/**
 * Consumer-optimized router schema
 * Used by routeQueryFast() for fast pattern matching
 */
interface RouterFast {
  version: string;
  generatedAt: string;
  scoring: {
    generic_terms: string[];
    min_score: number;
  };
  config: {
    max_docs_per_keyword: number;
  };
  patterns: RouterFastPattern[];
  keyword_to_docs: Record<string, string[]>;
}

interface RouterFastPattern {
  id: string;
  priority: number;
  match_any: string[];
  match_any_normalized: string[];
  route_to: string;
  why: string;
  command?: string;
  agent?: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const SOURCE_FILE = 'docs/DISCOVERY-MAP.source.yaml';
const OUT_DIR = 'docs/_generated';
const OUT_JSON = path.join(OUT_DIR, 'router-index.json');
const OUT_FAST = path.join(OUT_DIR, 'router-fast.json');
const OUT_STALENESS = path.join(OUT_DIR, 'staleness-report.md');

// Limit docs per keyword to prevent index bloat
const MAX_DOCS_PER_KEYWORD = 25;

// =============================================================================
// UTILITIES
// =============================================================================

/**
 * Normalize a string for keyword matching
 */
function normalize(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * Determine document type from path
 */
function getDocType(filePath: string): DocType {
  if (filePath.includes('/agents/') || filePath.includes('\\agents\\')) {
    return 'agent';
  }
  if (filePath.includes('/skills/') || filePath.includes('\\skills\\')) {
    return 'skill';
  }
  if (filePath.includes('/commands/') || filePath.includes('\\commands\\')) {
    return 'command';
  }
  return 'doc';
}

/**
 * Parse ISO 8601 duration (P30D, P90D, P180D, P365D)
 * Returns milliseconds
 */
function parseDuration(iso8601: string): number {
  const match = iso8601.match(/P(\d+)D/);
  if (!match) {
    console.warn(`WARNING: Invalid duration format "${iso8601}", using 180 days`);
    return 180 * 24 * 60 * 60 * 1000;
  }
  return parseInt(match[1], 10) * 24 * 60 * 60 * 1000;
}

/**
 * Simple YAML parser (handles subset needed for config)
 * In production, use js-yaml package
 */
function parseYaml(content: string): unknown {
  // This is a simplified parser - in production use js-yaml
  // For now, we'll use a basic approach that handles our config structure
  try {
    // Remove comments
    const lines = content.split('\n').filter(line => !line.trim().startsWith('#'));
    const cleanContent = lines.join('\n');

    // Use Function constructor to safely evaluate YAML-like structure
    // This is a workaround - in production, use proper yaml parser
    const jsonLike = cleanContent
      .replace(/:\s*\n/g, ': null\n')
      .replace(/(\w+):/g, '"$1":')
      .replace(/:\s*([^"\[\{,\n][^\n,\]]*)/g, (_, v) => {
        const trimmed = v.trim();
        if (trimmed === 'true' || trimmed === 'false' || trimmed === 'null') {
          return `: ${trimmed}`;
        }
        if (/^\d+$/.test(trimmed)) {
          return `: ${trimmed}`;
        }
        return `: "${trimmed}"`;
      });

    return JSON.parse(`{${jsonLike}}`);
  } catch {
    throw new Error('Failed to parse YAML. Install js-yaml for proper parsing.');
  }
}

/**
 * Simple frontmatter parser
 * In production, use gray-matter package
 */
function parseFrontmatter(content: string): { data: Record<string, unknown>; content: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    return { data: {}, content };
  }

  try {
    // Simple key-value parsing
    const data: Record<string, unknown> = {};
    const lines = match[1].split('\n');

    for (const line of lines) {
      const colonIdx = line.indexOf(':');
      if (colonIdx > 0) {
        const key = line.slice(0, colonIdx).trim();
        let value: unknown = line.slice(colonIdx + 1).trim();

        // Handle arrays
        if (value === '') {
          continue;
        }
        if (value.startsWith('[') && value.endsWith(']')) {
          value = value.slice(1, -1).split(',').map(s => s.trim().replace(/"/g, ''));
        }
        // Handle booleans
        else if (value === 'true') value = true;
        else if (value === 'false') value = false;
        // Handle numbers
        else if (/^\d+$/.test(value as string)) value = parseInt(value as string, 10);
        // Remove quotes
        else if ((value as string).startsWith('"') && (value as string).endsWith('"')) {
          value = (value as string).slice(1, -1);
        }

        data[key] = value;
      }
    }

    return { data, content: match[2] };
  } catch {
    return { data: {}, content };
  }
}

/**
 * Simple glob pattern matching
 * In production, use fast-glob package
 */
async function globFiles(patterns: string[], excludes: string[]): Promise<string[]> {
  const results: string[] = [];

  async function walkDir(dir: string): Promise<void> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = fullPath;

        // Check excludes
        const isExcluded = excludes.some(exc => {
          const pattern = exc.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*');
          return new RegExp(pattern).test(relativePath);
        });
        if (isExcluded) continue;

        if (entry.isDirectory()) {
          await walkDir(fullPath);
        } else if (entry.name.endsWith('.md')) {
          // Check if matches any pattern
          const matches = patterns.some(pat => {
            const pattern = pat.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*');
            return new RegExp(pattern).test(relativePath);
          });
          if (matches) {
            results.push(relativePath);
          }
        }
      }
    } catch {
      // Directory doesn't exist, skip
    }
  }

  // Extract base directories from patterns
  const baseDirs = new Set<string>();
  for (const pattern of patterns) {
    const baseDir = pattern.split('/')[0];
    if (baseDir && !baseDir.includes('*')) {
      baseDirs.add(baseDir);
    }
  }

  for (const dir of baseDirs) {
    await walkDir(dir);
  }

  return results;
}

/**
 * Check if content contains execution claims
 */
function hasExecutionClaims(content: string, patterns: string[]): boolean {
  const lowerContent = content.toLowerCase();
  return patterns.some(pattern => lowerContent.includes(pattern.toLowerCase()));
}

/**
 * Get staleness cadence for a path
 */
function getStaleCadence(
  filePath: string,
  overrides: Record<string, string>,
  defaultCadence: string
): number {
  for (const [pattern, cadence] of Object.entries(overrides)) {
    const regex = new RegExp(pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*'));
    if (regex.test(filePath)) {
      return parseDuration(cadence);
    }
  }
  return parseDuration(defaultCadence);
}

/**
 * Validate pattern priorities are unique
 */
function validatePatternPriorities(patterns: Pattern[]): void {
  const priorities = new Map<number, string[]>();

  for (const pattern of patterns) {
    const existing = priorities.get(pattern.priority) || [];
    existing.push(pattern.id);
    priorities.set(pattern.priority, existing);
  }

  for (const [priority, ids] of priorities) {
    if (ids.length > 1) {
      console.warn(`WARNING: Priority ${priority} shared by: ${ids.join(', ')}`);
    }
  }
}

/**
 * Validate pattern targets exist
 */
async function validatePatternTargets(patterns: Pattern[]): Promise<void> {
  for (const pattern of patterns) {
    // Skip command references
    if (pattern.target.startsWith('/') || pattern.target.startsWith('.claude/commands/')) {
      continue;
    }

    try {
      await fs.access(pattern.target);
    } catch {
      console.warn(`WARNING: Target not found for pattern "${pattern.id}": ${pattern.target}`);
    }
  }
}

// =============================================================================
// MAIN GENERATOR
// =============================================================================

async function main(): Promise<void> {
  const isCheckMode = process.argv.includes('--check');
  const isVerbose = process.argv.includes('--verbose');

  console.log(`Discovery Map Generator ${isCheckMode ? '(check mode)' : '(generate mode)'}`);
  console.log('---');

  // 1. Load Source Config
  let rawConfig: string;
  try {
    rawConfig = await fs.readFile(SOURCE_FILE, 'utf8');
  } catch {
    console.error(`ERROR: Source file not found: ${SOURCE_FILE}`);
    process.exit(1);
  }

  // For this implementation, we'll read the YAML manually
  // In production, use js-yaml package
  const config: DiscoveryConfig = {
    version: '2.0',
    configuration: {
      min_score_to_route: 2,
      staleness_cadence_default: 'P180D',
      scan_paths: [
        'docs/**/*.md',
        'cheatsheets/**/*.md',
        '.claude/agents/*.md',
        '.claude/skills/**/*.md',
        '.claude/commands/*.md',
      ],
      exclude_paths: ['docs/_generated/**', 'docs/archive/**', '**/node_modules/**'],
      generic_terms: ['test', 'error', 'fix', 'update', 'change', 'help'],
    },
    decision_tree: {},
    patterns: [],
    agents: { phoenix: [] },
    staleness: {
      execution_claim_patterns: [
        'tests pass',
        'PR merged',
        'deployed to',
        'completed on',
        'verified that',
        'confirmed working',
      ],
      cadence_overrides: {
        'docs/PHOENIX-SOT/**': 'P30D',
        'CHANGELOG.md': 'P7D',
        'cheatsheets/**': 'P90D',
        'docs/archive/**': 'P365D',
      },
    },
  };

  // Parse patterns from YAML (simplified extraction)
  const patternMatches = rawConfig.matchAll(
    /- id: "([^"]+)"\s+priority: (\d+)\s+category: "([^"]+)"\s+keywords:\s+([\s\S]*?)target: "([^"]+)"/g
  );

  for (const match of patternMatches) {
    const keywordsBlock = match[4];
    const keywords = [...keywordsBlock.matchAll(/- "([^"]+)"/g)].map(m => m[1]);

    config.patterns.push({
      id: match[1],
      priority: parseInt(match[2], 10),
      category: match[3],
      keywords,
      target: match[5],
    });
  }

  // Parse agents from YAML
  const agentMatches = rawConfig.matchAll(
    /- name: "([^"]+)"\s+skill: "([^"]+)"\s+phase: \[([^\]]+)\]/g
  );

  for (const match of agentMatches) {
    config.agents.phoenix.push({
      name: match[1],
      skill: match[2],
      phase: match[3].split(',').map(s => s.trim()),
    });
  }

  if (isVerbose) {
    console.log(`Loaded ${config.patterns.length} patterns`);
    console.log(`Loaded ${config.agents.phoenix.length} agents`);
  }

  // 2. Validate Configuration
  validatePatternPriorities(config.patterns);
  await validatePatternTargets(config.patterns);

  // 3. Scan Files
  console.log('Scanning documentation files...');
  const files = await globFiles(config.configuration.scan_paths, config.configuration.exclude_paths);

  if (isVerbose) {
    console.log(`Found ${files.length} files`);
  }

  const docsData: DocMetadata[] = [];
  const stats = {
    total_docs: 0,
    stale_docs: 0,
    missing_frontmatter: 0,
    by_status: {} as Record<string, number>,
  };

  for (const file of files) {
    try {
      const content = await fs.readFile(file, 'utf8');
      const parsed = parseFrontmatter(content);

      const lastUpdatedStr = parsed.data.last_updated as string | undefined;
      const lastUpdated = lastUpdatedStr ? new Date(lastUpdatedStr) : null;

      const cadence = getStaleCadence(
        file,
        config.staleness.cadence_overrides,
        config.configuration.staleness_cadence_default
      );

      const staleDays = lastUpdated
        ? Math.floor((Date.now() - lastUpdated.getTime()) / (24 * 60 * 60 * 1000))
        : 999;

      const isStale = lastUpdated ? Date.now() - lastUpdated.getTime() > cadence : true;

      const execClaims = hasExecutionClaims(content, config.staleness.execution_claim_patterns);

      const status = (parsed.data.status as string) || 'UNKNOWN';

      docsData.push({
        path: file,
        exists: true,
        docType: getDocType(file),
        frontmatter: parsed.data,
        isStale,
        staleDays,
        hasExecutionClaims: execClaims,
        lastUpdated: lastUpdatedStr || null,
        status,
        owner: (parsed.data.owner as string) || null,
      });

      stats.total_docs++;
      if (isStale) stats.stale_docs++;
      if (Object.keys(parsed.data).length === 0) stats.missing_frontmatter++;
      stats.by_status[status] = (stats.by_status[status] || 0) + 1;
    } catch {
      if (isVerbose) {
        console.warn(`WARNING: Could not process file: ${file}`);
      }
    }
  }

  // 4. Generate JSON Index
  const routerIndex: RouterIndex = {
    generatedAt: new Date().toISOString(),
    version: config.version,
    config: {
      min_score_to_route: config.configuration.min_score_to_route,
      generic_terms: config.configuration.generic_terms,
    },
    decision_tree: config.decision_tree,
    patterns: config.patterns.sort((a, b) => a.priority - b.priority),
    agents: config.agents.phoenix,
    docs: docsData,
    stats,
  };

  const jsonOutput = JSON.stringify(routerIndex, null, 2);

  // 4b. Generate Router-Fast JSON (consumer-optimized schema)
  // Build keyword_to_docs map for fallback routing (with limit to prevent bloat)
  const keywordToDocs: Record<string, string[]> = {};
  for (const pattern of config.patterns) {
    for (const keyword of pattern.keywords) {
      const normalizedKeyword = normalize(keyword);
      if (!keywordToDocs[normalizedKeyword]) {
        keywordToDocs[normalizedKeyword] = [];
      }
      // Enforce max_docs_per_keyword limit
      if (
        keywordToDocs[normalizedKeyword].length < MAX_DOCS_PER_KEYWORD &&
        !keywordToDocs[normalizedKeyword].includes(pattern.target)
      ) {
        keywordToDocs[normalizedKeyword].push(pattern.target);
      }
    }
  }

  // Build consumer-friendly pattern format with normalized keywords for matching
  const fastPatterns: RouterFastPattern[] = config.patterns
    .sort((a, b) => a.priority - b.priority)
    .map((p) => ({
      id: p.id,
      priority: p.priority,
      match_any: p.keywords,
      match_any_normalized: p.keywords.map(normalize),
      route_to: p.target,
      why: p.message || p.warning || `${p.category} routing (priority ${p.priority})`,
      ...(p.command && { command: p.command }),
      ...(p.agent && { agent: p.agent }),
    }));

  const routerFast: RouterFast = {
    version: config.version,
    generatedAt: new Date().toISOString(),
    scoring: {
      generic_terms: config.configuration.generic_terms,
      min_score: config.configuration.min_score_to_route,
    },
    config: {
      max_docs_per_keyword: MAX_DOCS_PER_KEYWORD,
    },
    patterns: fastPatterns,
    keyword_to_docs: keywordToDocs,
  };

  const fastOutput = JSON.stringify(routerFast, null, 2);

  // 5. Generate Staleness Report
  let mdOutput = `# Staleness Report

*Generated: ${new Date().toISOString()}*
*Source: ${SOURCE_FILE}*

## Summary

| Metric | Value |
|--------|-------|
| Total Documents | ${stats.total_docs} |
| Stale Documents | ${stats.stale_docs} |
| Missing Frontmatter | ${stats.missing_frontmatter} |

### By Status

| Status | Count |
|--------|-------|
${Object.entries(stats.by_status)
  .sort(([, a], [, b]) => b - a)
  .map(([status, count]) => `| ${status} | ${count} |`)
  .join('\n')}

## Stale Documents

Documents that need review (older than their cadence threshold):

`;

  const staleDocs = docsData.filter(d => d.isStale).sort((a, b) => b.staleDays - a.staleDays);

  if (staleDocs.length === 0) {
    mdOutput += '*No stale documents found.*\n';
  } else {
    mdOutput += '| Document | Last Updated | Days Old | Has Execution Claims | Owner |\n';
    mdOutput += '|----------|--------------|----------|---------------------|-------|\n';

    for (const doc of staleDocs.slice(0, 50)) {
      // Limit to top 50
      const claims = doc.hasExecutionClaims ? 'YES - verify!' : 'No';
      const owner = doc.owner || 'Unassigned';
      mdOutput += `| \`${doc.path}\` | ${doc.lastUpdated || 'Never'} | ${doc.staleDays} | ${claims} | ${owner} |\n`;
    }

    if (staleDocs.length > 50) {
      mdOutput += `\n*...and ${staleDocs.length - 50} more stale documents.*\n`;
    }
  }

  mdOutput += `
## Documents with Execution Claims (Need Verification)

These documents contain phrases like "tests pass", "PR merged", etc. and should be verified:

`;

  const execClaimDocs = docsData.filter(d => d.hasExecutionClaims && d.isStale);
  if (execClaimDocs.length === 0) {
    mdOutput += '*No stale documents with execution claims.*\n';
  } else {
    for (const doc of execClaimDocs) {
      mdOutput += `- [ ] **${doc.path}** (${doc.staleDays} days old)\n`;
    }
  }

  mdOutput += `
## Missing Frontmatter

Documents without proper YAML frontmatter:

`;

  const missingFm = docsData.filter(d => Object.keys(d.frontmatter).length === 0);
  if (missingFm.length === 0) {
    mdOutput += '*All documents have frontmatter.*\n';
  } else {
    for (const doc of missingFm) {
      mdOutput += `- [ ] \`${doc.path}\`\n`;
    }
  }

  mdOutput += `
---

*To fix staleness: Update \`last_updated\` field in document frontmatter.*
*To set owner: Add \`owner\` field in document frontmatter.*
*See: docs/.templates/DOC-FRONTMATTER-SCHEMA.md for schema details.*
`;

  // 6. Write or Check
  if (isCheckMode) {
    let existingJson = '';
    let existingFast = '';
    let existingStaleness = '';

    try {
      existingJson = await fs.readFile(OUT_JSON, 'utf8');
    } catch {
      // File doesn't exist
    }

    try {
      existingFast = await fs.readFile(OUT_FAST, 'utf8');
    } catch {
      // File doesn't exist
    }

    try {
      existingStaleness = await fs.readFile(OUT_STALENESS, 'utf8');
    } catch {
      // File doesn't exist
    }

    // For check mode, we compare structure, not timestamps
    const existingParsed = existingJson ? JSON.parse(existingJson) : null;
    const newParsed = JSON.parse(jsonOutput);
    const existingFastParsed = existingFast ? JSON.parse(existingFast) : null;
    const newFastParsed = JSON.parse(fastOutput);

    // Remove timestamps for comparison
    if (existingParsed) {
      delete existingParsed.generatedAt;
    }
    delete newParsed.generatedAt;
    if (existingFastParsed) {
      delete existingFastParsed.generatedAt;
    }
    delete newFastParsed.generatedAt;

    const jsonMatch = JSON.stringify(existingParsed) === JSON.stringify(newParsed);
    const fastMatch = JSON.stringify(existingFastParsed) === JSON.stringify(newFastParsed);

    // For staleness report, just check if it exists (content will differ due to timestamps)
    const stalenessExists = existingStaleness.length > 0;

    if (!jsonMatch || !fastMatch || !stalenessExists) {
      console.error('ERROR: Generated files are out of sync with source!');
      console.error('Run: npm run docs:routing:generate');
      if (!jsonMatch) console.error('  - router-index.json needs regeneration');
      if (!fastMatch) console.error('  - router-fast.json needs regeneration');
      if (!stalenessExists) console.error('  - staleness-report.md is missing');
      process.exit(1);
    }

    console.log('PASS: Discovery map is in sync.');
  } else {
    // Create output directory
    await fs.mkdir(OUT_DIR, { recursive: true });

    // Write files
    await fs.writeFile(OUT_JSON, jsonOutput);
    await fs.writeFile(OUT_FAST, fastOutput);
    await fs.writeFile(OUT_STALENESS, mdOutput);

    console.log('SUCCESS: Discovery map generated.');
    console.log(`  - ${OUT_JSON}`);
    console.log(`  - ${OUT_FAST}`);
    console.log(`  - ${OUT_STALENESS}`);
    console.log('');
    console.log(`Stats: ${stats.total_docs} docs, ${stats.stale_docs} stale, ${stats.missing_frontmatter} missing frontmatter`);
  }
}

main().catch(err => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
