// Run: node --experimental-strip-types --test .pi/extensions/updog-guard/rules.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BASH_RULES,
  READ_PATH_RULES,
  TRUTH_RUN,
  WRITE_PATH_RULES,
  classifyTool,
  matchRules,
  normalizeShell,
} from './rules.ts';

// Bash subjects are normalized exactly as index.ts does before matching.
const ids = (rules: typeof BASH_RULES, subject: string) =>
  matchRules(rules, rules === BASH_RULES ? normalizeShell(subject) : subject).map(
    (r) => `${r.tier}:${r.id}`
  );

test('bash: owner-only production actions are hard blocks', () => {
  assert.deepEqual(ids(BASH_RULES, 'npm run db:push'), ['hard:db-push']);
  assert.deepEqual(ids(BASH_RULES, 'npx drizzle-kit push --force'), ['hard:db-push']);
  assert.deepEqual(ids(BASH_RULES, 'npx tsx scripts/provision-prod-users.ts --apply'), [
    'hard:prod-provision',
  ]);
  assert.deepEqual(ids(BASH_RULES, 'vercel deploy --prod'), ['hard:vercel-prod']);
  assert.equal(ids(BASH_RULES, 'git push origin +main')[0], 'hard:force-push-refspec-main');
  assert.deepEqual(ids(BASH_RULES, 'gh workflow run release-production.yml'), [
    'hard:prod-dispatch',
    'confirm:workflow-run',
    'confirm:github-write',
  ]);
  for (const cmd of [
    'gh api -X POST repos/nikhillinit/Updog_restore/actions/workflows/release-production.yml/dispatches -f ref=main',
    'gh api --method post /repos/nikhillinit/Updog_restore/actions/workflows/current-forecast-production-action.yml/dispatches -f ref=main',
    'gh api repos/nikhillinit/Updog_restore/actions/workflows/release-canary-recovery.yml/dispatches -f ref=main',
    'gh -R nikhillinit/Updog_restore workflow run release-production.yml',
    'gh -Rnikhillinit/Updog_restore workflow run release-production.yml',
    'gh --hostname github.com api -X POST https://api.github.com/repos/nikhillinit/Updog_restore/actions/workflows/release-production.yml/dispatches -f ref=main',
    'gh api -X GET --method POST repos/nikhillinit/Updog_restore/actions/workflows/release-production.yml/dispatches -f ref=main',
    'gh.exe workflow run release-production.yml',
    'gh workflow run 123456 --ref main',
    'gh workflow run --ref main 123456',
    'gh api -X POST repos/nikhillinit/Updog_restore/actions/workflows/123456/dispatches -f ref=main',
  ]) {
    assert.equal(ids(BASH_RULES, cmd)[0], 'hard:prod-dispatch', cmd);
  }
  assert.ok(
    !ids(
      BASH_RULES,
      'gh api -X GET repos/nikhillinit/Updog_restore/actions/workflows/release-production.yml/dispatches -f ref=main'
    ).some((id) => id.startsWith('hard:'))
  );
});

test('bash: every force spelling to main/master is a hard block', () => {
  for (const cmd of [
    'git push -f origin main',
    'git push --force origin main',
    'git push --force-with-lease origin master',
    'git push --force-with-lease=main:abc123 origin main',
    'git push -uf origin HEAD:main',
    'git push origin HEAD:refs/heads/main --force',
    'git push origin +HEAD:main',
    'git push origin +:main',
    'git push origin :main',
    'git push --delete origin main',
    'git -C . push --force origin main',
    'git -c core.askPass=x --no-pager push -f origin master',
    'git --git-dir=.git push --force origin main',
    "git push origin '+HEAD:main'",
    "git push origin ':main'",
    "git push --delete origin 'main'",
    'git push --force origin "main"',
    'git push --force origin main;echo done',
    'git push --force origin main&&echo done',
    'git push origin :main>/dev/null',
    'git push --force origin main>/dev/null',
    'git push --mirror origin',
    'git push --force --all origin',
    'git push --force',
    'git push -f origin',
    'git push --force origin HEAD',
    'git -C /other/repo push --force',
    'cd /other/repo && git push --force-with-lease',
    'git push origin +HEAD',
    'git push --force origin 2>/dev/null',
    'git push --force origin 2>&1',
    'git push --force origin > /dev/null',
    'git push --force origin &>/dev/null',
    'git push --repo origin --force',
    'git push --force "/tmp/remote repo.git"',
    'git push --force origin 2>"push error.log"',
    'git -C "/tmp/repo path" push --force origin main',
    "git -C '/tmp/repo path' push --force origin main",
    'git -C /tmp/repo\\ path push --force origin main',
    'git -C C:\\Program` Files\\repo push --force origin main',
    'git -C C:\\Program` Files\\repo push --force',
  ]) {
    assert.ok(ids(BASH_RULES, cmd)[0]?.startsWith('hard:'), cmd);
  }
  for (const cmd of [
    'git push origin main',
    'git push --force origin feat/main-fix',
    'git push -u origin feat/x',
  ]) {
    assert.ok(!ids(BASH_RULES, cmd).some((id) => id.startsWith('hard:')), cmd);
  }
  for (const cmd of [
    'git push --force origin feat/x',
    'git -C . push -f origin feat/x',
    'git push origin +feat/x',
    'git push --force-with-lease origin HEAD:feat/x',
    'git push -o ci.skip --force origin feat/x',
    'git push --repo origin --force HEAD:feat/x',
    'git push --repo=origin --force feat/x',
    'git push --force origin feat/x 2>&1',
    'git push --force origin feat/x > /dev/null',
    'git push --force "/tmp/remote repo.git" feat/x',
  ]) {
    assert.deepEqual(ids(BASH_RULES, cmd), ['confirm:force-push'], cmd);
  }
  for (const cmd of [
    'npm run push -- --force --all',
    'git push --all origin',
    'git push --follow-tags',
  ]) {
    assert.ok(!ids(BASH_RULES, cmd).some((id) => id.startsWith('hard:')), cmd);
  }
  assert.deepEqual(ids(BASH_RULES, 'git push -u origin feat/x'), []);
});

test('bash: destructive and external actions need confirmation', () => {
  const cases: Array<[string, string]> = [
    ['rm -rf dist', 'rm-recursive'],
    ['rm -fr dist', 'rm-recursive'],
    ['git reset --hard origin/main', 'reset-hard'],
    ['git rebase origin/main', 'rebase-merge'],
    ['git merge origin/main', 'rebase-merge'],
    ['git clean -fd', 'git-clean'],
    ['git clean -d --force', 'git-clean'],
    ['git restore .', 'discard-tree'],
    ['git restore server/a.ts', 'discard-tree'],
    ['git restore --staged --worktree server/a.ts', 'discard-tree'],
    ['git checkout -- server/a.ts', 'checkout'],
    ['git checkout HEAD~1 -- server/a.ts', 'checkout'],
    ['git checkout .', 'checkout'],
    ['git checkout README.md', 'checkout'],
    ['git -C . checkout -f main', 'checkout'],
    ['git -C /tmp/x reset --hard', 'reset-hard'],
    ['git -C . add -A', 'add-all'],
    ['git switch -f main', 'discard-tree'],
    ['git switch --discard-changes main', 'discard-tree'],
    ['git switch -C main origin/main', 'discard-tree'],
    ['git switch --force-create main origin/main', 'discard-tree'],
    ['git checkout -B main origin/main', 'checkout'],
    ['git switch -Cmain origin/main', 'discard-tree'],
    ['git switch --force-create=main origin/main', 'discard-tree'],
    ['git checkout -b scratch --force', 'checkout'],
    ['git checkout -b scratch -f', 'checkout'],
    ['git add -A', 'add-all'],
    ['git commit --no-verify -m x', 'hook-bypass'],
    ['HUSKY=0 git commit -m x', 'hook-bypass'],
    ['git commit -nm x', 'hook-bypass'],
    ['npm install lodash', 'dependency-change'],
    ['npm i -D @types/x', 'dependency-change'],
    ['npm uninstall lodash', 'dependency-change'],
    ['gh pr create --fill', 'github-write'],
    ['gh pr comment 12 -b hi', 'github-write'],
    ['gh api -X POST repos/o/r/issues', 'github-write'],
    ['gh api repos/o/r/issues -f title=x', 'github-write'],
    ['gh api repos/o/r/issues --field=title=x', 'github-write'],
    ['gh api repos/o/r/issues --input body.json', 'github-write'],
    ['gh api --method=POST repos/o/r/issues', 'github-write'],
    ['gh api repos/o/r/issues -ftitle=x', 'github-write'],
    ['gh api repos/o/r/issues -Ftitle=x', 'github-write'],
    ['gh api -X delete repos/o/r/issues/1', 'github-write'],
    ['gh api --method=patch repos/o/r/issues/1 -f title=x', 'github-write'],
    ['gh api --method GET -X DELETE repos/o/r/issues/1', 'github-write'],
    ['gh secret set FOO --body bar', 'github-write'],
    ['gh variable set FOO --body bar', 'github-write'],
    ['gh workflow disable release-production.yml', 'github-write'],
    ['gh repo delete nikhillinit/Updog_restore --yes', 'github-write'],
    ['gh run cancel 123', 'github-write'],
    ['gh unknown command', 'github-write'],
    ['gh.exe pr create --fill', 'github-write'],
    ['cat .env', 'secret-read'],
    ['head -5 server/.env.local', 'secret-read'],
  ];
  for (const [cmd, id] of cases)
    assert.ok(ids(BASH_RULES, cmd).includes(`confirm:${id}`), `${cmd} -> ${id}`);
});

test('bash: routine commands pass', () => {
  for (const cmd of [
    'npm ci',
    'npm install',
    'npm run check',
    'npm run phoenix:truth',
    'TZ=UTC npx vitest run tests/unit/foo.test.ts',
    'git status --porcelain',
    'git merge-base origin/main HEAD',
    'git restore --staged server/a.ts',
    'git checkout -b feat/x origin/main',
    'git switch feat/x',
    'git clean -n',
    'git add server/a.ts tests/a.test.ts',
    "git commit -m 'fix: x'",
    'git push origin feature/x',
    'gh pr view 12',
    'gh pr checks 12 --watch',
    'gh issue list --state open',
    'gh repo view --json nameWithOwner',
    'gh run list --limit 5',
    'gh run watch 123',
    'gh workflow list',
    'gh workflow view ci.yml',
    'gh release view v1.0.0',
    'gh secret list',
    'gh variable get FOO',
    'gh auth status',
    'gh -R nikhillinit/Updog_restore pr view 1615',
    'gh api repos/o/r/pulls',
    'gh api -X get search/issues -f q=repo:o/r',
    'gh api -X GET --method get search/issues -f q=repo:o/r',
    'gh api -X GET search/issues -f q=repo:o/r',
    'gh api --method=GET search/issues -fq=x',
    'git push --all origin',
    'cat .env.example',
    'rm -f tmp.txt',
  ]) {
    assert.deepEqual(ids(BASH_RULES, cmd), [], cmd);
  }
});

test('numeric refs on named CI workflows do not trigger production blocks', () => {
  for (const command of [
    'gh workflow run ci-unified.yml --ref 123',
    'gh workflow run docs-validate.yml --ref 2026',
    'gh workflow run --ref 123 ci-unified.yml',
    'gh workflow run --field count=123 ci-unified.yml',
  ]) {
    assert.ok(!ids(BASH_RULES, command).some((id) => id.startsWith('hard:')), command);
    assert.ok(ids(BASH_RULES, command).includes('confirm:github-write'), command);
  }
});

test('write paths', () => {
  assert.deepEqual(ids(WRITE_PATH_RULES, '.env'), ['hard:env-secret']);
  assert.deepEqual(ids(WRITE_PATH_RULES, 'server/.env.production'), ['hard:env-secret']);
  assert.deepEqual(ids(WRITE_PATH_RULES, '.env.example'), ['confirm:env-example']);
  assert.deepEqual(ids(WRITE_PATH_RULES, '.env.local.example'), ['confirm:env-example']);
  assert.deepEqual(ids(WRITE_PATH_RULES, 'server/.env.staging.example'), ['confirm:env-example']);
  assert.deepEqual(ids(WRITE_PATH_RULES, '.git/config'), ['hard:vcs-internal']);
  assert.deepEqual(ids(WRITE_PATH_RULES, '.pi/extensions/updog-guard/rules.ts'), [
    'confirm:harness',
  ]);
  assert.deepEqual(ids(WRITE_PATH_RULES, '/Users/x/.pi/agent/settings.json'), ['confirm:harness']);
  assert.deepEqual(ids(WRITE_PATH_RULES, '.claude/settings.json'), ['confirm:harness']);
  assert.deepEqual(ids(WRITE_PATH_RULES, 'scripts/control-plane/git-guard-hook.mjs'), [
    'confirm:harness',
  ]);
  assert.deepEqual(ids(WRITE_PATH_RULES, 'package.json'), ['confirm:package-manifest']);
  assert.deepEqual(ids(WRITE_PATH_RULES, 'AGENTS.md'), ['confirm:governance']);
  assert.deepEqual(ids(WRITE_PATH_RULES, 'docs/governance/x.md'), ['confirm:governance']);
  assert.deepEqual(ids(WRITE_PATH_RULES, 'server/migrations/0042_x.sql'), ['confirm:migrations']);
  assert.deepEqual(ids(WRITE_PATH_RULES, 'server/routes/funds.ts'), []);
  assert.deepEqual(ids(WRITE_PATH_RULES, '.claude/skills/x/SKILL.md'), []);
});

test('write paths: protect worktree pointers without blocking similar names', () => {
  for (const target of ['.git', './.git', 'worktree/.git', '/tmp/worktree/.git', 'node_modules']) {
    assert.deepEqual(ids(WRITE_PATH_RULES, target), ['hard:vcs-internal'], target);
  }
  for (const target of ['.gitignore', 'worktree/.gitkeep', 'node_modules-backup/index.js']) {
    assert.deepEqual(ids(WRITE_PATH_RULES, target), [], target);
  }
});

test('truth run recognition requires an unmasked truth command', () => {
  for (const cmd of [
    'npm run phoenix:truth',
    'TZ=UTC npm run phoenix:truth',
    'TZ=UTC npx vitest run tests/unit/truth-cases/runner.test.ts',
    'npx vitest run tests/unit/truth-cases/',
    'npx vitest run tests/unit/truth-cases/xirr.test.ts tests/unit/truth-cases/runner.test.ts',
  ]) {
    assert.ok(TRUTH_RUN.test(cmd), cmd);
  }
  for (const cmd of [
    'echo phoenix:truth',
    'git grep tests/unit/truth-cases',
    'npm run phoenix:truth || true',
    'npm run phoenix:truth | tail -5',
    'npm run phoenix:truth; true',
    'npm run phoenix:truth & wait',
    'npm run phoenix:truth $(true)',
    'npm run phoenix:truth\ntrue',
    'true\nnpm run phoenix:truth',
    'X=x;true npm run phoenix:truth',
    'X=$(true) npm run phoenix:truth',
    'X=x&&true npm run phoenix:truth',
    'npm run phoenix:truth -- --help',
    'npx vitest run fake/tests/unit/truth-cases --passWithNoTests',
    'npx vitest run tests/unit/truth-cases/fake.test.ts --passWithNoTests',
    'npx vitest run tests/unit/truth-cases/runner.test.ts --help',
    'npx vitest run tests/unit/truth-cases/runner.test.ts -t "xirr"',
    'npx vitest run tests/unit/truth-cases/../foo.test.ts',
  ]) {
    assert.ok(!TRUTH_RUN.test(cmd), cmd);
  }
});

test('tool classification fails closed for unknown tools', () => {
  assert.equal(classifyTool('bash'), 'shell');
  assert.equal(classifyTool('powershell'), 'shell');
  assert.equal(classifyTool('edit'), 'write');
  assert.equal(classifyTool('grep'), 'read');
  assert.equal(classifyTool('ls'), 'listing');
  assert.equal(classifyTool('codemode'), 'orchestrator');
  assert.equal(classifyTool('mcp__linear__create_issue'), 'unverified');
  assert.equal(classifyTool('mcp__linear__create_issue', { readOnlyHint: false }), 'unverified');
  assert.equal(
    classifyTool('mcp__linear__list_issues', { readOnlyHint: true }),
    'declared-read-only'
  );
});

test('read paths', () => {
  assert.deepEqual(ids(READ_PATH_RULES, '.env.local'), ['confirm:secret-read']);
  assert.deepEqual(ids(READ_PATH_RULES, '.env.example'), []);
  assert.deepEqual(ids(READ_PATH_RULES, '.env.local.example'), []);
  assert.deepEqual(ids(BASH_RULES, 'cat .env.local.example'), []);
  assert.deepEqual(ids(READ_PATH_RULES, 'server/env.ts'), []);
});
