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
 * This script parses both the discovery source YAML and per-document frontmatter
 * with the installed `yaml` package so multi-line strings, quoted scalars, and
 * nested maps are handled consistently.
 *
 * Nested frontmatter maps are flattened to leaf keys in the generated index for
 * backward compatibility with existing consumers.
 *
 * Remaining improvement area:
 * - Add schema validation against DOC-FRONTMATTER-SCHEMA.md
 *
 * To validate agent/skill names, use frontmatter-aware extraction:
 *   1. Parse only content between first `---` and next `---`
 *   2. Extract `name:` field from that block only
 *   3. Confirm uniqueness (name collisions resolve by scope precedence)
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parse as parseYamlContent } from 'yaml';

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

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

function compareStrings(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function sortObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortObjectKeys);
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort(compareStrings)) {
      sorted[key] = sortObjectKeys(record[key]);
    }
    return sorted;
  }
  return value;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, val) => sortObjectKeys(val), 2);
}

function getRouterDocPaths(value: unknown): string[] {
  if (!isPlainObject(value) || !Array.isArray(value.docs)) {
    return [];
  }

  return value.docs
    .map((entry) => {
      if (!isPlainObject(entry) || typeof entry.path !== 'string') {
        return null;
      }
      return normalizePath(entry.path);
    })
    .filter((entry): entry is string => entry !== null)
    .sort(compareStrings);
}

function getRouterTotalDocs(value: unknown): number | null {
  if (!isPlainObject(value) || !isPlainObject(value.stats)) {
    return null;
  }
  return typeof value.stats.total_docs === 'number' ? value.stats.total_docs : null;
}

function getUntrackedPaths(paths: string[], trackedFiles: Set<string>): string[] {
  return paths.filter((filePath) => !trackedFiles.has(filePath)).sort(compareStrings);
}

function findUntrackedLocalPathMentions(content: string, trackedFiles: Set<string>): string[] {
  const matches = new Set<string>();
  const localPathPatterns = [
    /QA-Test-Report-2026-04-25[^`|"'()\s]*\.md/g,
    /\.claude\/memory\/[^`|"'()\s]*\.md/g,
  ];

  for (const pattern of localPathPatterns) {
    for (const match of content.matchAll(pattern)) {
      const normalized = normalizePath(match[0]);
      if (!trackedFiles.has(normalized)) {
        matches.add(normalized);
      }
    }
  }

  return [...matches].sort(compareStrings);
}

function normalizeLineEndings(content: string): string {
  // Cross-platform determinism: normalize CRLF to LF before parsing.
  return content.replace(/\r\n/g, '\n');
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseYamlObject<T extends Record<string, unknown>>(content: string): T {
  const parsed = parseYamlContent(content);
  if (!isPlainObject(parsed)) {
    throw new Error('Expected YAML document to parse into an object.');
  }
  return parsed as T;
}

function isLeafValue(value: unknown): value is string | number | boolean | null | unknown[] {
  return (
    value === null ||
    Array.isArray(value) ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

function collectNestedLeafValues(
  source: Record<string, unknown>,
  target: Record<string, unknown>
): void {
  for (const [key, value] of Object.entries(source)) {
    if (isPlainObject(value)) {
      collectNestedLeafValues(value, target);
      continue;
    }
    if (isLeafValue(value) && !(key in target)) {
      target[key] = value;
    }
  }
}

function flattenFrontmatterData(source: Record<string, unknown>): Record<string, unknown> {
  const flattened: Record<string, unknown> = {};

  for (const value of Object.values(source)) {
    if (isPlainObject(value)) {
      collectNestedLeafValues(value, flattened);
    }
  }

  for (const [key, value] of Object.entries(source)) {
    if (isLeafValue(value)) {
      flattened[key] = value;
    }
  }

  return flattened;
}

function escapeMarkdownTableCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, '<br>');
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
 * YAML frontmatter parser that preserves multi-line and nested values.
 * Nested objects are flattened to leaf keys for backward compatibility with
 * the existing generated index shape.
 */
function parseFrontmatter(content: string): { data: Record<string, unknown>; content: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) {
    return { data: {}, content };
  }

  try {
    const data = flattenFrontmatterData(parseYamlObject<Record<string, unknown>>(match[1]));
    return { data, content: content.slice(match[0].length) };
  } catch {
    return { data: {}, content };
  }
}

function escapeRegExpLiteral(value: string): string {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
}

function globPatternToRegExp(pattern: string): RegExp {
  const normalized = normalizePath(pattern);
  let regex = '';

  for (let index = 0; index < normalized.length; index++) {
    const char = normalized[index];
    const next = normalized[index + 1];

    if (char === '*' && next === '*') {
      const afterGlobstar = normalized[index + 2];
      if (afterGlobstar === '/') {
        regex += '(?:.*/)?';
        index += 2;
      } else {
        regex += '.*';
        index += 1;
      }
      continue;
    }

    if (char === '*') {
      regex += '[^/]*';
      continue;
    }

    regex += escapeRegExpLiteral(char);
  }

  return new RegExp(`^${regex}$`);
}

function pathMatchesGlob(filePath: string, pattern: string): boolean {
  return globPatternToRegExp(pattern).test(normalizePath(filePath));
}

function validateGlobSentinels(): void {
  const expectedMatches: Array<[string, string]> = [
    ['cheatsheets/**/*.md', 'cheatsheets/daily-workflow.md'],
    ['cheatsheets/**/*.md', 'cheatsheets/nested/example.md'],
    ['.claude/**/*.md', '.claude/AGENT-DIRECTORY.md'],
    ['.claude/**/*.md', '.claude/agents/code-reviewer.md'],
    ['docs/**/archive/**', 'docs/archive/2026-q2/example.md'],
    ['docs/**/archive/**', 'docs/observability/archive/example.md'],
    ['**/node_modules/**', 'node_modules/pkg/README.md'],
    ['**/node_modules/**', 'packages/pkg/node_modules/pkg/README.md'],
  ];

  const expectedNonMatches: Array<[string, string]> = [
    ['cheatsheets/**/*.md', 'cheatsheets/daily-workflow.txt'],
    ['cheatsheets/**/*.md', 'docs/cheatsheets/daily-workflow.md'],
    ['.claude/**/*.md', 'docs/.claude/AGENT-DIRECTORY.md'],
  ];

  for (const [pattern, filePath] of expectedMatches) {
    if (!pathMatchesGlob(filePath, pattern)) {
      throw new Error(`Glob sentinel failed: expected ${pattern} to match ${filePath}`);
    }
  }

  for (const [pattern, filePath] of expectedNonMatches) {
    if (pathMatchesGlob(filePath, pattern)) {
      throw new Error(`Glob sentinel failed: expected ${pattern} not to match ${filePath}`);
    }
  }
}

function getTrackedFileSet(): Set<string> {
  try {
    const output = execFileSync('git', ['ls-files', '-z'], { encoding: 'buffer' });
    const files = output.toString('utf8').split('\0').map(normalizePath).filter(Boolean);

    if (files.length === 0) {
      throw new Error('git ls-files returned no tracked files');
    }

    return new Set(files);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Unable to determine tracked documentation files from git ls-files; aborting discovery generation. ${message}`
    );
  }
}

/**
 * Simple glob pattern matching
 * In production, use fast-glob package
 */
async function globFiles(patterns: string[], excludes: string[]): Promise<string[]> {
  const includeRegexes = patterns.map(globPatternToRegExp);
  const excludeRegexes = excludes.map(globPatternToRegExp);
  const results: string[] = [];

  async function walkDir(dir: string): Promise<void> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      entries.sort((a, b) => compareStrings(a.name, b.name));
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = normalizePath(fullPath);

        // Check excludes
        const isExcluded = excludeRegexes.some((regex) => regex.test(relativePath));
        if (isExcluded) continue;

        if (entry.isDirectory()) {
          await walkDir(fullPath);
        } else if (entry.name.endsWith('.md')) {
          // Check if matches any pattern
          const matches = includeRegexes.some((regex) => regex.test(relativePath));
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
  let hasRootPattern = false;
  for (const pattern of patterns) {
    const baseDir = pattern.split('/')[0];
    if (baseDir && !baseDir.includes('*')) {
      baseDirs.add(baseDir);
    } else if (baseDir.includes('*')) {
      // Pattern like "*.md" - needs to scan current directory
      hasRootPattern = true;
    }
  }

  // Scan root directory if we have root-level patterns
  if (hasRootPattern) {
    try {
      const entries = await fs.readdir('.', { withFileTypes: true });
      entries.sort((a, b) => compareStrings(a.name, b.name));
      for (const entry of entries) {
        if (!entry.isDirectory() && entry.name.endsWith('.md')) {
          const matches = patterns.some((pat) => {
            return pathMatchesGlob(entry.name, pat);
          });
          if (matches) {
            results.push(entry.name);
          }
        }
      }
    } catch {
      // Current directory scan failed, skip
    }
  }

  for (const dir of baseDirs) {
    await walkDir(dir);
  }

  return [...new Set(results)].sort(compareStrings);
}

/**
 * Check if content contains execution claims
 */
function hasExecutionClaims(content: string, patterns: string[]): boolean {
  const lowerContent = content.toLowerCase();
  return patterns.some((pattern) => lowerContent.includes(pattern.toLowerCase()));
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

/**
 * Parse decision_tree section from YAML
 * Extracts Q0-Q6 nodes with their properties
 */
function parseDecisionTree(rawConfig: string): Record<string, DecisionNode> {
  const tree: Record<string, DecisionNode> = {};

  // Extract the decision_tree block (between decision_tree: and the next section)
  const dtMatch = rawConfig.match(/decision_tree:\s*\n([\s\S]*?)(?=\n# ===|patterns:)/);
  if (!dtMatch) {
    return tree;
  }

  const dtBlock = '\n' + dtMatch[1]; // Prepend newline for consistent matching

  // Find all Q node positions
  const nodeRegex = /\n {2}(Q\d+):\s*\n/g;
  const nodePositions: { id: string; start: number; matchEnd: number }[] = [];
  let match;

  while ((match = nodeRegex.exec(dtBlock)) !== null) {
    nodePositions.push({
      id: match[1],
      start: match.index,
      matchEnd: match.index + match[0].length,
    });
  }

  // Extract content for each node
  for (let i = 0; i < nodePositions.length; i++) {
    const nodeId = nodePositions[i].id;
    const contentStart = nodePositions[i].matchEnd;
    const contentEnd = i < nodePositions.length - 1 ? nodePositions[i + 1].start : dtBlock.length;

    const nodeContent = dtBlock.slice(contentStart, contentEnd);

    const node: DecisionNode = {
      id: extractField(nodeContent, 'id') || nodeId.toLowerCase(),
      question: extractField(nodeContent, 'question') || '',
    };

    // Extract keywords array
    const keywordsMatch = nodeContent.match(/keywords:\s*\[(.*?)\]/);
    if (keywordsMatch) {
      node.keywords = keywordsMatch[1]
        .split(',')
        .map((k) => k.trim().replace(/"/g, ''))
        .filter((k) => k.length > 0);
    }

    // Extract next
    const next = extractField(nodeContent, 'next');
    if (next) {
      node.next = next;
    }

    // Extract action_if_true (can be string or object with nested properties)
    const actionTrueLineMatch = nodeContent.match(/action_if_true:\s*"([^"]+)"/);
    const actionTrueSimpleMatch = nodeContent.match(/action_if_true:\s*([A-Z_]+)\s*\n/);

    if (actionTrueLineMatch) {
      node.action_if_true = actionTrueLineMatch[1];
    } else if (actionTrueSimpleMatch) {
      node.action_if_true = actionTrueSimpleMatch[1];
    } else {
      // Check for nested object (route/message/warning on subsequent lines)
      const actionTrueObjMatch = nodeContent.match(
        /action_if_true:\s*\n([\s\S]*?)(?=\n {4}action_if_false:|\n {4}next:|\n {2}Q\d+:|\n\n {2}Q|$)/
      );
      if (actionTrueObjMatch) {
        const nested = actionTrueObjMatch[1];
        const route = extractField(nested, 'route');
        const message = extractField(nested, 'message');
        const warning = extractField(nested, 'warning');
        if (route || message || warning) {
          node.action_if_true = {
            ...(route && { route }),
            ...(message && { message }),
            ...(warning && { warning }),
          };
        }
      }
    }

    // Extract action_if_false
    const actionFalse = extractField(nodeContent, 'action_if_false');
    if (actionFalse) {
      node.action_if_false = actionFalse;
    }

    // Extract condition if present (nested structure)
    const conditionMatch = nodeContent.match(
      /condition:\s*\n([\s\S]*?)(?=\n {4}action_|\n {4}next:)/
    );
    if (conditionMatch) {
      node.condition = { raw: normalizeLineEndings(conditionMatch[1].trim()) };
    }

    // Extract branches if present
    const branchesMatch = nodeContent.match(
      /branches:\s*\n([\s\S]*?)(?=\n {4}default_route:|\n {4}next:)/
    );
    if (branchesMatch) {
      node.branches = { raw: normalizeLineEndings(branchesMatch[1].trim()) };
    }

    tree[nodeId] = node;
  }

  return tree;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => (typeof item === 'string' ? item : String(item)))
    .filter((item) => item.length > 0);
}

function toStringRecord(value: unknown): Record<string, string> {
  if (!isPlainObject(value)) {
    return {};
  }

  const record: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string') {
      record[key] = entry;
    }
  }
  return record;
}

function normalizePatternEntry(value: unknown): Pattern | null {
  if (!isPlainObject(value)) {
    return null;
  }

  const id = typeof value.id === 'string' ? value.id : null;
  const category = typeof value.category === 'string' ? value.category : null;
  const target = typeof value.target === 'string' ? value.target : null;
  const priority =
    typeof value.priority === 'number'
      ? value.priority
      : Number.parseInt(String(value.priority ?? ''), 10);

  if (!id || !category || !target || Number.isNaN(priority)) {
    return null;
  }

  return {
    id,
    priority,
    category,
    keywords: toStringArray(value.keywords),
    target,
    ...(typeof value.command === 'string' ? { command: value.command } : {}),
    ...(typeof value.agent === 'string' ? { agent: value.agent } : {}),
    ...(typeof value.warning === 'string' ? { warning: value.warning } : {}),
    ...(typeof value.message === 'string' ? { message: value.message } : {}),
    ...(typeof value.gate === 'string' ? { gate: value.gate } : {}),
    ...(typeof value.secondary === 'string' ? { secondary: value.secondary } : {}),
    ...(Array.isArray(value.commands) ? { commands: toStringArray(value.commands) } : {}),
  };
}

function normalizeAgentEntry(value: unknown): AgentEntry | null {
  if (!isPlainObject(value)) {
    return null;
  }

  const name = typeof value.name === 'string' ? value.name : null;
  const skill = typeof value.skill === 'string' ? value.skill : null;
  const phase = Array.isArray(value.phase)
    ? value.phase
        .filter(
          (item): item is string | number => typeof item === 'string' || typeof item === 'number'
        )
        .map((item) => item)
    : [];

  if (!name || !skill) {
    return null;
  }

  return { name, skill, phase };
}

/**
 * Helper to extract a simple field value from YAML-like content
 */
function extractField(content: string, field: string): string | null {
  // Try quoted value first (handles spaces and special chars)
  const quotedMatch = content.match(new RegExp(`${field}:\\s*"([^"]+)"`));
  if (quotedMatch) {
    return quotedMatch[1];
  }
  // Fall back to unquoted single value
  const unquotedMatch = content.match(new RegExp(`${field}:\\s*(\\S+)`));
  if (unquotedMatch && !unquotedMatch[1].includes(':')) {
    return unquotedMatch[1];
  }
  return null;
}

// =============================================================================
// MAIN GENERATOR
// =============================================================================

async function main(): Promise<void> {
  const isCheckMode = process.argv.includes('--check');
  const isVerbose = process.argv.includes('--verbose');
  const generatedAt = isCheckMode ? '1970-01-01T00:00:00.000Z' : new Date().toISOString();

  console.log(`Discovery Map Generator ${isCheckMode ? '(check mode)' : '(generate mode)'}`);
  console.log('---');

  validateGlobSentinels();
  const trackedFiles = getTrackedFileSet();

  // 1. Load Source Config
  let rawConfig: string;
  try {
    rawConfig = normalizeLineEndings(await fs.readFile(SOURCE_FILE, 'utf8'));
  } catch {
    console.error(`ERROR: Source file not found: ${SOURCE_FILE}`);
    process.exit(1);
  }

  const sourceConfig = parseYamlObject<Record<string, unknown>>(rawConfig);
  const configuration = isPlainObject(sourceConfig.configuration) ? sourceConfig.configuration : {};
  const staleness = isPlainObject(sourceConfig.staleness) ? sourceConfig.staleness : {};
  const agents = isPlainObject(sourceConfig.agents) ? sourceConfig.agents : {};

  const config: DiscoveryConfig = {
    version: typeof sourceConfig.version === 'string' ? sourceConfig.version : '2.0',
    configuration: {
      min_score_to_route:
        typeof configuration.min_score_to_route === 'number' ? configuration.min_score_to_route : 2,
      staleness_cadence_default:
        typeof configuration.staleness_cadence_default === 'string'
          ? configuration.staleness_cadence_default
          : 'P180D',
      scan_paths: toStringArray(configuration.scan_paths),
      exclude_paths: toStringArray(configuration.exclude_paths),
      generic_terms: toStringArray(configuration.generic_terms),
    },
    decision_tree: isPlainObject(sourceConfig.decision_tree)
      ? (sourceConfig.decision_tree as Record<string, DecisionNode>)
      : {},
    patterns: Array.isArray(sourceConfig.patterns)
      ? sourceConfig.patterns
          .map(normalizePatternEntry)
          .filter((entry): entry is Pattern => entry !== null)
      : [],
    agents: {
      phoenix:
        isPlainObject(agents.phoenix) || !Array.isArray(agents.phoenix)
          ? []
          : agents.phoenix
              .map(normalizeAgentEntry)
              .filter((entry): entry is AgentEntry => entry !== null),
    },
    staleness: {
      execution_claim_patterns: toStringArray(staleness.execution_claim_patterns),
      cadence_overrides: toStringRecord(staleness.cadence_overrides),
    },
  };

  if (isVerbose) {
    console.log(`Loaded ${config.patterns.length} patterns`);
    console.log(`Loaded ${config.agents.phoenix.length} agents`);
    console.log(`Loaded ${Object.keys(config.decision_tree).length} decision tree nodes`);
  }

  // 2. Validate Configuration
  validatePatternPriorities(config.patterns);
  await validatePatternTargets(config.patterns);

  // 3. Scan Files
  console.log('Scanning documentation files...');
  const files = (
    await globFiles(config.configuration.scan_paths, config.configuration.exclude_paths)
  )
    .filter((file) => trackedFiles.has(normalizePath(file)))
    .sort(compareStrings);

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
      const normalizedFile = normalizePath(file);
      const content = normalizeLineEndings(await fs.readFile(normalizedFile, 'utf8'));
      const parsed = parseFrontmatter(content);

      const lastUpdatedStr = parsed.data.last_updated as string | undefined;
      const lastUpdated = lastUpdatedStr ? new Date(lastUpdatedStr) : null;

      const cadence = getStaleCadence(
        normalizedFile,
        config.staleness.cadence_overrides,
        config.configuration.staleness_cadence_default
      );

      // Cross-platform determinism: freeze "now" during check mode.
      const now = isCheckMode ? new Date('2000-01-01T00:00:00.000Z').getTime() : Date.now();
      const staleDays = lastUpdated
        ? Math.floor((now - lastUpdated.getTime()) / (24 * 60 * 60 * 1000))
        : 999;

      const isStale = lastUpdated ? now - lastUpdated.getTime() > cadence : true;

      const execClaims = hasExecutionClaims(content, config.staleness.execution_claim_patterns);

      const status = (parsed.data.status as string) || 'UNKNOWN';

      docsData.push({
        path: normalizedFile,
        exists: true,
        docType: getDocType(normalizedFile),
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

  docsData.sort((a, b) => compareStrings(a.path, b.path));

  // 4. Generate JSON Index
  const routerIndex: RouterIndex = {
    generatedAt,
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

  const jsonOutput = stableStringify(routerIndex);

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
    generatedAt,
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

  const fastOutput = stableStringify(routerFast);

  // 5. Generate Staleness Report
  const generatedDate = generatedAt.split('T')[0];
  let mdOutput = `---
last_updated: ${generatedDate}
---

# Staleness Report

*Generated: ${generatedAt}*
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
  .map(([status, count]) => `| ${escapeMarkdownTableCell(status)} | ${count} |`)
  .join('\n')}

## Stale Documents

Documents that need review (older than their cadence threshold):

`;

  const staleDocs = docsData.filter((d) => d.isStale).sort((a, b) => b.staleDays - a.staleDays);

  if (staleDocs.length === 0) {
    mdOutput += '*No stale documents found.*\n';
  } else {
    mdOutput += '| Document | Last Updated | Days Old | Has Execution Claims | Owner |\n';
    mdOutput += '|----------|--------------|----------|---------------------|-------|\n';

    for (const doc of staleDocs.slice(0, 50)) {
      // Limit to top 50
      const claims = doc.hasExecutionClaims ? 'YES - verify!' : 'No';
      const owner = escapeMarkdownTableCell(doc.owner || 'Unassigned');
      const docPath = escapeMarkdownTableCell(doc.path);
      mdOutput += `| \`${docPath}\` | ${doc.lastUpdated || 'Never'} | ${doc.staleDays} | ${claims} | ${owner} |\n`;
    }

    if (staleDocs.length > 50) {
      mdOutput += `\n*...and ${staleDocs.length - 50} more stale documents.*\n`;
    }
  }

  mdOutput += `
## Documents with Execution Claims (Need Verification)

These documents contain phrases like "tests pass", "PR merged", etc. and should be verified:

`;

  const execClaimDocs = docsData.filter((d) => d.hasExecutionClaims && d.isStale);
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

  const missingFm = docsData.filter((d) => Object.keys(d.frontmatter).length === 0);
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

    // For check mode, compare deterministic structure and doc path inventory,
    // not timestamps or staleness volatility.
    const existingParsed: unknown = existingJson ? JSON.parse(existingJson) : null;
    const newParsed: unknown = JSON.parse(jsonOutput);
    const existingFastParsed: unknown = existingFast ? JSON.parse(existingFast) : null;
    const newFastParsed: unknown = JSON.parse(fastOutput);

    function toStructuralRouterIndex(obj: unknown): Record<string, unknown> | null {
      if (!obj || typeof obj !== 'object') return null;
      const record = obj as Record<string, unknown>;
      return {
        version: record.version ?? null,
        config: record.config ?? null,
        decision_tree: record.decision_tree ?? null,
        patterns: record.patterns ?? null,
        agents: record.agents ?? null,
      };
    }

    function toStructuralRouterFast(obj: unknown): Record<string, unknown> | null {
      if (!obj || typeof obj !== 'object') return null;
      const record = obj as Record<string, unknown>;
      return {
        version: record.version ?? null,
        scoring: record.scoring ?? null,
        config: record.config ?? null,
        patterns: record.patterns ?? null,
        keyword_to_docs: record.keyword_to_docs ?? null,
      };
    }

    const existingDocPaths = getRouterDocPaths(existingParsed);
    const newDocPaths = getRouterDocPaths(newParsed);
    const existingUntrackedDocPaths = getUntrackedPaths(existingDocPaths, trackedFiles);
    const localPollutionMentions = [
      ...findUntrackedLocalPathMentions(existingJson, trackedFiles).map(
        (filePath) => `${OUT_JSON}: ${filePath}`
      ),
      ...findUntrackedLocalPathMentions(existingStaleness, trackedFiles).map(
        (filePath) => `${OUT_STALENESS}: ${filePath}`
      ),
    ].sort(compareStrings);

    const jsonMatch =
      stableStringify(toStructuralRouterIndex(existingParsed)) ===
      stableStringify(toStructuralRouterIndex(newParsed));
    const docsInventoryMatch = stableStringify(existingDocPaths) === stableStringify(newDocPaths);
    const existingStatsMatch = getRouterTotalDocs(existingParsed) === existingDocPaths.length;
    const newStatsMatch = getRouterTotalDocs(newParsed) === newDocPaths.length;
    const fastMatch =
      stableStringify(toStructuralRouterFast(existingFastParsed)) ===
      stableStringify(toStructuralRouterFast(newFastParsed));

    // For staleness report, just check if it exists (content will differ due to timestamps)
    const stalenessExists = existingStaleness.length > 0;
    const trackedInventoryOnly = existingUntrackedDocPaths.length === 0;
    const noLocalPollutionMentions = localPollutionMentions.length === 0;

    if (
      !jsonMatch ||
      !docsInventoryMatch ||
      !existingStatsMatch ||
      !newStatsMatch ||
      !trackedInventoryOnly ||
      !noLocalPollutionMentions ||
      !fastMatch ||
      !stalenessExists
    ) {
      console.error('ERROR: Generated files are out of sync with source!');
      console.error('Run: npm run docs:routing:generate');
      if (!jsonMatch) console.error('  - router-index.json needs regeneration');
      if (!docsInventoryMatch) {
        console.error('  - router-index.json doc inventory differs from deterministic scan');
      }
      if (!existingStatsMatch) {
        console.error('  - existing router-index.json stats.total_docs does not match docs.length');
      }
      if (!newStatsMatch) {
        console.error(
          '  - generated router-index.json stats.total_docs does not match docs.length'
        );
      }
      if (!trackedInventoryOnly) {
        console.error('  - existing router-index.json contains untracked doc paths:');
        for (const filePath of existingUntrackedDocPaths) {
          console.error(`    - ${filePath}`);
        }
      }
      if (!noLocalPollutionMentions) {
        console.error('  - generated artifacts contain untracked local path mentions:');
        for (const mention of localPollutionMentions) {
          console.error(`    - ${mention}`);
        }
      }
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
    console.log(
      `Stats: ${stats.total_docs} docs, ${stats.stale_docs} stale, ${stats.missing_frontmatter} missing frontmatter`
    );
  }
}

main().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
