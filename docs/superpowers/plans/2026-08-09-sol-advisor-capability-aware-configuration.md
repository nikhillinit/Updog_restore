---
status: ACTIVE
audience: agents
last_updated: 2026-08-09
owner: Developer Experience
review_cadence: P90D
categories: [ai-automation, orchestration, implementation-plan]
keywords: [sol-advisor, codex, ultra, fast-mode, configuration, migration]
---

# Sol Advisor Capability-Aware Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Sol Advisor's capability-aware v2 configuration foundation so
canonical `ultra` reasoning and Codex fast mode are valid where the live host
supports them, while legacy mixed-case effort values require an explicit
previewed migration.

**Architecture:** Implement this phase in the Sol Advisor source repository at
`/Users/nikhil/.codex/.tmp/marketplaces/sol-advisor`. Split pure contracts,
Codex capability discovery, and migration planning out of the current MCP
server; keep filesystem transactions and MCP dispatch in `server.ts`. Store a
capability snapshot with each v2 profile, validate model/effort pairs against
the live Codex catalog, treat fast mode as a run-scoped service choice, and fail
closed when evidence is unavailable or stale.

**Tech Stack:** TypeScript, Bun, Bun test, newline-delimited JSON-RPC MCP, JSON
configuration, Codex CLI capability commands.

## Global Constraints

- Source repository: `/Users/nikhil/.codex/.tmp/marketplaces/sol-advisor`.
- Design authority:
  `docs/superpowers/specs/2026-08-09-sol-advisor-orchestration-control-plane-design.md`
  in `/Users/nikhil/code/Updog_restore`.
- No new runtime dependency; Bun remains the only plugin runtime prerequisite.
- Preserve all existing client adapters and transactional install, uninstall,
  backup, and recovery behavior.
- Accept only exact lowercase effort tokens; never silently normalize `Max`,
  `xHigh`, or other mixed-case values.
- Accept `ultra` only when the selected model's live Codex catalog entry reports
  it.
- Current capability evidence must reject `gpt-5.6-luna` plus `ultra` unless
  Luna later reports support.
- Permit Codex fast mode independently from model and effort; it cannot alter
  A-tier, E-class, reviewer obligations, or acceptance evidence.
- Record fast mode at run scope until the host proves a native per-agent
  binding.
- Existing v1 profiles migrate only through an exact preview and one-time
  confirmation token.
- Fail closed when the Codex executable, model catalog, or fast-mode capability
  cannot be observed.
- Do not invent timeouts, retry counts, or freshness windows; use an existing
  host or project authority before adding any numeric limit.
- Keep user-owned `.codex-marketplace-install.json` untracked and unchanged.
- Use normal prose and no emoji in code, documentation, test names, or output.

## File Structure

Implementation repository paths below are relative to
`/Users/nikhil/.codex/.tmp/marketplaces/sol-advisor`.

- Create `plugins/sol-advisor/mcp/contracts.ts`: v2 preference, model-binding,
  service-mode, and capability-evidence types plus pure canonical-token
  validation.
- Create `plugins/sol-advisor/mcp/contracts.test.ts`: pure contract and
  model/effort compatibility tests.
- Create `plugins/sol-advisor/mcp/codex-capabilities.ts`: fixed-command Codex
  capability probe, parser, canonical snapshot, and digest.
- Create `plugins/sol-advisor/mcp/codex-capabilities.test.ts`: probe/parser
  tests using injected command results.
- Create `plugins/sol-advisor/mcp/migration.ts`: pure v1-to-v2 preview
  construction and confirmation-bound migration plan.
- Create `plugins/sol-advisor/mcp/migration.test.ts`: mixed-case,
  unsupported-combination, and no-op migration tests.
- Modify `plugins/sol-advisor/mcp/server.ts`: v2 persistence, tool schemas,
  capability injection, migration tools, live validation, and adapter rendering.
- Modify `plugins/sol-advisor/mcp/server.test.ts`: MCP integration, persistence,
  migration, rendering, and stale-capability coverage.
- Modify `plugins/sol-advisor/skills/setup/SKILL.md`: capability discovery,
  `ultra`, fast-mode, and migration interview behavior.
- Modify `plugins/sol-advisor/skills/orchestration/SKILL.md`: run-level
  service-mode observation and fail-closed dispatch language.
- Modify `README.md`: v2 profile, capability, migration, `ultra`, and fast-mode
  behavior.
- Modify `CHANGELOG.md`: user-visible configuration changes.
- Modify `package.json`, `plugins/sol-advisor/plugin.json`,
  `plugins/sol-advisor/.codex-plugin/plugin.json`, and
  `plugins/sol-advisor/mcp/server.ts`: one consistent minor version after
  behavior passes tests.
- Modify `plugins/sol-advisor/scripts/verify.sh`: exact version, documentation,
  and generated-adapter assertions.

---

### Task 1: Define canonical configuration and capability contracts

**Files:**

- Create: `plugins/sol-advisor/mcp/contracts.ts`
- Create: `plugins/sol-advisor/mcp/contracts.test.ts`
- Modify: `plugins/sol-advisor/mcp/server.ts:1-103`

**Interfaces:**

- Consumes: existing `Client`, `RoleName`, `RolePreference`, and `Preferences`
  concepts from `server.ts`.
- Produces: `PreferencesV2`, `CapabilitySnapshot`, `ModelCapability`,
  `ServiceMode`, `assertCanonicalToken()`, `validateCodexBinding()`, and
  `validateServiceMode()`.

- [ ] **Step 1: Write failing pure contract tests**

```ts
import { describe, expect, test } from 'bun:test';
import {
  assertCanonicalToken,
  validateCodexBinding,
  validateServiceMode,
  type CapabilitySnapshot,
} from './contracts';

const snapshot: CapabilitySnapshot = {
  client: 'codex',
  source: 'codex-cli',
  observedAt: '2026-08-09T00:00:00.000Z',
  digest: 'fixture-digest',
  models: {
    'gpt-5.6-sol': { efforts: ['low', 'high', 'xhigh', 'max', 'ultra'] },
    'gpt-5.6-terra': { efforts: ['low', 'high', 'xhigh', 'max', 'ultra'] },
    'gpt-5.6-luna': { efforts: ['low', 'high', 'xhigh', 'max'] },
  },
  serviceModes: {
    default: { scope: 'run' },
    fast: { scope: 'run' },
  },
};

describe('canonical capability contracts', () => {
  test('rejects mixed-case effort tokens', () => {
    expect(() => assertCanonicalToken('Max', 'effort')).toThrow(
      'canonical lowercase'
    );
    expect(() => assertCanonicalToken('xHigh', 'effort')).toThrow(
      'canonical lowercase'
    );
  });

  test('accepts ultra only for models that report it', () => {
    expect(validateCodexBinding(snapshot, 'gpt-5.6-sol', 'ultra')).toEqual([]);
    expect(validateCodexBinding(snapshot, 'gpt-5.6-terra', 'ultra')).toEqual(
      []
    );
    expect(validateCodexBinding(snapshot, 'gpt-5.6-luna', 'ultra')).toContain(
      'gpt-5.6-luna does not report effort ultra'
    );
  });

  test('keeps fast mode independent and run-scoped', () => {
    expect(validateServiceMode(snapshot, 'fast', 'run')).toEqual([]);
    expect(validateServiceMode(snapshot, 'fast', 'role')).toContain(
      'fast is supported at run scope, not role scope'
    );
  });
});
```

- [ ] **Step 2: Run tests and verify module is missing**

Run:

```bash
cd /Users/nikhil/.codex/.tmp/marketplaces/sol-advisor
bun test plugins/sol-advisor/mcp/contracts.test.ts
```

Expected: FAIL because `./contracts` does not exist.

- [ ] **Step 3: Implement focused contracts module**

```ts
export type Client = 'codex' | 'cursor' | 'vscode' | 'github-copilot' | 'kiro';
export type RoleName = 'routine' | 'high' | 'advisor';
export type ServiceMode = 'inherit' | 'default' | 'fast';
export type ServiceModeScope = 'run' | 'role';

export type ModelCapability = { efforts: string[] };
export type CapabilitySnapshot = {
  client: Client;
  source: 'codex-cli' | 'client-declared';
  observedAt: string;
  digest: string;
  models: Record<string, ModelCapability>;
  serviceModes: Partial<
    Record<Exclude<ServiceMode, 'inherit'>, { scope: ServiceModeScope }>
  >;
};

export type RolePreference = {
  model: string;
  effort?: string;
  readonly?: boolean;
};

export type PreferencesV2 = {
  schemaVersion: 2;
  client: Client;
  scope: 'project' | 'user';
  orchestrator: {
    model: 'inherit';
    recommendation?: { model: string; effort?: string };
  };
  roles: Record<RoleName, RolePreference>;
  runDefaults: { serviceMode: ServiceMode };
  capabilityEvidence: CapabilitySnapshot;
  fallbackPolicy: 'fail-closed';
  fallbacks: [];
  appTaskLane?: { enabled: true; model: 'gpt-5.6-luna'; effort: 'max' };
  profileKey: string;
  workspace: string;
  createdAt: string;
  updatedAt: string;
  pluginVersion: string;
};

export function assertCanonicalToken(
  value: unknown,
  label: string
): asserts value is string {
  if (typeof value !== 'string' || value.length === 0)
    throw new Error(`${label} must be an exact non-empty string`);
  if (!/^[a-z][a-z0-9_-]*$/.test(value))
    throw new Error(`${label} must use canonical lowercase spelling`);
}

export function validateCodexBinding(
  snapshot: CapabilitySnapshot,
  model: string,
  effort?: string
): string[] {
  const errors: string[] = [];
  const capability = snapshot.models[model];
  if (!capability) return [`Codex model catalog does not report ${model}`];
  if (effort !== undefined) {
    try {
      assertCanonicalToken(effort, 'effort');
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      return errors;
    }
    if (!capability.efforts.includes(effort))
      errors.push(`${model} does not report effort ${effort}`);
  }
  return errors;
}

export function validateServiceMode(
  snapshot: CapabilitySnapshot,
  mode: ServiceMode,
  requestedScope: ServiceModeScope
): string[] {
  if (mode === 'inherit') return [];
  const capability = snapshot.serviceModes[mode];
  if (!capability) return [`Codex host does not report service mode ${mode}`];
  return capability.scope === requestedScope
    ? []
    : [
        `${mode} is supported at ${capability.scope} scope, not ${requestedScope} scope`,
      ];
}
```

- [ ] **Step 4: Move duplicate type declarations out of `server.ts`**

Replace local declarations with imports and retain any server-only types:

```ts
import {
  assertCanonicalToken,
  validateCodexBinding,
  validateServiceMode,
  type CapabilitySnapshot,
  type Client,
  type PreferencesV2,
  type RoleName,
  type RolePreference,
  type ServiceMode,
} from './contracts';
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
bun test plugins/sol-advisor/mcp/contracts.test.ts plugins/sol-advisor/mcp/server.test.ts
```

Expected: PASS, with existing server behavior unchanged.

- [ ] **Step 6: Commit contract extraction**

```bash
git add plugins/sol-advisor/mcp/contracts.ts plugins/sol-advisor/mcp/contracts.test.ts plugins/sol-advisor/mcp/server.ts
git commit -m "refactor: extract Sol Advisor configuration contracts"
```

---

### Task 2: Discover Codex models, efforts, and fast-mode capability

**Files:**

- Create: `plugins/sol-advisor/mcp/codex-capabilities.ts`
- Create: `plugins/sol-advisor/mcp/codex-capabilities.test.ts`

**Interfaces:**

- Consumes: `CapabilitySnapshot` from Task 1.
- Produces: `CommandRunner`, `CommandResult`, `parseCodexModels()`,
  `parseCodexFeatures()`, and `probeCodexCapabilities()`.

- [ ] **Step 1: Write failing parser and probe tests**

```ts
import { describe, expect, test } from 'bun:test';
import {
  probeCodexCapabilities,
  type CommandRunner,
} from './codex-capabilities';

const models = JSON.stringify({
  models: [
    {
      slug: 'gpt-5.6-sol',
      supported_reasoning_levels: [{ effort: 'high' }, { effort: 'ultra' }],
    },
    {
      slug: 'gpt-5.6-luna',
      supported_reasoning_levels: [{ effort: 'high' }, { effort: 'max' }],
    },
  ],
});

test('builds deterministic Codex capability evidence', async () => {
  const runner: CommandRunner = async (args) => {
    if (args.join(' ') === 'debug models')
      return { exitCode: 0, stdout: models, stderr: '' };
    if (args.join(' ') === 'features list') {
      return { exitCode: 0, stdout: 'fast_mode stable true\n', stderr: '' };
    }
    throw new Error(`unexpected command: ${args.join(' ')}`);
  };

  const snapshot = await probeCodexCapabilities(
    runner,
    () => '2026-08-09T00:00:00.000Z'
  );
  expect(snapshot.models['gpt-5.6-sol']?.efforts).toEqual(['high', 'ultra']);
  expect(snapshot.models['gpt-5.6-luna']?.efforts).toEqual(['high', 'max']);
  expect(snapshot.serviceModes.fast).toEqual({ scope: 'run' });
  expect(snapshot.digest).toMatch(/^[a-f0-9]{64}$/);
});

test('fails closed when either fixed Codex command fails', async () => {
  const runner: CommandRunner = async () => ({
    exitCode: 1,
    stdout: '',
    stderr: 'unavailable',
  });
  await expect(probeCodexCapabilities(runner)).rejects.toThrow(
    'Codex capability probe failed'
  );
});
```

- [ ] **Step 2: Run test and verify module is missing**

Run:

```bash
bun test plugins/sol-advisor/mcp/codex-capabilities.test.ts
```

Expected: FAIL because `./codex-capabilities` does not exist.

- [ ] **Step 3: Implement a fixed-command, injected capability probe**

```ts
import { createHash } from 'node:crypto';
import type { CapabilitySnapshot } from './contracts';

export type CommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};
export type CommandRunner = (args: readonly string[]) => Promise<CommandResult>;

const defaultRunner: CommandRunner = async (args) => {
  const process = Bun.spawn(['codex', ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);
  return { exitCode, stdout, stderr };
};

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([a], [b]) => a.localeCompare(b)
    );
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export async function probeCodexCapabilities(
  run: CommandRunner = defaultRunner,
  now: () => string = () => new Date().toISOString()
): Promise<CapabilitySnapshot> {
  const [modelResult, featureResult] = await Promise.all([
    run(['debug', 'models']),
    run(['features', 'list']),
  ]);
  if (modelResult.exitCode !== 0 || featureResult.exitCode !== 0) {
    throw new Error(
      'Codex capability probe failed; model and fast-mode evidence are required'
    );
  }
  const raw = JSON.parse(modelResult.stdout) as {
    models?: Array<{
      slug?: unknown;
      supported_reasoning_levels?: Array<{ effort?: unknown }>;
    }>;
  };
  const models = Object.fromEntries(
    (raw.models ?? []).flatMap((model) => {
      if (typeof model.slug !== 'string') return [];
      const efforts = (model.supported_reasoning_levels ?? [])
        .map((level) => level.effort)
        .filter((effort): effort is string => typeof effort === 'string')
        .sort();
      return [[model.slug, { efforts }]];
    })
  );
  const fastEnabled = /^fast_mode\s+\S+\s+true$/m.test(featureResult.stdout);
  const material = {
    client: 'codex' as const,
    source: 'codex-cli' as const,
    models,
    serviceModes: {
      default: { scope: 'run' as const },
      ...(fastEnabled ? { fast: { scope: 'run' as const } } : {}),
    },
  };
  return {
    ...material,
    observedAt: now(),
    digest: createHash('sha256').update(canonicalJson(material)).digest('hex'),
  };
}
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
bun test plugins/sol-advisor/mcp/codex-capabilities.test.ts plugins/sol-advisor/mcp/contracts.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit capability discovery**

```bash
git add plugins/sol-advisor/mcp/codex-capabilities.ts plugins/sol-advisor/mcp/codex-capabilities.test.ts
git commit -m "feat: discover Codex model and fast-mode capabilities"
```

---

### Task 3: Persist and validate v2 profiles

**Files:**

- Modify: `plugins/sol-advisor/mcp/server.ts:60-103,220-270`
- Modify: `plugins/sol-advisor/mcp/server.test.ts:1-75`

**Interfaces:**

- Consumes: `PreferencesV2`, validation helpers, and `probeCodexCapabilities()`.
- Produces: async `savePreferencesV2()`, v2 `save_preferences` MCP schema, and
  `__setCapabilityProbeForTests()`.

- [ ] **Step 1: Add failing v2 persistence tests**

```ts
import type { CapabilitySnapshot } from './contracts';
import { __setCapabilityProbeForTests } from './server';

const codexSnapshot: CapabilitySnapshot = {
  client: 'codex',
  source: 'codex-cli',
  observedAt: '2026-08-09T00:00:00.000Z',
  digest: 'fixture',
  models: {
    'gpt-5.6-sol': { efforts: ['high', 'ultra'] },
    'gpt-5.6-terra': { efforts: ['high', 'ultra'] },
    'gpt-5.6-luna': { efforts: ['high', 'max'] },
  },
  serviceModes: { default: { scope: 'run' }, fast: { scope: 'run' } },
};

beforeEach(() => {
  __setCapabilityProbeForTests(async () => codexSnapshot);
});

afterEach(() => {
  __setCapabilityProbeForTests(undefined);
});

test('persists Sol ultra and run-scoped fast mode', async () => {
  const input = base('codex') as any;
  input.roles.advisor.effort = 'ultra';
  input.runDefaults = { serviceMode: 'fast' };
  await callTool('save_preferences', input);
  const saved = (await callTool('get_preferences')) as any;
  expect(saved.schemaVersion).toBe(2);
  expect(saved.roles.advisor.effort).toBe('ultra');
  expect(saved.runDefaults).toEqual({ serviceMode: 'fast' });
  expect(saved.capabilityEvidence.digest).toBe('fixture');
});

test('rejects Luna ultra and mixed-case effort before writing', async () => {
  const lunaUltra = base('codex') as any;
  lunaUltra.roles.routine = { model: 'gpt-5.6-luna', effort: 'ultra' };
  await expect(callTool('save_preferences', lunaUltra)).rejects.toThrow(
    'gpt-5.6-luna does not report effort ultra'
  );
  const mixed = base('codex') as any;
  mixed.roles.routine.effort = 'Max';
  await expect(callTool('save_preferences', mixed)).rejects.toThrow(
    'canonical lowercase'
  );
  expect(existsSync(join(data, 'config.json'))).toBe(false);
});
```

- [ ] **Step 2: Run integration test and verify it fails**

Run:

```bash
bun test plugins/sol-advisor/mcp/server.test.ts --filter "persists Sol ultra|rejects Luna ultra"
```

Expected: FAIL because v2 fields and capability injection do not exist.

- [ ] **Step 3: Add capability-probe injection and async validation**

```ts
type CapabilityProbe = () => Promise<CapabilitySnapshot>;
let capabilityProbe: CapabilityProbe = probeCodexCapabilities;

export function __setCapabilityProbeForTests(probe?: CapabilityProbe): void {
  capabilityProbe = probe ?? probeCodexCapabilities;
}

async function validateLivePreferences(
  candidate: PreferencesV2
): Promise<string[]> {
  if (candidate.client !== 'codex') return [];
  const snapshot = await capabilityProbe();
  candidate.capabilityEvidence = snapshot;
  const errors = (Object.keys(candidate.roles) as RoleName[]).flatMap(
    (role) => {
      const preference = candidate.roles[role];
      return validateCodexBinding(
        snapshot,
        preference.model,
        preference.effort
      ).map((message) => `roles.${role}: ${message}`);
    }
  );
  errors.push(
    ...validateServiceMode(snapshot, candidate.runDefaults.serviceMode, 'run')
  );
  if (candidate.appTaskLane) {
    errors.push(
      ...validateCodexBinding(
        snapshot,
        candidate.appTaskLane.model,
        candidate.appTaskLane.effort
      )
    );
  }
  return errors;
}
```

- [ ] **Step 4: Build and save a v2 candidate only after live validation**

Rename current `validatePreferences()` to `validateStoredPreferences()` and keep
its structural, unknown-field, client, scope, readonly, and fail-closed checks.
Define the current package version once, then use this exact shape in
`savePreferences`:

```ts
const PLUGIN_VERSION = '0.5.0';

const candidate: PreferencesV2 = {
  schemaVersion: 2,
  client: args.client,
  scope: args.scope,
  orchestrator: {
    model: 'inherit',
    ...(args.orchestrator?.recommendation
      ? { recommendation: args.orchestrator.recommendation }
      : {}),
  },
  roles: {
    routine: { ...args.roles.routine },
    high: { ...args.roles.high },
    advisor: { ...args.roles.advisor, readonly: true },
  },
  runDefaults: { serviceMode: args.runDefaults?.serviceMode ?? 'inherit' },
  capabilityEvidence: {
    client: args.client,
    source: 'client-declared',
    observedAt: now,
    digest: 'pending-live-validation',
    models: {},
    serviceModes: {},
  },
  fallbackPolicy: 'fail-closed',
  fallbacks: [],
  ...(args.appTaskLane?.enabled === true
    ? { appTaskLane: { enabled: true, model: 'gpt-5.6-luna', effort: 'max' } }
    : {}),
  profileKey,
  workspace,
  createdAt:
    existing.preferences?.profileKey === profileKey
      ? existing.preferences.createdAt
      : now,
  updatedAt: now,
  pluginVersion: PLUGIN_VERSION,
};
const errors = [
  ...validateStoredPreferences(candidate),
  ...(await validateLivePreferences(candidate)),
];
if (errors.length) throw new Error(errors.join('; '));
```

Extend the MCP input schema with:

```ts
runDefaults: {
  type: "object",
  properties: { serviceMode: { type: "string", enum: ["inherit", "default", "fast"] } },
  required: ["serviceMode"],
  additionalProperties: false,
},
```

- [ ] **Step 5: Preserve non-Codex capability semantics explicitly**

For Cursor, VS Code, GitHub Copilot, and Kiro, store a `client-declared`
snapshot with no claim of machine-verified model availability. Keep current
per-client effort restrictions. Do not mark fast mode supported for those
clients in this phase.

```ts
if (candidate.client !== 'codex') {
  candidate.capabilityEvidence = {
    client: candidate.client,
    source: 'client-declared',
    observedAt: now,
    digest: sha(
      JSON.stringify({ client: candidate.client, serviceMode: 'inherit' })
    ),
    models: {},
    serviceModes: {},
  };
  if (candidate.runDefaults.serviceMode !== 'inherit') {
    errors.push(
      `${candidate.client} does not expose a verified Sol Advisor service-mode binding`
    );
  }
}
```

- [ ] **Step 6: Run focused and full MCP tests**

Run:

```bash
bun test plugins/sol-advisor/mcp/contracts.test.ts plugins/sol-advisor/mcp/codex-capabilities.test.ts plugins/sol-advisor/mcp/server.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit v2 persistence**

```bash
git add plugins/sol-advisor/mcp/server.ts plugins/sol-advisor/mcp/server.test.ts
git commit -m "feat: validate Sol Advisor profiles against Codex capabilities"
```

---

### Task 4: Add previewed, confirmation-bound v1 migration

**Files:**

- Create: `plugins/sol-advisor/mcp/migration.ts`
- Create: `plugins/sol-advisor/mcp/migration.test.ts`
- Modify: `plugins/sol-advisor/mcp/server.ts:45-60,220-280`
- Modify: `plugins/sol-advisor/mcp/server.test.ts:35-75`

**Interfaces:**

- Consumes: v1 stored profile, current `CapabilitySnapshot`, existing `sha()`,
  `atomicWrite()`, backup directory, and one-time preview-plan pattern.
- Produces: `MigrationChange`, `MigrationPreview`, `buildMigrationPreview()`,
  `preview_configuration_migration`, and `apply_configuration_migration`.

- [ ] **Step 1: Write failing pure migration tests**

```ts
import { expect, test } from 'bun:test';
import { buildMigrationPreview } from './migration';
import type { CapabilitySnapshot } from './contracts';

const codexSnapshot: CapabilitySnapshot = {
  client: 'codex',
  source: 'codex-cli',
  observedAt: '2026-08-09T00:00:00.000Z',
  digest: 'fixture',
  models: {
    'gpt-5.6-sol': { efforts: ['high', 'xhigh', 'ultra'] },
    'gpt-5.6-terra': { efforts: ['high', 'ultra'] },
    'gpt-5.6-luna': { efforts: ['high', 'max'] },
  },
  serviceModes: { default: { scope: 'run' }, fast: { scope: 'run' } },
};

const legacyBase = () => ({
  schemaVersion: 1,
  client: 'codex',
  scope: 'project',
  workspace: '/fixture',
  orchestrator: { model: 'inherit' },
  roles: {
    routine: { model: 'gpt-5.6-luna', effort: 'Max' },
    high: { model: 'gpt-5.6-terra', effort: 'high' },
    advisor: { model: 'gpt-5.6-sol', effort: 'xHigh', readonly: true },
  },
  fallbackPolicy: 'fail-closed',
  fallbacks: [],
  profileKey: 'codex:project:/fixture',
  createdAt: '2026-08-08T00:00:00.000Z',
  updatedAt: '2026-08-08T00:00:00.000Z',
  pluginVersion: '0.5.0',
});

test('previews provable lowercase corrections without applying them', () => {
  const preview = buildMigrationPreview(legacyBase() as any, codexSnapshot);
  expect(preview.changes).toEqual([
    { path: 'roles.advisor.effort', before: 'xHigh', after: 'xhigh' },
    { path: 'roles.routine.effort', before: 'Max', after: 'max' },
    { path: 'runDefaults.serviceMode', before: undefined, after: 'inherit' },
  ]);
  expect(preview.candidate.schemaVersion).toBe(2);
});

test('refuses a lowercase correction the selected model does not support', () => {
  const input = legacyBase();
  input.roles.routine = { model: 'gpt-5.6-luna', effort: 'Ultra' };
  expect(() => buildMigrationPreview(input, codexSnapshot)).toThrow(
    'gpt-5.6-luna does not report effort ultra'
  );
});
```

- [ ] **Step 2: Run test and verify module is missing**

Run:

```bash
bun test plugins/sol-advisor/mcp/migration.test.ts
```

Expected: FAIL because `./migration` does not exist.

- [ ] **Step 3: Implement pure migration planning**

```ts
import {
  validateCodexBinding,
  type CapabilitySnapshot,
  type PreferencesV2,
} from './contracts';

export type MigrationChange = { path: string; before: unknown; after: unknown };
export type MigrationPreview = {
  candidate: PreferencesV2;
  changes: MigrationChange[];
};
export type LegacyPreferencesV1 = Omit<
  PreferencesV2,
  'schemaVersion' | 'runDefaults' | 'capabilityEvidence'
> & { schemaVersion: 1 };

function migrateEffort(
  path: string,
  model: string,
  effort: string | undefined,
  snapshot: CapabilitySnapshot,
  changes: MigrationChange[]
): string | undefined {
  if (effort === undefined) return undefined;
  const canonical = effort.toLowerCase();
  const errors = validateCodexBinding(snapshot, model, canonical);
  if (errors.length) throw new Error(`${path}: ${errors.join('; ')}`);
  if (canonical !== effort)
    changes.push({ path, before: effort, after: canonical });
  return canonical;
}

export function buildMigrationPreview(
  input: LegacyPreferencesV1,
  snapshot: CapabilitySnapshot,
  now: () => string = () => new Date().toISOString()
): MigrationPreview {
  if (input.client !== 'codex')
    throw new Error('automatic migration requires Codex capability evidence');
  const changes: MigrationChange[] = [];
  const roles = Object.fromEntries(
    (['routine', 'high', 'advisor'] as const).map((role) => {
      const preference = input.roles[role];
      const effort = migrateEffort(
        `roles.${role}.effort`,
        preference.model,
        preference.effort,
        snapshot,
        changes
      );
      return [
        role,
        { ...preference, ...(effort === undefined ? {} : { effort }) },
      ];
    })
  ) as PreferencesV2['roles'];
  changes.push({
    path: 'runDefaults.serviceMode',
    before: undefined,
    after: 'inherit',
  });
  return {
    candidate: {
      ...input,
      schemaVersion: 2,
      roles,
      runDefaults: { serviceMode: 'inherit' },
      capabilityEvidence: snapshot,
      updatedAt: now(),
    },
    changes: changes.sort((left, right) => left.path.localeCompare(right.path)),
  };
}
```

- [ ] **Step 4: Add migration MCP tools with exact preview binding**

Add two tools:

```ts
{
  name: "preview_configuration_migration",
  description: "Preview exact v1-to-v2 preference changes without writing",
  inputSchema: objectSchema(),
},
{
  name: "apply_configuration_migration",
  description: "Apply only the exact unexpired one-time migration preview",
  inputSchema: objectSchema({ confirmationToken: str }, ["confirmationToken"]),
},
```

Reuse the adapter preview pattern: bind the token to the current config hash,
candidate hash, capability digest, profile key, and exact change list. Mark it
used before writing. Reuse the existing adapter preview's ten-minute lifetime;
that limit comes from current plugin behavior rather than a new guessed cap.
Back up the old config, atomically write v2, and leave installed adapter files
untouched so `validate_configuration` can report any managed-file mismatch until
the user previews and confirms adapter installation.

- [ ] **Step 5: Add integration tests proving no silent mutation**

```ts
function writeLegacyConfig({
  routineEffort,
  advisorEffort,
}: {
  routineEffort: string;
  advisorEffort: string;
}): void {
  const profileKey = `codex:project:${workspace}`;
  const profile = {
    ...base('codex', 'project'),
    schemaVersion: 1,
    roles: {
      ...(base('codex', 'project') as any).roles,
      routine: { model: 'gpt-5.6-luna', effort: routineEffort },
      advisor: { model: 'gpt-5.6-sol', effort: advisorEffort, readonly: true },
    },
    profileKey,
    createdAt: '2026-08-08T00:00:00.000Z',
    updatedAt: '2026-08-08T00:00:00.000Z',
    pluginVersion: '0.5.0',
  };
  writeFileSync(
    join(data, 'config.json'),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        activeProfile: profileKey,
        profiles: { [profileKey]: profile },
      },
      null,
      2
    )}\n`
  );
}

test('migration requires exact preview and leaves managed files unchanged', async () => {
  writeLegacyConfig({ routineEffort: 'Max', advisorEffort: 'xHigh' });
  const before = readFileSync(join(data, 'config.json'), 'utf8');
  const preview = (await callTool('preview_configuration_migration')) as any;
  expect(readFileSync(join(data, 'config.json'), 'utf8')).toBe(before);
  await expect(
    callTool('apply_configuration_migration', { confirmationToken: 'wrong' })
  ).rejects.toThrow('exact unexpired one-time migration preview');
  const applied = (await callTool('apply_configuration_migration', {
    confirmationToken: preview.confirmationToken,
  })) as any;
  expect(applied.preferences.roles.routine.effort).toBe('max');
  expect(applied.preferences.roles.advisor.effort).toBe('xhigh');
  expect(existsSync(join(data, 'backups'))).toBe(true);
});
```

- [ ] **Step 6: Run migration and server tests**

Run:

```bash
bun test plugins/sol-advisor/mcp/migration.test.ts plugins/sol-advisor/mcp/server.test.ts
```

Expected: PASS, including tool count updated from 8 to 10.

- [ ] **Step 7: Commit migration flow**

```bash
git add plugins/sol-advisor/mcp/migration.ts plugins/sol-advisor/mcp/migration.test.ts plugins/sol-advisor/mcp/server.ts plugins/sol-advisor/mcp/server.test.ts
git commit -m "feat: add confirmed Sol Advisor configuration migration"
```

---

### Task 5: Render and validate capability-bound adapters

**Files:**

- Modify: `plugins/sol-advisor/mcp/server.ts:120-155,280-310`
- Modify: `plugins/sol-advisor/mcp/server.test.ts:75-130`

**Interfaces:**

- Consumes: persisted v2 profile and live capability probe.
- Produces: `validateLiveConfiguration()`, stale-capability status,
  capability-bound preview digest, and run-scoped fast-mode warning.

- [ ] **Step 1: Add failing rendering and stale-evidence tests**

```ts
test('renders canonical ultra but never a per-agent fast field', async () => {
  const input = base('codex') as any;
  input.roles.advisor.effort = 'ultra';
  input.runDefaults = { serviceMode: 'fast' };
  await callTool('save_preferences', input);
  const preview = (await callTool('render_client_adapter', {
    workspace,
  })) as any;
  const advisor = preview.files.find((file: any) => file.role === 'advisor');
  expect(advisor.content).toContain('model_reasoning_effort = "ultra"');
  expect(advisor.content).not.toMatch(/fast|service_tier/);
  expect(preview.warnings).toContain(
    'Codex fast mode is run-scoped; generated role files inherit the parent run service mode.'
  );
});

test('marks a profile stale when a selected binding disappears', async () => {
  const input = base('codex') as any;
  input.roles.advisor.effort = 'ultra';
  input.runDefaults = { serviceMode: 'fast' };
  await callTool('save_preferences', input);
  __setCapabilityProbeForTests(async () => ({
    ...codexSnapshot,
    digest: 'changed',
    models: { ...codexSnapshot.models, 'gpt-5.6-sol': { efforts: ['high'] } },
  }));
  const result = (await callTool('validate_configuration', {
    workspace,
  })) as any;
  expect(result.status).toBe('stale-capability');
  expect(result.valid).toBe(false);
  expect(result.detail).toContain('gpt-5.6-sol does not report effort ultra');
});
```

- [ ] **Step 2: Run focused tests and verify failure**

Run:

```bash
bun test plugins/sol-advisor/mcp/server.test.ts --filter "canonical ultra|selected binding disappears"
```

Expected: FAIL because rendering does not know v2 service mode and validation
does not reprobe.

- [ ] **Step 3: Bind rendering to v2 capability evidence**

Keep existing TOML rendering for model and `model_reasoning_effort`. Add no
fast-mode field. Add this warning when `runDefaults.serviceMode === "fast"`:

```ts
warnings.push(
  'Codex fast mode is run-scoped; generated role files inherit the parent run service mode.'
);
```

Include `capabilityEvidence.digest` and `runDefaults` in `planDigest`, so a
catalog or service-mode change invalidates an old installation token.

- [ ] **Step 4: Reprobe before validation and adapter preview**

```ts
async function validateLiveConfiguration(
  preferences: PreferencesV2
): Promise<string[]> {
  if (preferences.client !== 'codex') return [];
  const live = await capabilityProbe();
  const errors = (Object.keys(preferences.roles) as RoleName[]).flatMap(
    (role) => {
      const selected = preferences.roles[role];
      return validateCodexBinding(live, selected.model, selected.effort).map(
        (message) => `roles.${role}: ${message}`
      );
    }
  );
  errors.push(
    ...validateServiceMode(live, preferences.runDefaults.serviceMode, 'run')
  );
  return errors;
}
```

`validate_configuration` returns `status: "stale-capability"` and no preview
when these errors exist. `render_client_adapter` refuses with the same detail. A
digest change that leaves every selected binding supported is recorded as
refreshed evidence during the next explicit save; it does not invalidate solely
because unrelated catalog entries changed.

- [ ] **Step 5: Verify installed-file mismatch remains visible after migration**

```ts
test('migration exposes managed adapter drift until confirmed reinstall', async () => {
  writeLegacyConfig({ routineEffort: 'high', advisorEffort: 'high' });
  const oldPreview = (await callTool('render_client_adapter', {
    workspace,
  })) as any;
  await callTool('install_client_adapter', {
    workspace,
    confirmationToken: oldPreview.confirmationToken,
  });
  writeLegacyConfig({ routineEffort: 'Max', advisorEffort: 'xHigh' });
  const migration = (await callTool('preview_configuration_migration')) as any;
  await callTool('apply_configuration_migration', {
    confirmationToken: migration.confirmationToken,
  });
  const stale = (await callTool('validate_configuration', {
    workspace,
  })) as any;
  expect(stale.valid).toBe(false);
  expect(stale.detail).toContain(
    'managed adapter differs from active preferences'
  );
  const replacement = (await callTool('render_client_adapter', {
    workspace,
  })) as any;
  await callTool('install_client_adapter', {
    workspace,
    confirmationToken: replacement.confirmationToken,
  });
  expect(
    (await callTool('validate_configuration', { workspace })) as any
  ).toMatchObject({
    status: 'ready',
    valid: true,
  });
});
```

- [ ] **Step 6: Run all MCP tests**

Run:

```bash
bun test plugins/sol-advisor/mcp/contracts.test.ts plugins/sol-advisor/mcp/codex-capabilities.test.ts plugins/sol-advisor/mcp/migration.test.ts plugins/sol-advisor/mcp/server.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit adapter validation**

```bash
git add plugins/sol-advisor/mcp/server.ts plugins/sol-advisor/mcp/server.test.ts
git commit -m "feat: bind Sol Advisor adapters to live capabilities"
```

---

### Task 6: Update setup, orchestration guidance, version, and release gates

**Files:**

- Modify: `plugins/sol-advisor/skills/setup/SKILL.md:1-55`
- Modify: `plugins/sol-advisor/skills/orchestration/SKILL.md:1-190`
- Modify: `README.md:1-150`
- Modify: `CHANGELOG.md:5-18`
- Modify: `package.json:1-20`
- Modify: `plugins/sol-advisor/plugin.json:1-16`
- Modify: `plugins/sol-advisor/.codex-plugin/plugin.json:1-16`
- Modify: `plugins/sol-advisor/mcp/server.ts:240-330`
- Modify: `plugins/sol-advisor/scripts/verify.sh:1-180`

**Interfaces:**

- Consumes: completed v2 tools and behavior from Tasks 1-5.
- Produces: exact setup instructions, runtime observation contract, consistent
  minor release version, and CI assertions.

- [ ] **Step 1: Add failing release-script assertions**

Add checks to `verify.sh` before changing prose:

```sh
grep -Fq 'canonical `ultra`' "$plugin_dir/skills/setup/SKILL.md" || fail "setup does not permit capability-backed ultra"
grep -Fq 'fast mode is run-scoped' "$plugin_dir/skills/setup/SKILL.md" || fail "setup does not explain fast-mode scope"
grep -Fq 'stale-capability' "$plugin_dir/skills/orchestration/SKILL.md" || fail "orchestration does not fail closed on stale capability"
grep -Fq 'preview_configuration_migration' "$plugin_dir/skills/setup/SKILL.md" || fail "setup omits migration preview"
```

- [ ] **Step 2: Run verification and confirm documentation assertions fail**

Run:

```bash
sh plugins/sol-advisor/scripts/verify.sh
```

Expected: FAIL at the first newly added guidance assertion.

- [ ] **Step 3: Update setup skill with exact user flow**

Add these requirements in normal prose:

```markdown
- For Codex, call the capability probe before presenting effort choices. Offer
  only efforts reported for the selected model. Canonical `ultra` is valid when
  that exact model reports it; never offer or save Luna / `ultra` when Luna does
  not.
- Ask for run service mode separately: `inherit`, `default`, or `fast`. Codex
  fast mode is run-scoped unless live capability evidence proves a role-scoped
  binding. Fast mode does not reduce reasoning effort or verification policy.
- When setup status is `schema-old`, call `preview_configuration_migration`,
  show every before/after change and the full candidate profile, and call
  `apply_configuration_migration` only after the user repeats its exact one-time
  token.
```

- [ ] **Step 4: Update orchestration skill with runtime observation rules**

Add this exact contract:

```markdown
Before roster approval, show each role's exact model and effort plus the run's
observed service mode. A run-scoped fast-mode selection is inherited context,
not a per-role pin. If configuration status is `stale-capability`, stop before
dispatch and route to setup. Never claim role-scoped fast mode from run-level
evidence, and never weaken verification because fast mode is active.
```

- [ ] **Step 5: Update README and changelog**

Document:

- v2 profile shape and exact casing;
- current model-specific `ultra` behavior;
- Luna's current lack of `ultra` in the local Codex catalog;
- fast mode as independent, run-scoped, and optional;
- two-step preview/apply migration;
- adapter re-preview after a migrated preference changes generated content.

In `CHANGELOG.md`, add under `Unreleased`:

```markdown
### Added

- Capability-aware Codex model/effort validation, including model-gated `ultra`
  reasoning and independent run-scoped fast mode.
- Explicit preview-and-confirm migration for legacy mixed-case effort values.

### Changed

- Sol Advisor profiles now use schema v2 and retain capability evidence for
  fail-closed adapter validation.
```

- [ ] **Step 6: Apply version `0.6.0` consistently**

Set `0.6.0` in `package.json`, both plugin manifests, persisted `pluginVersion`,
JSON-RPC `serverInfo.version`, release checks, and README examples. If
repository HEAD is no longer `0.5.x` when execution begins, stop this task and
report the version conflict rather than guessing a replacement.

- [ ] **Step 7: Run formatter, focused tests, and complete CI**

Run:

```bash
bun test plugins/sol-advisor/mcp/contracts.test.ts plugins/sol-advisor/mcp/codex-capabilities.test.ts plugins/sol-advisor/mcp/migration.test.ts plugins/sol-advisor/mcp/server.test.ts
bun run ci
git diff --check
```

Expected: every test and release gate passes; `git diff --check` prints nothing.

- [ ] **Step 8: Inspect scope before commit**

Run:

```bash
git status --short
git diff --name-only
```

Expected: only files listed by this plan are modified;
`.codex-marketplace-install.json` remains untracked and unstaged.

- [ ] **Step 9: Commit completed capability foundation**

```bash
git add package.json README.md CHANGELOG.md plugins/sol-advisor
git commit -m "feat: add capability-aware Sol Advisor configuration"
```

## Completion Evidence

Phase is complete only when all statements below are proven by fresh output:

- `bun run ci` passes in `/Users/nikhil/.codex/.tmp/marketplaces/sol-advisor`.
- A fresh Codex v2 profile accepts Sol or Terra with canonical `ultra` when
  reported by the live catalog.
- Same profile rejects Luna with `ultra` while Luna lacks that capability.
- Mixed-case `Max` and `xHigh` fail fresh-profile validation.
- Existing mixed-case v1 values change only after exact preview and one-time
  confirmation.
- Fast mode saves as a run-scoped service choice and does not appear in
  generated role TOML.
- Fast mode does not change model, effort, assurance, authority, or evidence
  policy.
- A removed selected capability produces `stale-capability` and blocks adapter
  rendering.
- Existing adapter transaction, rollback, ownership, symlink, and recovery tests
  still pass.
- No unrelated or user-owned files are staged.

## Deferred Follow-On Plans

This phase intentionally stops before roster schema and execution-controller
work. After this foundation ships, create separate implementation plans for:

1. versioned roster manifest, autonomy envelope, skills, A0-A3, and E0-E4 policy
   materialization;
2. event-sourced ledger, deterministic convergence controller, circuit states,
   idempotency, and safe resumption;
3. model-directed dispatch, script fan-out, bounded reduction, reviewer
   independence, and primary acceptance.

Each follow-on plan must consume the capability evidence and service-mode
contracts defined here rather than reimplementing model or effort validation.
