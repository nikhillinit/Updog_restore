import { readFile } from 'node:fs/promises';
import console from 'node:console';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const LOCKED_G3_CONTEXTS = Object.freeze([
  'CI Gate Status',
  'Build Production',
  'Dependency Validation (Linux)',
  'Security Integration Tests',
  'Neon Transaction Lane',
  'Testcontainers',
  'analyze',
  'security-scan',
]);

const SHA = /^[a-f0-9]{40}$/;
const SELF_REFERENCE = 'G3 Exact-SHA Verdict';
const SUCCESS = 'success';

function fail(message) {
  throw new Error(`Exact-SHA evidence failed: ${message}`);
}

function requireSha(value, label) {
  if (typeof value !== 'string' || !SHA.test(value)) fail(`${label} must be a lowercase 40-character SHA`);
  return value;
}

function attemptTimestamp(entry) {
  const value = entry.started_at ?? entry.created_at ?? 0;
  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? Number(value) || 0 : parsed;
}

function compareAttempts(left, right) {
  if (left.timestamp !== right.timestamp) return left.timestamp - right.timestamp;
  return String(left.id).localeCompare(String(right.id), undefined, { numeric: true });
}

function contextFor(entry) {
  return String(entry.name ?? entry.context ?? '').trim();
}

function shaFor(entry) {
  return entry.head_sha ?? entry.sha ?? entry.commit?.sha;
}

function terminalSuccess(entry, provider) {
  if (provider === 'check') return entry.status === 'completed' && entry.conclusion === SUCCESS;
  return entry.state === SUCCESS;
}

function evidenceEntries(entries, provider, candidateSha) {
  if (!Array.isArray(entries)) fail(`${provider} evidence is not an array`);
  return entries
    .filter((entry) => shaFor(entry) === candidateSha)
    .map((entry) => ({
      context: contextFor(entry),
      provider,
      success: terminalSuccess(entry, provider),
      timestamp: attemptTimestamp(entry),
      id: entry.id ?? '',
      appId: provider === 'check' ? entry.app?.id : undefined,
    }))
    .filter((entry) => entry.context !== '');
}

export function assertBranchProtectionReadable(protection) {
  if (!protection || protection.status === 403 || protection.status === 404 || protection.error) {
    fail('branch protection could not be read');
  }
  const statusChecks = protection.required_status_checks;
  const contexts = Array.isArray(statusChecks?.contexts) ? statusChecks.contexts : [];
  const checks = Array.isArray(statusChecks?.checks) ? statusChecks.checks : [];
  const requirements = new Map(contexts.map((context) => [`${String(context)}:unbound`, { context: String(context) }]));
  for (const check of checks) {
    const context = String(check?.context ?? '');
    if (!context) continue;
    const appId = check?.app_id;
    if (appId === undefined || appId === null) {
      requirements.set(`${context}:unbound`, { context });
      continue;
    }
    // An app-bound requirement supersedes an unbound duplicate from contexts,
    // but multiple required apps for one context remain independent gates.
    requirements.delete(`${context}:unbound`);
    requirements.set(`${context}:app:${appId}`, { context, appId });
  }
  if (requirements.size === 0) fail('branch protection does not contain required contexts');
  return [...requirements.values()];
}

export async function collectPaginated(fetchPage, initialPage = undefined) {
  const results = [];
  let page = initialPage;
  let first = true;
  const visited = new Set();
  while (first || page) {
    first = false;
    const result = await fetchPage(page);
    if (!result || !Array.isArray(result.items)) fail('pagination response is incomplete');
    results.push(...result.items);
    page = result.next ?? null;
    if (page && visited.has(String(page))) fail('pagination repeated a page');
    if (page) visited.add(String(page));
  }
  return results;
}

export function aggregateExactShaEvidence({ candidateSha, protection, checkRuns, statuses }) {
  const exactSha = requireSha(candidateSha, 'candidate SHA');
  const requirements = assertBranchProtectionReadable(protection);
  for (const context of LOCKED_G3_CONTEXTS) {
    if (!requirements.some((requirement) => requirement.context === context)) requirements.push({ context });
  }
  const contexts = [...new Set(requirements.map((requirement) => requirement.context))].sort();
  if (contexts.includes(SELF_REFERENCE)) fail('branch protection has a self-reference to G3 Exact-SHA Verdict');

  const entries = [
    ...evidenceEntries(checkRuns, 'check', exactSha),
    ...evidenceEntries(statuses, 'status', exactSha),
  ];
  const latestByProviderAndContext = new Map();
  for (const entry of entries) {
    const key = `${entry.provider}:${entry.context}:${entry.appId ?? ''}`;
    const current = latestByProviderAndContext.get(key);
    if (!current || compareAttempts(entry, current) >= 0) latestByProviderAndContext.set(key, entry);
  }

  for (const requirement of requirements) {
    const context = requirement.context;
    const matching = [...latestByProviderAndContext.values()].filter((entry) =>
      entry.context === context &&
      (requirement?.appId === undefined || (entry.provider === 'check' && entry.appId === requirement.appId))
    );
    if (matching.length === 0) fail(`missing required context ${context} on candidate SHA`);
    const failed = matching.find((entry) => !entry.success);
    if (failed) fail(`latest ${failed.provider} result for ${context} is not terminal success`);
  }

  return { candidateSha: exactSha, contexts, entries: [...latestByProviderAndContext.values()] };
}

export function redactSecretShapedValues(value, key = '') {
  if (/token|secret|password|authorization|cookie|api.?key/i.test(key)) return '[REDACTED]';
  if (Array.isArray(value)) return value.map((item) => redactSecretShapedValues(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, redactSecretShapedValues(item, name)]));
  }
  if (typeof value === 'string' && /:\/\/[^/\s:@]+:[^/\s@]+@|[?&](?:token|secret|key|password)=/i.test(value)) {
    return '[REDACTED]';
  }
  return value;
}

async function main() {
  const [inputPath] = process.argv.slice(2);
  if (!inputPath) fail('expected one JSON evidence file path');
  const evidence = JSON.parse(await readFile(inputPath, 'utf8'));
  const result = aggregateExactShaEvidence(evidence);
  console.log(`Exact-SHA contexts passed: ${result.contexts.length}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'Exact-SHA evidence failed');
    process.exitCode = 1;
  });
}
