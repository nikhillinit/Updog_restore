/**
 * Updog_restore Pi guard.
 *
 * Mirrors the repo's Claude Code control plane (.claude/settings.json hooks and
 * deny list) for Pi, reusing repo scripts as the single source of truth:
 *   - scripts/control-plane/git-guard-hook.mjs   (force-push policy)
 *   - scripts/ci/classify-change-paths.mjs       (financial path classifier)
 * Rule tables live in ./rules.ts and are covered by ./rules.test.ts.
 *
 * CLAUDE_HOOKS_DISABLE=1 skips the confirm tier, matching the repo kill switch.
 * Hard blocks always apply.
 *
 * Cache discipline (Pi "Prompt Caching In Agents"): nothing here edits the
 * system prompt or the active tool set. Repo state is appended once per session
 * as a transcript message; reminders are appended, never injected upstream.
 *
 * Codemode scripts reach tools through ctx.executeTool(), which runs the same
 * tool_call handlers, so nested calls are guarded too. Tools the guard does not
 * know (MCP, other extensions) need confirmation unless they declare
 * readOnlyHint.
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import {
  BASH_RULES,
  GIT_PUSH,
  READ_PATH_RULES,
  type Rule,
  TRUTH_RUN,
  WRITE_PATH_RULES,
  classifyTool,
  matchRules,
  normalizeShell,
} from './rules.ts';

export default function updogGuard(pi: ExtensionAPI) {
  let repoRoot = '';
  let isFinancialPath: ((p: string) => boolean) | undefined;
  let sentRepoState = false;
  const allowedForSession = new Set<string>();
  // Session-scoped, not per run: retries and continuations start new runs, and
  // pending financial edits must survive them until a truth run clears them.
  const financialEdits = new Set<string>();
  let reminded = false;
  let touched = 0;

  const killSwitch = () => process.env.CLAUDE_HOOKS_DISABLE === '1';

  const toRepoPath = (p: string, cwd: string) => {
    const abs = path.resolve(cwd, p.replace(/^@/, ''));
    const rel = path
      .relative(repoRoot || cwd, abs)
      .split(path.sep)
      .join('/');
    return rel.startsWith('..') ? abs : rel;
  };

  async function git(args: string[]) {
    const r = await pi.exec('git', args, { cwd: repoRoot || undefined, timeout: 5000 });
    return r.code === 0 ? r.stdout.trim() : '';
  }

  async function decide(rule: Rule, subject: string, ctx: ExtensionContext) {
    const reason = `[updog-guard:${rule.id}] ${rule.reason}`;
    if (rule.tier === 'hard') {
      if (ctx.hasUI) ctx.ui.notify(`Blocked: ${rule.reason}`, 'warning');
      return { block: true, reason: `${reason} Blocked by policy; do not retry. Ask the user.` };
    }
    if (killSwitch() || allowedForSession.has(rule.id)) return undefined;
    if (!ctx.hasUI)
      return { block: true, reason: `${reason} Needs confirmation; no UI available.` };
    const choice = await ctx.ui.select(`${rule.reason}\n\n  ${subject.slice(0, 400)}\n\nAllow?`, [
      'Allow once',
      `Allow "${rule.id}" for this session`,
      'Block',
    ]);
    if (choice === 'Allow once') return undefined;
    if (choice?.startsWith('Allow "')) {
      allowedForSession.add(rule.id);
      return undefined;
    }
    return { block: true, reason: `${reason} Declined by user.` };
  }

  async function decideAll(rules: Rule[], subject: string, ctx: ExtensionContext) {
    for (const rule of matchRules(rules, subject)) {
      const result = await decide(rule, subject, ctx);
      if (result) return result;
    }
    return undefined;
  }

  function runGitGuardScript(command: string): { blocked: boolean; protectedBranch: boolean } {
    const script = path.join(repoRoot, 'scripts/control-plane/git-guard-hook.mjs');
    if (!GIT_PUSH.test(command) || !repoRoot || !existsSync(script)) {
      return { blocked: false, protectedBranch: false };
    }
    // The child must not inherit kill-switch or acknowledgment variables.
    const { CLAUDE_HOOKS_DISABLE: _off, CLAUDE_ACK_GIT_RISK: _ack, ...env } = process.env;
    const r = spawnSync(process.execPath, [script], {
      cwd: repoRoot,
      env: { ...env, TOOL_INPUT: command },
      encoding: 'utf8',
      timeout: 5000,
    });
    return { blocked: r.status === 2, protectedBranch: /protected branch/i.test(r.stderr || '') };
  }

  pi.on('session_start', async (_event, ctx) => {
    const top = await pi.exec('git', ['rev-parse', '--show-toplevel'], {
      cwd: ctx.cwd,
      timeout: 5000,
    });
    repoRoot = top.code === 0 ? top.stdout.trim() : ctx.cwd;
    sentRepoState = false;
    try {
      const mod = await import(
        pathToFileURL(path.join(repoRoot, 'scripts/ci/classify-change-paths.mjs')).href
      );
      isFinancialPath = typeof mod.isFinancialPath === 'function' ? mod.isFinancialPath : undefined;
    } catch {
      isFinancialPath = undefined;
    }
    if (ctx.hasUI && killSwitch())
      ctx.ui.notify(
        'CLAUDE_HOOKS_DISABLE=1: confirm-tier guards off; hard blocks remain.',
        'warning'
      );
  });

  pi.on('session_shutdown', async () => {
    allowedForSession.clear();
    financialEdits.clear();
    reminded = false;
    touched = 0;
  });

  // One-time repo state, appended to the transcript so the system prompt stays cache-stable.
  pi.on('before_agent_start', async () => {
    if (sentRepoState || !repoRoot) return undefined;
    sentRepoState = true;
    const [branch, head, main, counts, status] = await Promise.all([
      git(['branch', '--show-current']),
      git(['rev-parse', '--short', 'HEAD']),
      git(['rev-parse', '--short', 'origin/main']),
      git(['rev-list', '--left-right', '--count', 'origin/main...HEAD']),
      git(['status', '--porcelain']),
    ]);
    const dirty = status ? status.split('\n').map((l) => l.slice(3).replace(/^.* -> /, '')) : [];
    const financial = isFinancialPath ? dirty.filter((p) => isFinancialPath!(p)).length : 0;
    const [behind, ahead] = counts.split(/\s+/);
    const lines = [
      `Repo state at session start (local refs; run git fetch before branch decisions):`,
      `- branch ${branch || '(detached)'} @ ${head}; origin/main ${main || 'unknown'}; ahead ${ahead ?? '?'}, behind ${behind ?? '?'}`,
      `- ${dirty.length} uncommitted path(s)${isFinancialPath ? `, ${financial} financial` : ''}`,
    ];
    return {
      message: { customType: 'updog-repo-state', content: lines.join('\n'), display: true },
    };
  });

  pi.on('tool_call', async (event, ctx) => {
    const input = event.input as Record<string, unknown>;
    const annotations = pi.getAllTools().find((t) => t.name === event.toolName)?.annotations;
    const kind = classifyTool(event.toolName, annotations);
    if (kind === 'shell') {
      const command = normalizeShell(String(input.command ?? ''));
      const result = await decideAll(BASH_RULES, command, ctx);
      if (result) return result;
      // Already decided by the local force-push rule; do not prompt twice.
      if (matchRules(BASH_RULES, command).some((r) => r.id === 'force-push')) return undefined;
      const guard = runGitGuardScript(command);
      if (!guard.blocked) return undefined;
      const rule: Rule = guard.protectedBranch
        ? {
            id: 'force-push-main',
            tier: 'hard',
            test: /./,
            reason: 'Force push to main/master is not allowed.',
          }
        : { id: 'force-push', tier: 'confirm', test: /./, reason: 'Force push (git-guard-hook).' };
      return decide(rule, command, ctx);
    }
    const raw = String(input.path ?? '');
    if (kind === 'write')
      return raw ? decideAll(WRITE_PATH_RULES, toRepoPath(raw, ctx.cwd), ctx) : undefined;
    if (kind === 'read')
      return raw ? decideAll(READ_PATH_RULES, toRepoPath(raw, ctx.cwd), ctx) : undefined;
    if (kind === 'unverified') {
      const rule: Rule = {
        id: `tool:${event.toolName}`,
        tier: 'confirm',
        test: /./,
        reason: `Tool "${event.toolName}" is not known to the guard and does not declare readOnlyHint.`,
      };
      return decide(rule, JSON.stringify(input), ctx);
    }
    return undefined;
  });

  pi.on('tool_result', async (event, ctx) => {
    if (event.isError) return undefined;
    if (event.toolName === 'write' || event.toolName === 'edit') {
      touched++;
      const rel = toRepoPath(String(event.input.path ?? ''), ctx.cwd);
      if (isFinancialPath?.(rel)) {
        financialEdits.add(rel);
        reminded = false;
      }
    } else if (
      classifyTool(event.toolName) === 'shell' &&
      TRUTH_RUN.test(String(event.input.command ?? ''))
    ) {
      financialEdits.clear();
    }
    return undefined;
  });

  // One reminder per pending set, no continuation (avoids loops): the model sees
  // it on the next user turn. New financial edits re-arm it; a truth run clears it.
  pi.on('agent_before_settle', async (event) => {
    if (reminded || financialEdits.size === 0 || event.outcome !== 'completed') return undefined;
    reminded = true;
    const files = [...financialEdits].slice(0, 8).join(', ');
    return {
      entries: [
        {
          type: 'custom_message' as const,
          customType: 'updog-financial-reminder',
          display: true,
          content: `Financial paths changed without a later phoenix:truth run: ${files}. Run \`npm run phoenix:truth\` before claiming the change is done.`,
        },
      ],
    };
  });

  pi.on('agent_settled', async (_event, ctx) => {
    if (!ctx.hasUI || !repoRoot || touched === 0) return;
    const stat = await git(['diff', '--shortstat', 'HEAD']);
    ctx.ui.setStatus(
      'updog',
      stat ? `diff: ${stat.replace(/ changed|\(|\)/g, '')} | /verify` : undefined
    );
  });
}
