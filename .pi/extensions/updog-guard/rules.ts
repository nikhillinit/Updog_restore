/**
 * Pure guard rules for the Updog_restore Pi harness. No Pi imports, so this
 * file runs under `node --test` (see rules.test.ts) as well as inside Pi.
 *
 * Tiers:
 *   hard    - always blocked (owner-only production actions, secrets, VCS internals)
 *   confirm - asks in the UI; blocked when no UI is available (fail closed)
 *
 * Patterns match the whole command string. They are a seatbelt against
 * accidents, not a sandbox: bash can still reach anything the user can.
 */

export type Tier = 'hard' | 'confirm';

export interface Rule {
  id: string;
  tier: Tier;
  /** A RegExp or any predicate with the same shape. */
  test: { test(subject: string): boolean };
  reason: string;
}

/** `.env`, `.env.local`, ... but not any `*.example` template. */
const ENV_FILE = /(^|\/)\.env(\.[^/]*)?$(?<!\.example)/;

/** Any force spelling: -f, combined short flags, --force, --force-with-lease[=..], --force-if-includes. */
const FORCE = String.raw`\s(-[a-zA-Z]*f[a-zA-Z]*|--force(-with-lease|-if-includes)?(=\S*)?)(\s|$)`;

/** `git` plus any global options (`-C dir`, `-c k=v`, `--git-dir=..`, `--no-pager`, ...) before the subcommand. */
const GIT = String.raw`\bgit(?:\s+(?:-[Cc]\s+\S+|--(?:git-dir|work-tree|namespace|exec-path)(?:=\S+|\s+\S+)|--[\w-]+(?:=\S+)?|-[pP]))*\s+`;
const git = (rest: string) => new RegExp(GIT + rest);
const MAIN = String.raw`(refs\/heads\/)?(main|master)(\s|$|[;&|)<>])`;

/** Any `git push`, including with global options. Used to forward to git-guard-hook.mjs. */
export const GIT_PUSH = git(String.raw`push\b`);

const FORCE_TOKEN = /^(-[a-zA-Z]*f[a-zA-Z]*|--force(-with-lease|-if-includes)?(=.*)?)$/;
const VALUE_FLAGS = new Set(['-o', '--push-option', '--receive-pack', '--exec']);
/** Redirections with optional fd and attached or separated target: `2>/dev/null`, `2>&1`, `> out`, `<in`. */
const REDIRECT = /\d*(?:[<>]+&?|&>>?)[ \t]*[^\s<>]*/g;

/**
 * True when a forced `git push` has no explicit destination: no refspec, or
 * only HEAD/@. Git then resolves the target from whatever repository, branch,
 * and push.default apply (`cd`, `-C`, upstream), which text matching cannot
 * know, so the guard requires the agent to name the branch.
 */
export function isImplicitForcePush(command: string): boolean {
  for (const segment of command.split(/[;&|\n]/)) {
    const m = GIT_PUSH.exec(segment);
    if (!m) continue;
    const tokens = segment
      .slice(m.index + m[0].length)
      .replace(REDIRECT, ' ')
      .split(/\s+/)
      .filter(Boolean);
    let force = false;
    let remoteFromFlag = false;
    const positional: string[] = [];
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (t === '--repo') {
        remoteFromFlag = true;
        i++;
      } else if (t.startsWith('--repo=')) remoteFromFlag = true;
      else if (VALUE_FLAGS.has(t)) i++;
      else if (FORCE_TOKEN.test(t)) force = true;
      else if (!t.startsWith('-')) positional.push(t);
    }
    // With --repo the remote is not positional, so every positional is a refspec.
    const refspecs = remoteFromFlag ? positional : positional.slice(1);
    if (refspecs.some((r) => r.startsWith('+'))) force = true;
    const destinations = refspecs.map((r) => r.replace(/^\+/, '').split(':').pop() ?? '');
    if (
      force &&
      (destinations.length === 0 ||
        destinations.every((d) => d === 'HEAD' || d === '@' || d === ''))
    )
      return true;
  }
  return false;
}

export const BASH_RULES: Rule[] = [
  // Owner-only production routes (docs/governance/solo-internal-change-and-production-policy.md).
  {
    id: 'db-push',
    tier: 'hard',
    test: /\bnpm\s+run\s+db:push\b|\bdrizzle-kit\s+push\b/,
    reason:
      'Schema push is not an agent action; production schema uses the canonical workflow route.',
  },
  {
    id: 'prod-provision',
    tier: 'hard',
    test: /provision-prod-users(\.ts)?\b[^\n]*--apply\b/,
    reason: 'provision-prod-users --apply is owner-run only (ADR-105).',
  },
  {
    id: 'prod-dispatch',
    tier: 'hard',
    test: /\bgh\s+workflow\s+run\b[^\n]*(prod|release-production|release-canary|production-action)/,
    reason:
      'Production workflow dispatch is owner-only; evidence never supplies dispatch authority.',
  },
  {
    id: 'vercel-prod',
    tier: 'hard',
    test: /\bvercel\b[^\n]*(\s--prod\b|\spromote\b|\srollback\b)/,
    reason: 'Vercel production promotion is owner-only.',
  },
  {
    id: 'force-push-refspec-main',
    tier: 'hard',
    test: git(String.raw`push\b[^\n]*\s\+(\S*:)?${MAIN}`),
    reason: 'Force push to main/master is not allowed.',
  },
  {
    id: 'force-push-main',
    tier: 'hard',
    test: git(String.raw`push\b(?=[^\n]*${FORCE})[^\n]*\s(\S+:)?${MAIN}`),
    reason: 'Force push to main/master is not allowed.',
  },
  {
    id: 'force-push-collective',
    tier: 'hard',
    test: git(
      String.raw`push\b(?:(?=[^\n]*\s--mirror(\s|$))|(?=[^\n]*${FORCE})(?=[^\n]*\s--all(\s|$)))`
    ),
    reason: 'Mirror or forced --all push can rewrite main/master.',
  },
  {
    id: 'force-push-implicit',
    tier: 'hard',
    test: { test: isImplicitForcePush },
    reason:
      'Force push without an explicit destination branch can reach main/master; name the branch (git push --force-with-lease origin <branch>).',
  },
  {
    id: 'delete-main',
    tier: 'hard',
    test: git(String.raw`push\b[^\n]*(\s:${MAIN}|\s(--delete|-d)\b[^\n]*\s${MAIN})`),
    reason: 'Deleting remote main/master is not allowed.',
  },
  {
    id: 'force-push',
    tier: 'confirm',
    test: git(String.raw`push\b(?=[^\n]*(${FORCE}|\s\+\S))`),
    reason: 'Force push rewrites remote history.',
  },
  // Secrets entering the transcript (sessions are exportable; see Pi docs/security.md).
  {
    id: 'secret-read',
    tier: 'confirm',
    test: /\b(cat|less|more|head|tail|bat|source)\s+(-\S+\s+)*(\S+\/)?\.env(?!\.example\b)(\.[\w-]+)?(?=\s|$|[;|&)])/,
    reason: 'Prints a secret env file into the session transcript.',
  },
  // Destructive or policy-sensitive local actions.
  {
    id: 'rm-recursive',
    tier: 'confirm',
    test: /\brm\s+(-[a-zA-Z]*[rR][a-zA-Z]*|--recursive)\b/,
    reason: 'Recursive delete.',
  },
  { id: 'sudo', tier: 'confirm', test: /\bsudo\b/, reason: 'Privilege escalation.' },
  {
    id: 'reset-hard',
    tier: 'confirm',
    test: git(String.raw`reset\s+--hard\b`),
    reason: 'Discards uncommitted work; back up state first (AGENT-SAFETY.md).',
  },
  {
    id: 'rebase-merge',
    tier: 'confirm',
    test: git(String.raw`(rebase|merge)(\s|$)`),
    reason: 'Back up state that moves tracked -> ignored before rebase/merge (AGENT-SAFETY.md).',
  },
  {
    id: 'git-clean',
    tier: 'confirm',
    test: git(String.raw`clean\b[^\n]*\s(-[a-zA-Z]*f|--force)`),
    reason: 'Deletes untracked files.',
  },
  // restore: anything except a pure unstage (--staged/-S without --worktree/-W); forced switch or branch reset.
  {
    id: 'discard-tree',
    tier: 'confirm',
    test: git(
      String.raw`(restore\b(?:(?![^\n]*\s(--staged|-S)(\s|$))|(?=[^\n]*\s(--worktree|-W)(\s|$)))|switch\b[^\n]*\s(-f|--force|--discard-changes|-C\S*|--force-create(=\S*)?)(\s|$))`
    ),
    reason: 'Discards working-tree changes or resets a branch.',
  },
  // Legacy checkout cannot be told apart from a path restore (`git checkout README.md`); only new-branch creation passes (-B resets).
  {
    id: 'checkout',
    tier: 'confirm',
    test: git(String.raw`checkout\b(?!\s+(-b|--orphan)\s(?![^\n]*\s(-f|--force)(\s|$)))`),
    reason:
      'git checkout can discard working-tree paths; prefer git switch / git restore --staged.',
  },
  {
    id: 'stash-drop',
    tier: 'confirm',
    test: git(String.raw`stash\s+(drop|clear)\b`),
    reason: 'Drops stashed work.',
  },
  {
    id: 'branch-delete',
    tier: 'confirm',
    test: git(String.raw`branch\s+-D\b`),
    reason: 'Force-deletes a branch.',
  },
  {
    id: 'add-all',
    tier: 'confirm',
    test: git(String.raw`add\s+(-A|--all|\.)(\s|$)`),
    reason: 'Bulk staging near live agent state (AGENT-SAFETY.md); stage explicit paths.',
  },
  {
    id: 'hook-bypass',
    tier: 'confirm',
    test: new RegExp(
      String.raw`--no-verify\b|\bHUSKY=0\b|` +
        GIT +
        String.raw`commit\b[^\n]*\s-[a-zA-Z]*n[a-zA-Z]*(\s|$)`
    ),
    reason:
      'Hook bypass requires documented isolation evidence and an owner action (AGENT-SAFETY.md).',
  },
  {
    id: 'dependency-change',
    tier: 'confirm',
    test: /\bnpm\s+(install|i|add|uninstall|remove|rm|un)\b[^\n;&|]*\s(?!-)[@\w]/,
    reason: 'Dependency change edits package.json (Claude deny list).',
  },
  {
    id: 'workflow-run',
    tier: 'confirm',
    test: /\bgh\s+workflow\s+run\b/,
    reason: 'Dispatches a CI workflow.',
  },
  {
    id: 'pr-merge',
    tier: 'confirm',
    test: /\bgh\s+pr\s+merge\b/,
    reason: 'Merge is source admission; requires current-head CI Gate Status.',
  },
  {
    id: 'github-write',
    tier: 'confirm',
    test: /\bgh\s+(pr\s+(create|comment|review|close|reopen|ready|edit)|issue\s+(create|comment|close|edit)|release\s+(create|edit|delete)|api\b[^\n]*(-X|--method)(\s*|=)(POST|PUT|PATCH|DELETE))\b|\bgh\s+api\b(?![^\n]*(-X|--method)(\s*|=)GET\b)[^\n]*\s(-[fF]\S*|--raw-field|--field|--input)(\s|=|$)/,
    reason: 'Writes to GitHub (visible to others).',
  },
  {
    id: 'railway-deploy',
    tier: 'confirm',
    test: /\brailway\s+(up|redeploy)\b/,
    reason: 'Deploys to Railway.',
  },
];

export const WRITE_PATH_RULES: Rule[] = [
  { id: 'env-secret', tier: 'hard', test: ENV_FILE, reason: 'Secret env file.' },
  {
    id: 'vcs-internal',
    tier: 'hard',
    test: /(^|\/)(\.git|node_modules)\//,
    reason: 'VCS or dependency internals.',
  },
  {
    id: 'harness',
    tier: 'confirm',
    test: /(^|\/)(\.pi|\.husky)\/|(^|\/)\.claude\/(settings(\.local)?\.json$|hooks\/)|(^|\/)scripts\/(control-plane|hooks)\//,
    reason: 'Agent control plane; an agent should not silently change its own guards.',
  },
  {
    id: 'env-example',
    tier: 'confirm',
    test: /(^|\/)\.env[^/]*\.example$/,
    reason: 'Env template (Claude deny list covers .env*).',
  },
  {
    id: 'package-manifest',
    tier: 'confirm',
    test: /(^|\/)package(-lock)?\.json$/,
    reason: 'Package manifest (Claude deny list); prefer npm commands.',
  },
  {
    id: 'phoenix-protected',
    tier: 'confirm',
    test: /(^|\/)\.claude\/(PHOENIX-AGENTS-REGISTRY|PHOENIX-TOOL-ROUTING|DISCOVERY-MAP)\.md$/,
    reason: 'Phoenix protected path; needs specialist sign-off.',
  },
  {
    id: 'governance',
    tier: 'confirm',
    test: /(^|\/)(AGENTS|CLAUDE|AGENT-SAFETY)\.md$|(^|\/)docs\/governance\//,
    reason: 'Governance or loader document.',
  },
  {
    id: 'codeowners',
    tier: 'confirm',
    test: /(^|\/)(\.github\/workflows|docs\/adr|core\/reserves|client\/src\/core|tools\/eslint-plugin-povc-security)\//,
    reason: 'CODEOWNERS-protected path.',
  },
  {
    id: 'security-policy',
    tier: 'confirm',
    test: /(^|\/)(\.gitleaks\.toml|\.gitleaksignore|\.trivyignore|semgrep\.yml)$/,
    reason: 'Scanner allowlist is a security-policy change (AGENT-SAFETY.md).',
  },
  {
    id: 'migrations',
    tier: 'confirm',
    test: /(^|\/)migrations\//,
    reason: 'Durable schema change; needs retry/concurrency/real-DB proof.',
  },
];

export const READ_PATH_RULES: Rule[] = [
  {
    id: 'secret-read',
    tier: 'confirm',
    test: ENV_FILE,
    reason: 'Reads a secret env file into the session transcript.',
  },
];

export type ToolClass =
  'shell' | 'write' | 'read' | 'listing' | 'orchestrator' | 'declared-read-only' | 'unverified';

/**
 * How the guard treats a tool. Built-ins are known. `codemode` and
 * `tool_search` only orchestrate: each nested call reaches tool_call itself.
 * Any other tool (MCP, extension) passes only when it declares readOnlyHint;
 * otherwise it needs confirmation (fail closed without UI).
 */
export function classifyTool(name: string, annotations?: { readOnlyHint?: boolean }): ToolClass {
  if (name === 'bash' || name === 'powershell') return 'shell';
  if (name === 'write' || name === 'edit') return 'write';
  if (name === 'read' || name === 'grep') return 'read';
  if (name === 'find' || name === 'ls') return 'listing';
  if (name === 'codemode' || name === 'tool_search') return 'orchestrator';
  return annotations?.readOnlyHint === true ? 'declared-read-only' : 'unverified';
}

/**
 * Commands that count as a Phoenix truth run for the financial reminder: the
 * truth command alone on one line (optional env assignments), with no `;`,
 * `|`, `&`, newline, or subshell that could mask its exit status.
 */
export const TRUTH_RUN =
  /^[ \t]*(?:[A-Z_][A-Z0-9_]*=[^\s;&|`$()<>]*[ \t]+)*(?:npm[ \t]+run[ \t]+phoenix:truth|npx[ \t]+vitest[ \t]+run[ \t]+[^;&|`$()\n\r]*tests\/unit\/truth-cases)[^;&|`$()\n\r]*$/;

/**
 * Strip shell quotes while keeping word boundaries: whitespace inside quotes or
 * escaped (bash backslash, PowerShell backtick) becomes `_`, so
 * `"/tmp/repo path"` stays one token and `'main'` matches like a bare word.
 * Over-matching is acceptable.
 */
export function normalizeShell(command: string): string {
  return command
    .replace(/[\\`][ \t]/g, '_')
    .replace(
      /"((?:[^"\\]|\\.)*)"|'([^']*)'/g,
      (_m, dq: string | undefined, sq: string | undefined) => (dq ?? sq ?? '').replace(/\s/g, '_')
    )
    .replace(/["']/g, '');
}

/** All matching rules, hard tier first, in declaration order. */
export function matchRules(rules: Rule[], subject: string): Rule[] {
  const hits = rules.filter((rule) => rule.test.test(subject));
  return [...hits.filter((r) => r.tier === 'hard'), ...hits.filter((r) => r.tier !== 'hard')];
}
