/**
 * Fast Query Router
 *
 * Consumer-side router that matches user queries against routing patterns.
 * Uses the pre-generated router-fast.json for fast pattern matching.
 *
 * Usage:
 *   import { routeQueryFast, loadRouterIndex } from './routeQueryFast';
 *   const index = await loadRouterIndex();
 *   const result = routeQueryFast('help with waterfall clawback', index);
 *
 * Scoring:
 *   - Each matched phrase adds 1 to score
 *   - Generic terms (test, error, fix) subtract 0.5 penalty
 *   - Tie-breakers: score DESC -> priority ASC -> array order ASC
 */

import fs from 'node:fs/promises';
import path from 'node:path';

// =============================================================================
// TYPES
// =============================================================================

export interface RouterFast {
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

export interface RouterFastPattern {
  id: string;
  priority: number;
  match_any: string[];
  match_any_normalized: string[];
  route_to: string;
  why: string;
  command?: string;
  agent?: string;
}

export interface RouteResult {
  matched: boolean;
  route_to: string | null;
  pattern_id: string | null;
  score: number;
  why: string | null;
  command?: string;
  agent?: string;
  alternatives: AlternativeRoute[];
}

export interface AlternativeRoute {
  route_to: string;
  pattern_id: string;
  score: number;
  why: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const ROUTER_FAST_PATH = path.join(process.cwd(), 'docs/_generated/router-fast.json');
const GENERIC_TERM_PENALTY = 0.5;
const MIN_SCORE_TO_ROUTE = 1;

// =============================================================================
// MAIN ROUTER FUNCTION
// =============================================================================

/**
 * Route a user query to the best matching documentation/command/agent.
 *
 * @param query - The user's query string
 * @param index - The pre-loaded router-fast.json index
 * @returns RouteResult with the best match and alternatives
 */
export function routeQueryFast(query: string, index: RouterFast): RouteResult {
  const normalizedQuery = query.toLowerCase().trim();

  if (!normalizedQuery) {
    return {
      matched: false,
      route_to: null,
      pattern_id: null,
      score: 0,
      why: 'Empty query',
      alternatives: [],
    };
  }

  const genericTerms = new Set(index.scoring.generic_terms.map(t => t.toLowerCase()));
  const minScore = index.scoring.min_score || MIN_SCORE_TO_ROUTE;

  // Score each pattern
  const scoredPatterns: Array<{
    pattern: RouterFastPattern;
    score: number;
    matchedPhrases: string[];
  }> = [];

  for (const pattern of index.patterns) {
    let score = 0;
    const matchedPhrases: string[] = [];

    // Use pre-normalized keywords if available (more efficient)
    const normalizedPhrases = pattern.match_any_normalized || pattern.match_any.map(p => p.toLowerCase());

    for (let i = 0; i < normalizedPhrases.length; i++) {
      const normalizedPhrase = normalizedPhrases[i];
      if (normalizedQuery.includes(normalizedPhrase)) {
        matchedPhrases.push(pattern.match_any[i]);

        // Check if this is a generic term
        const words = normalizedPhrase.split(/\s+/);
        const isGeneric = words.every(w => genericTerms.has(w));

        if (isGeneric) {
          score += 1 - GENERIC_TERM_PENALTY; // Add 0.5 for generic terms
        } else {
          score += 1; // Full point for specific terms
        }
      }
    }

    if (score > 0) {
      scoredPatterns.push({ pattern, score, matchedPhrases });
    }
  }

  // Sort by: score DESC, priority ASC, array order ASC (implicit)
  scoredPatterns.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.pattern.priority - b.pattern.priority;
  });

  // Check if best match meets minimum score
  if (scoredPatterns.length === 0 || scoredPatterns[0].score < minScore) {
    // Try fallback via keyword_to_docs
    const fallbackDocs = findFallbackDocs(normalizedQuery, index.keyword_to_docs);

    if (fallbackDocs.length > 0) {
      return {
        matched: true,
        route_to: fallbackDocs[0],
        pattern_id: 'fallback',
        score: 0.5,
        why: 'Keyword fallback match',
        alternatives: fallbackDocs.slice(1, 4).map(doc => ({
          route_to: doc,
          pattern_id: 'fallback',
          score: 0.5,
          why: 'Keyword fallback match',
        })),
      };
    }

    return {
      matched: false,
      route_to: null,
      pattern_id: null,
      score: scoredPatterns[0]?.score || 0,
      why: `Score ${scoredPatterns[0]?.score || 0} below minimum ${minScore}`,
      alternatives: [],
    };
  }

  const best = scoredPatterns[0];
  const alternatives = scoredPatterns.slice(1, 4).map(sp => ({
    route_to: sp.pattern.route_to,
    pattern_id: sp.pattern.id,
    score: sp.score,
    why: sp.pattern.why,
  }));

  return {
    matched: true,
    route_to: best.pattern.route_to,
    pattern_id: best.pattern.id,
    score: best.score,
    why: best.pattern.why,
    command: best.pattern.command,
    agent: best.pattern.agent,
    alternatives,
  };
}

/**
 * Find documents via keyword_to_docs fallback map
 */
function findFallbackDocs(query: string, keywordToDocs: Record<string, string[]>): string[] {
  const words = query.split(/\s+/).filter(w => w.length > 2);
  const docCounts = new Map<string, number>();

  for (const word of words) {
    const docs = keywordToDocs[word];
    if (docs) {
      for (const doc of docs) {
        docCounts.set(doc, (docCounts.get(doc) || 0) + 1);
      }
    }
  }

  // Sort by count descending
  return [...docCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([doc]) => doc);
}

// =============================================================================
// LOADER
// =============================================================================

/**
 * Load the router-fast.json index from disk.
 * Cache the result for repeated calls.
 */
let cachedIndex: RouterFast | null = null;

export async function loadRouterIndex(indexPath?: string): Promise<RouterFast> {
  if (cachedIndex) {
    return cachedIndex;
  }

  const filePath = indexPath || ROUTER_FAST_PATH;
  const content = await fs.readFile(filePath, 'utf8');
  cachedIndex = JSON.parse(content) as RouterFast;
  return cachedIndex;
}

/**
 * Clear the cached index (for testing or when regenerating)
 */
export function clearRouterCache(): void {
  cachedIndex = null;
}

// =============================================================================
// CLI INTERFACE
// =============================================================================

type OutputFormat = 'default' | 'hook' | 'json';

/**
 * Format result for hook consumption (discovery-hook.sh)
 */
function formatForHook(result: RouteResult): string {
  if (!result.matched) {
    return '';
  }

  const lines: string[] = [];

  // Determine confidence level
  let confidence = 'LOW';
  if (result.score >= 3) {
    confidence = 'HIGH';
  } else if (result.score >= 2) {
    confidence = 'MEDIUM';
  }

  lines.push('');
  lines.push('==============================================');
  lines.push('ROUTER DISCOVERY (auto-generated)');
  lines.push('==============================================');
  lines.push(`Confidence: ${confidence} (score: ${result.score.toFixed(1)})`);
  lines.push('');
  lines.push('Best match:');

  if (result.agent) {
    lines.push(`  [AGENT] Use Task tool: subagent_type='${result.agent}'`);
  }
  if (result.command) {
    lines.push(`  [COMMAND] Run: ${result.command}`);
  }
  if (result.route_to && !result.agent && !result.command) {
    lines.push(`  [DOC] Reference: ${result.route_to}`);
  }

  if (result.alternatives.length > 0) {
    lines.push('');
    lines.push('Alternatives:');
    for (const alt of result.alternatives.slice(0, 3)) {
      lines.push(`  - ${alt.route_to} (score: ${alt.score.toFixed(1)})`);
    }
  }

  lines.push('');
  lines.push('Use recommended assets before implementing from scratch.');
  lines.push('==============================================');
  lines.push('');

  return lines.join('\n');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Parse flags
  let format: OutputFormat = 'default';
  const queryParts: string[] = [];

  for (const arg of args) {
    if (arg === '--format=hook') {
      format = 'hook';
    } else if (arg === '--format=json') {
      format = 'json';
    } else if (arg.startsWith('--format=')) {
      console.error(`Unknown format: ${arg}`);
      process.exit(1);
    } else {
      queryParts.push(arg);
    }
  }

  if (queryParts.length === 0) {
    console.log('Usage: npx tsx scripts/routeQueryFast.ts [--format=hook|json] "<query>"');
    console.log('');
    console.log('Formats:');
    console.log('  default  Human-readable output');
    console.log('  hook     Formatted for discovery hook injection');
    console.log('  json     Machine-readable JSON');
    console.log('');
    console.log('Examples:');
    console.log('  npx tsx scripts/routeQueryFast.ts "help with waterfall"');
    console.log('  npx tsx scripts/routeQueryFast.ts --format=hook "run phoenix truth cases"');
    console.log('  npx tsx scripts/routeQueryFast.ts --format=json "fix test failures"');
    process.exit(0);
  }

  const query = queryParts.join(' ');

  try {
    const index = await loadRouterIndex();
    const result = routeQueryFast(query, index);

    // Output based on format
    if (format === 'json') {
      console.log(JSON.stringify(result, null, 2));
    } else if (format === 'hook') {
      const hookOutput = formatForHook(result);
      if (hookOutput) {
        console.log(hookOutput);
      }
      // Exit silently if no match (hook should pass through)
    } else {
      // Default format
      console.log('Query:', query);
      console.log('---');

      if (result.matched) {
        console.log('MATCH: ' + result.pattern_id);
        console.log('Route: ' + result.route_to);
        console.log('Score: ' + result.score.toFixed(1));
        console.log('Why:   ' + result.why);

        if (result.command) {
          console.log('Command: ' + result.command);
        }
        if (result.agent) {
          console.log('Agent: ' + result.agent);
        }

        if (result.alternatives.length > 0) {
          console.log('');
          console.log('Alternatives:');
          for (const alt of result.alternatives) {
            console.log(`  - ${alt.pattern_id}: ${alt.route_to} (score: ${alt.score.toFixed(1)})`);
          }
        }
      } else {
        console.log('NO MATCH');
        console.log('Reason: ' + result.why);
      }
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      console.error('ERROR: router-fast.json not found.');
      console.error('Run: npm run docs:routing:generate');
      process.exit(1);
    }
    throw err;
  }
}

// Run CLI if executed directly
if (import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  main().catch(err => {
    console.error('ERROR:', err.message);
    process.exit(1);
  });
}
