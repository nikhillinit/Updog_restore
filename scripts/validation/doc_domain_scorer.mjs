// ESM module for promptfoo custom scorer
// Usage: reference in promptfoo YAML via `scorers: - path: scripts/validation/doc_domain_scorer.mjs`
import fs from 'node:fs';

function readMaybeFile(value) {
  // allow file:// expansion or raw strings
  if (typeof value !== 'string') return value;
  if (value.startsWith('file://')) {
    const p = value.replace('file://', '');
    return fs.readFileSync(p, 'utf8');
  }
  return value;
}


/**
 * Extract domain-specific keywords with case-insensitive matching
 * @param {string} documentContent - Document text to analyze
 * @returns {string[]} - Weighted keywords for the detected domain
 */
function extractDomainKeywords(documentContent) {
  if (!documentContent) return [];

  const content = documentContent.toLowerCase();

  // Capital Allocation domain detection
  if (content.includes('capital allocation') ||
      content.includes('reserve engine') ||
      content.includes('pacing engine')) {
    return [
      'reserve engine', 'pacing engine', 'cohort engine',
      'reserve policy', 'pacing window', 'cohort weight',
      'rebalancing', 'capital allocation', 'cash buffer',
      'reserve target', 'carryover', 'spill reallocation'
    ];
  }

  // Fees domain (existing patterns)
  if (content.includes('management fee') || content.includes('performance fee')) {
    return [
      'management fee', 'performance fee', 'carried interest',
      'hurdle rate', 'catch-up', 'fee calculation'
    ];
  }

  // Exit Recycling domain (existing patterns)
  if (content.includes('exit recycling') || content.includes('recycling cap')) {
    return [
      'exit recycling', 'eligibility', 'recycling cap',
      'distribution waterfall', 'exit proceeds'
    ];
  }

  // Fallback for generic documentation
  return ['calculation', 'formula', 'implementation', 'validation'];
}

/**
 * Detect negative/contradictory statements that invalidate documentation
 * @param {string} output - Model output (lowercase)
 * @returns {number} - Penalty score (0.0-0.10)
 */
function detectContradictions(output) {
  const contradictions = [
    /reserve\s+(?:does\s+not|doesn't)\s+override\s+pacing/i,
    /pacing\s+(?:takes\s+)?precedence\s+over\s+reserve/i,
    /cohort\s+(?:does\s+not|doesn't)\s+use\s+weights/i,
    /carryover\s+(?:is\s+)?(?:not\s+)?ignored/i
  ];

  return contradictions.some(rx => rx.test(output)) ? 0.10 : 0;
}

export default async function scorer({ output, vars }) {
  // Expect vars: { doc_content, truth_cases, schema, doc_type }
  const docType = vars?.doc_type || 'primary_documentation';

  const docContent = readMaybeFile(vars?.doc_content ?? '');
  const truthCasesRaw = readMaybeFile(vars?.truth_cases ?? '[]');
  const schemaRaw = readMaybeFile(vars?.schema ?? '{}');

  // Safe parse
  let truthCases = [];
  try { truthCases = JSON.parse(truthCasesRaw); } catch {}
  let schema = {};
  try { schema = JSON.parse(schemaRaw); } catch {}

  const out = (output || '').toLowerCase();

  // Determine domain-specific key phrases based on doc content
  const domainKeyPhrases = (() => {
    const dc = docContent.toLowerCase();
    // Fee documentation detection
    if (dc.includes('management fee') || dc.includes('performance fee')) {
      return [
        'management fee',
        'performance fee',
        'fee basis',
        'hurdle',
        'catch-up',
        'carried interest',
        'fee calculation',
      ];
    }
    // Exit recycling documentation detection
    if (dc.includes('exit recycling') || dc.includes('recycling cap')) {
      return [
        'exit recycling',
        'eligibility',
        'carryforward',
        'capacity',
        'schedule',
        'cap enforcement',
        'term validation',
      ];
    }
    // Fallback: extract key terms from doc content
    return ['calculation', 'formula', 'implementation', 'validation'];
  })();

  // 1) Domain concept coverage
  const conceptHits = domainKeyPhrases.filter(p => out.includes(p)).length;
  const conceptScore = domainKeyPhrases.length ? (conceptHits / domainKeyPhrases.length) : 0.5;

  // 2) Schema vocabulary alignment
  const schemaProps = Object.keys(schema.properties || {}).slice(0, 15);
  const schemaHits = schemaProps.filter(k => out.includes(k.toLowerCase())).length;
  const schemaScore = schemaProps.length ? (schemaHits / schemaProps.length) : 0.5;

  // 3) Code reference quality (file:line patterns)
  const codeRefMatches = output.match(/\w+\.(ts|tsx|js|mjs):\d+/g) || [];
  const codeRefScore = Math.min(1, codeRefMatches.length / 5); // 5+ refs = full score

  // 4) Consistency with doc content
  const overlapScore = (() => {
    if (!docContent) return 0.5;
    const dc = docContent.toLowerCase();
    const hits = domainKeyPhrases.filter(p => out.includes(p) && dc.includes(p)).length;
    return domainKeyPhrases.length ? (hits / domainKeyPhrases.length) : 0.5;
  })();

  // Weighted aggregate (adjusted for general use)
  const score = (
    0.30 * conceptScore +
    0.25 * schemaScore +
    0.25 * codeRefScore +
    0.20 * overlapScore
  );

  const pass = score >= 0.75;

  // Reason string for debugging
  const reason = [
    `concepts: ${conceptHits}/${domainKeyPhrases.length}`,
    `schema_vocab: ${schemaHits}/${schemaProps.length}`,
    `code_refs: ${codeRefMatches.length}`,
    `overlap: ${overlapScore.toFixed(2)}`,
    `aggregate: ${score.toFixed(2)} (threshold 0.75)`,
  ].join(' | ');

  return { pass, score, reason };
}
