#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = dirname(__filename);
const LEGACY_COMMANDS = new Set(['bootstrap', 'smoke', 'enable-algorithms', 'doctor']);
const DOCTOR_PROVIDERS = ['claude', 'codex', 'kimi-cli', 'gemini', 'agy'];
const WORKFLOW_MODES = new Set(['auto', 'solo', 'pair', 'chain', 'debate', 'review']);
const MODEL_OVERRIDES = new Set(['claude', 'codex', 'kimi', 'gemini', 'agy']);
const WORKFLOW_DEFERRED_BEHAVIOR = [
  'model execution',
  'artifact handoff',
  'review platform automation',
];

const DEFAULT_DEBATE = {
  comparators: ['claude', 'codex', 'kimi'],
  synthesis: 'claude',
};

function normalizeEntrypointPath(value) {
  return String(value || '')
    .replace(/^file:\/\//, '')
    .replace(/\\/g, '/')
    .replace(/^\/([A-Za-z]:\/)/, '$1')
    .toLowerCase();
}

function isCliEntryPoint(metaUrl, argv = process.argv) {
  if (!argv[1]) return false;

  let modulePath = metaUrl;
  try {
    modulePath = fileURLToPath(metaUrl);
  } catch {
    modulePath = metaUrl;
  }

  return normalizeEntrypointPath(modulePath) === normalizeEntrypointPath(argv[1]);
}

function parseArgs(argv = []) {
  const options = {
    phase: 'research',
    task: '',
    dryRun: false,
    json: false,
    help: false,
    skipPreflightGate: false,
    gateSkipReason: null,
    workflow: 'auto',
    workflowProvided: false,
    manualModel: null,
    legacyCommand: null,
  };

  if (argv[0] && LEGACY_COMMANDS.has(argv[0])) {
    options.legacyCommand = argv[0];
    return options;
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--skip-gates') {
      throw new Error('Use --skip-preflight-gate with --skip-reason instead of --skip-gates.');
    } else if (arg === '--skip-preflight-gate') {
      options.skipPreflightGate = true;
    } else if (arg === '--skip-reason') {
      options.gateSkipReason = argv[index + 1] || '';
      index += 1;
    } else if (arg === '--workflow') {
      const workflow = argv[index + 1] || '';
      if (!WORKFLOW_MODES.has(workflow)) {
        throw new Error(
          `Unknown workflow "${workflow}". Expected one of: ${[...WORKFLOW_MODES].join(', ')}.`
        );
      }
      options.workflow = workflow;
      options.workflowProvided = true;
      index += 1;
    } else if (arg === '--model') {
      const model = argv[index + 1] || '';
      if (!MODEL_OVERRIDES.has(model)) {
        throw new Error(
          `Unknown model "${model}". Expected one of: ${[...MODEL_OVERRIDES].join(', ')}.`
        );
      }
      options.manualModel = model;
      index += 1;
    } else if (arg === '--phase') {
      options.phase = argv[index + 1] || options.phase;
      index += 1;
    } else if (arg === '--task') {
      options.task = argv[index + 1] || '';
      index += 1;
    } else if (arg === '--claude') {
      options.manualModel = 'claude';
    } else if (arg === '--codex') {
      options.manualModel = 'codex';
    } else if (arg === '--kimi') {
      options.manualModel = 'kimi';
    } else if (arg === '--gemini') {
      options.manualModel = 'gemini';
    } else if (arg === '--agy') {
      options.manualModel = 'agy';
    }
  }

  options.task = options.task.trim();
  options.gateSkipReason = options.gateSkipReason?.trim() || null;

  if (options.skipPreflightGate && !options.gateSkipReason) {
    throw new Error('--skip-preflight-gate requires --skip-reason <reason>.');
  }

  return options;
}

function loadJSON(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`Missing JSON file: ${filePath}`);
  }
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function loadText(filePath, { optional = false } = {}) {
  if (!existsSync(filePath)) {
    if (optional) return '';
    throw new Error(`Missing text file: ${filePath}`);
  }
  return readFileSync(filePath, 'utf8');
}

function scoreSpecialist(task, specialists = {}, scoring = {}) {
  const input = task.toLowerCase();
  const minScore = scoring.minScoreToAssign ?? 3;
  const riskOrder = scoring.riskOrder ?? ['financial', 'operational', 'quality'];
  const candidates = [];

  for (const [name, config] of Object.entries(specialists)) {
    let score = 0;
    let maxScore = 0;
    const matched = [];

    for (const keyword of config.keywords || []) {
      const phrase = String(
        typeof keyword === 'string' ? keyword : keyword.phrase || ''
      ).toLowerCase();
      const weight = typeof keyword === 'string' ? 1 : keyword.weight || 1;

      maxScore += weight;
      if (phrase && input.includes(phrase)) {
        score += weight;
        matched.push(phrase);
      }
    }

    if (score >= minScore) {
      candidates.push({
        name,
        score,
        maxScore,
        confidence: maxScore > 0 ? Math.round((score / maxScore) * 100) / 100 : 0,
        matched,
        risk: config.risk || 'quality',
      });
    }
  }

  if (candidates.length === 0) return null;

  candidates.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;

    const leftRisk = riskOrder.indexOf(left.risk);
    const rightRisk = riskOrder.indexOf(right.risk);
    return (leftRisk === -1 ? 99 : leftRisk) - (rightRisk === -1 ? 99 : rightRisk);
  });

  const [selected] = candidates;
  return { ...selected, candidates };
}

function chooseModel(task, phase, routing, manualModel = null) {
  if (manualModel) return manualModel;

  const input = task.toLowerCase();
  for (const trigger of routing.longContextTriggers || []) {
    if (input.includes(String(trigger).toLowerCase())) {
      return routing.longContextModel || 'kimi';
    }
  }

  return routing.defaults?.[phase] || 'claude';
}

function resolveGate(phase, specialist, gates = {}) {
  if (specialist?.risk === 'financial' && phase === 'production') {
    return gates['production-financial'] || gates.production || null;
  }
  return gates[phase] || null;
}

function resolveEffectivePhase(phase, specialist) {
  if (phase === 'production' && specialist?.risk === 'financial') {
    return 'production-financial';
  }
  return phase;
}

function resolveOwnership(phase, specialist, ownership = {}) {
  const effective = resolveEffectivePhase(phase, specialist);
  const entry = ownership[effective] || ownership[phase];
  if (!entry) return null;
  return { effectivePhase: effective, ...entry };
}

function recommendWorkflow({ phase, risk = 'standard' }) {
  if (risk === 'financial') return 'pair';
  if (phase === 'distribution') return 'review';
  if (phase === 'research') return 'chain';
  return 'solo';
}

function createWorkflowPlan({
  requestedWorkflow = 'auto',
  phase,
  model,
  specialist,
  gate,
  ownership = null,
  risk = 'standard',
  debate = null,
}) {
  if (!WORKFLOW_MODES.has(requestedWorkflow)) {
    throw new Error(
      `Unknown workflow "${requestedWorkflow}". Expected one of: ${[...WORKFLOW_MODES].join(', ')}.`
    );
  }

  const selected =
    requestedWorkflow === 'auto' ? recommendWorkflow({ phase, risk }) : requestedWorkflow;
  const effectivePhase = ownership?.effectivePhase || phase;
  const ownerModel = model || ownership?.owner;
  const artifact = ownership?.artifact || 'artifact';
  const steps = [];

  // 'review' mode reviews an existing artifact, so it never re-runs the owner lane;
  // because distribution ownership has no reviewer, distribution 'review' is
  // gate-only by design (the lint gate is the review). 'debate' replaces the single
  // owner lane with N comparators plus a synthesis step (added below).
  if (selected !== 'review' && selected !== 'debate' && ownerModel) {
    const role = ownership?.role ? ` ${ownership.role}` : '';
    steps.push({
      role: 'owner',
      model: ownerModel,
      action: `execute ${effectivePhase}${role} lane`,
    });
  }

  if ((selected === 'chain' || (selected === 'pair' && risk === 'financial')) && specialist) {
    steps.push({
      role: 'specialist',
      model: specialist.name || specialist,
      action: 'review financial risk before completion',
    });
  }

  if (
    (selected === 'pair' || selected === 'chain' || selected === 'review') &&
    ownership?.reviewer
  ) {
    steps.push({
      role: 'reviewer',
      model: ownership.reviewer,
      action: `review ${artifact}`,
    });
  }

  // Debate carries no audit step by design; synthesis is the accountable artifact.
  if ((selected === 'chain' || selected === 'pair') && ownership?.audit) {
    steps.push({
      role: 'audit',
      model: ownership.audit,
      action:
        risk === 'financial' ? 'audit financial readiness evidence' : 'audit workflow evidence',
    });
  }

  if (selected === 'debate') {
    const debateConfig = debate || DEFAULT_DEBATE;
    const comparatorModels =
      Array.isArray(debateConfig.comparators) && debateConfig.comparators.length > 0
        ? debateConfig.comparators
        : DEFAULT_DEBATE.comparators;
    const synthesisModel = debateConfig.synthesis || DEFAULT_DEBATE.synthesis;

    for (const comparatorModel of comparatorModels) {
      steps.push({
        role: 'comparator',
        model: comparatorModel,
        action: `compare ${effectivePhase} options`,
      });
    }

    steps.push({
      role: 'synthesis',
      model: synthesisModel,
      action: `synthesize ${effectivePhase} options into ${artifact}`,
    });
  }

  if (gate) {
    steps.push({
      role: 'gate',
      model: null,
      action: `run ${gate}`,
    });
  }

  return {
    requested: requestedWorkflow,
    selected,
    planningOnly: true,
    gate,
    deferred: WORKFLOW_DEFERRED_BEHAVIOR,
    steps,
  };
}

function createRoutingPlan({
  phase,
  task,
  routing,
  manualModel = null,
  requestedWorkflow = null,
  skipPreflightGate = false,
  gateSkipReason = null,
}) {
  const specialist = scoreSpecialist(task, routing.specialists || {}, routing.scoring || {});
  const model = chooseModel(task, phase, routing, manualModel);
  const gate = resolveGate(phase, specialist, routing.gates || {});
  const ownership = resolveOwnership(phase, specialist, routing.ownership || {});
  const risk = specialist?.risk || 'standard';

  const plan = {
    phase,
    task,
    model,
    specialist: specialist?.name || null,
    risk,
    score: specialist?.score || 0,
    confidence: specialist?.confidence ?? 0,
    candidates: specialist?.candidates || [],
    gate,
  };

  if (requestedWorkflow) {
    plan.workflow = createWorkflowPlan({
      requestedWorkflow,
      phase,
      model,
      specialist,
      gate,
      ownership,
      risk,
      debate: routing.debate || null,
    });
  }

  if (ownership) {
    plan.ownership = ownership;
  }

  if (skipPreflightGate) {
    plan.gateSkip = {
      preflight: true,
      reason: gateSkipReason || 'unspecified',
    };
  }

  return plan;
}

function buildPrompt({ plan, brain, soul = '', runId = null }) {
  const lines = [
    'You are operating inside Updog_restore.',
    '',
    `PHASE: ${plan.phase}`,
    `MODEL ROLE: ${plan.model}`,
  ];

  if (plan.ownership) {
    const own = plan.ownership;
    const ownerLine = [
      `OWNER: ${own.owner}`,
      own.reviewer ? `reviewer: ${own.reviewer}` : null,
      own.role ? `role: ${own.role}` : null,
      own.artifact ? `artifact: ${own.artifact}` : null,
      own.humanApproval ? 'human approval required' : null,
    ]
      .filter(Boolean)
      .join('; ');
    lines.push(ownerLine);
  }

  if (plan.specialist) {
    const confidencePct = Math.round((plan.confidence ?? 0) * 100);
    lines.push(
      `SPECIALIST: ${plan.specialist} (risk: ${plan.risk}; confidence: ${confidencePct}%)`
    );
  }

  if (plan.gate) {
    lines.push(`REQUIRED GATE: ${plan.gate}`);
  }

  if (runId) {
    lines.push(`RUN ID: ${runId}`);
  }

  lines.push('', '--- DEV_BRAIN ---', brain.trim(), '--- END DEV_BRAIN ---');

  if (soul.trim()) {
    lines.push('', '--- HERMES_SOUL ---', soul.trim(), '--- END HERMES_SOUL ---');
  }

  lines.push(
    '',
    `TASK: ${plan.task}`,
    '',
    'Instructions:',
    '1. Read your governance file first when filesystem access is available.',
    '2. Search for existing implementations before proposing new code.',
    '3. Use .claude/DISCOVERY-MAP.md and .claude/AGENT-DIRECTORY.md for routing.',
    '4. Prefer existing specialists before inventing new abstractions.',
    '5. Produce the smallest safe diff.',
    '6. If financial logic is touched, confirm calc-gate coverage.',
    '7. Return: Summary, Affected Files, Changes or Plan, Verification, Risks.',
    '8. End with a compact Handoff block listing:',
    '   Run ID, Phase, Owner, Reviewer, Task, Protected areas, Files touched,',
    '   Commands run, Gate status, Decision needed, Next action.',
    '9. If writing a persisted handoff or checkpoint artifact, conform to',
    '   .claude/schemas/handoff.schema.json.'
  );

  return lines.join('\n');
}

function commandExists(bin) {
  if (!bin) return false;
  // Absolute or relative path: check the filesystem directly. where.exe/which
  // only resolve bare names from PATH and error on absolute paths.
  if (/[\\/]/.test(bin)) {
    if (existsSync(bin)) return true;
    if (process.platform === 'win32' && !/\.[a-zA-Z0-9]+$/.test(bin)) {
      return ['.exe', '.cmd', '.bat'].some((ext) => existsSync(bin + ext));
    }
    return false;
  }
  const checker = process.platform === 'win32' ? 'where.exe' : 'which';
  const result = spawnSync(checker, [bin], { stdio: 'ignore' });
  return result.status === 0;
}

function findDoctorCommandConfig(routing, provider) {
  const commands = routing.commands || {};
  if (commands[provider]) return commands[provider];
  return Object.values(commands).find((config) => config?.defaultBin === provider) || null;
}

function buildDoctorReport({
  routing,
  env = process.env,
  providers = DOCTOR_PROVIDERS,
  commandExists: checkCommandExists = commandExists,
}) {
  return providers.map((provider) => {
    const commandConfig = findDoctorCommandConfig(routing, provider);
    const envName = commandConfig?.binEnv;
    const envBin = envName ? env[envName] : null;
    const bin = envBin || commandConfig?.defaultBin || provider;
    const source = envBin ? `env:${envName}` : 'default';

    return {
      provider,
      bin,
      source,
      found: checkCommandExists(bin),
    };
  });
}

function formatDoctorReport(report) {
  const rows = [
    ['Provider', 'Binary', 'Source', 'Status'],
    ...report.map(({ provider, bin, source, found }) => [
      provider,
      bin,
      source,
      found ? 'found' : 'missing',
    ]),
  ];
  const widths = rows[0].map((_, index) =>
    Math.max(...rows.map((row) => String(row[index]).length))
  );
  const formatRow = (row) =>
    row.map((value, index) => String(value).padEnd(widths[index])).join('  ');
  const divider = widths.map((width) => '-'.repeat(width)).join('  ');

  return [formatRow(rows[0]), divider, ...rows.slice(1).map(formatRow)].join('\n');
}

function printDoctorReport(report, stdout = process.stdout) {
  stdout.write('Hermes CLI doctor\n');
  stdout.write(`${formatDoctorReport(report)}\n`);
}

function executeModel(model, prompt, routing, env = process.env) {
  const commandConfig = routing.commands?.[model];
  if (!commandConfig) {
    throw new Error(`No command config for model: ${model}`);
  }

  const bin = env[commandConfig.binEnv] || commandConfig.defaultBin;
  if (!commandExists(bin)) {
    throw new Error(
      `Command not found for model "${model}": ${bin}. Set ${commandConfig.binEnv} or install the CLI.`
    );
  }

  return new Promise((resolvePromise, reject) => {
    const child = spawn(bin, commandConfig.args || [], {
      stdio: ['pipe', 'inherit', 'inherit'],
      shell: process.platform === 'win32',
      env,
    });

    child.stdin.write(prompt);
    child.stdin.end();
    child.on('error', reject);
    child.on('close', (code) => resolvePromise(code || 0));
  });
}

function runGate(
  gate,
  { runner = spawnSync, env = process.env, stdio = 'inherit', throwOnFailure = true } = {}
) {
  const command = String(gate || '').trim();
  if (!command) {
    return { command: null, skipped: true, status: 0 };
  }

  const [bin, ...args] = command.split(/\s+/);
  const result = runner(bin, args, {
    env,
    shell: process.platform === 'win32',
    stdio,
  });

  if (result.error) {
    throw result.error;
  }

  const status = result.status ?? 0;
  if (status !== 0 && throwOnFailure) {
    throw new Error(`Gate failed (${command}) with exit code ${status}`);
  }

  return { command, skipped: false, status };
}

function generateRunId(now = new Date()) {
  const iso = now.toISOString().replace(/[:.]/g, '-').replace('Z', 'Z');
  return `hermes-${iso}`;
}

function writeRunLedger(record, { root = ROOT, fs = { mkdirSync, writeFileSync } } = {}) {
  const dir = join(root, 'ai-logs', 'hermes', 'runs');
  fs.mkdirSync(dir, { recursive: true });
  const file = join(dir, `${record.runId}.json`);
  fs.writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`);
  return file;
}

function getGateRunPlan(plan, { skipPreflightGate = false } = {}) {
  const hasGate = Boolean(plan.gate);
  return {
    preflight: hasGate && !skipPreflightGate,
    postflight: hasGate,
  };
}

function isProductionFinancial(plan) {
  return plan.phase === 'production' && plan.risk === 'financial';
}

function assertFinancialGate(plan) {
  if (!isProductionFinancial(plan)) {
    return;
  }
  if (plan.gate !== 'npm run calc-gate') {
    throw new Error(
      `Financial gate proof failed: production-financial plan must resolve gate to "npm run calc-gate", got "${plan.gate}".`
    );
  }
}

// Structured readiness boundary. assertFinancialGate stays the throwing core; this
// wraps it so a CLI or report surface can present a not-ready outcome without
// crashing. When an execution result is supplied, a nonzero exit or an unapproved
// artifact also blocks readiness.
function evaluateReadiness(plan, result = null) {
  if (!plan || typeof plan !== 'object') {
    return { ready: false, reason: 'evaluateReadiness requires a plan object.' };
  }

  try {
    assertFinancialGate(plan);
  } catch (error) {
    return { ready: false, reason: error.message };
  }

  if (result) {
    if (Number.isInteger(result.exitCode) && result.exitCode !== 0) {
      return { ready: false, reason: `workflow exited with code ${result.exitCode}` };
    }
    if (result.approved === false) {
      return { ready: false, reason: 'reviewer did not approve the artifact' };
    }
  }

  return { ready: true, reason: null };
}

function shouldRunPostflightGate(plan, code, gates) {
  return gates.postflight && (code === 0 || isProductionFinancial(plan));
}

function defaultRunStep() {
  throw new Error(
    'executeWorkflow requires deps.runStep until live model wiring lands; pass an injected step runner.'
  );
}

async function executeWorkflow(plan, deps = {}) {
  const workflow = plan.workflow;
  if (!workflow || !Array.isArray(workflow.steps)) {
    throw new Error('executeWorkflow requires a plan with a workflow.steps array.');
  }

  const maxRepairs = Number.isInteger(deps.maxRepairs) ? deps.maxRepairs : 2;
  const runStep = deps.runStep || defaultRunStep;
  const gateRunner = deps.gateRunner || spawnSync;
  const assertGate = deps.assertFinancialGate || assertFinancialGate;
  const ledgerWriter = deps.writeRunLedger === undefined ? null : deps.writeRunLedger;
  const clock = deps.clock || (() => new Date());
  const runId = deps.runId || generateRunId(clock());

  const stepByRole = (role) => workflow.steps.find((step) => step.role === role) || null;
  const ownerStep = stepByRole('owner');
  const specialistStep = stepByRole('specialist');
  const reviewerStep = stepByRole('reviewer');
  const auditStep = stepByRole('audit');
  const comparatorSteps = workflow.steps.filter((step) => step.role === 'comparator');
  const synthesisStep = stepByRole('synthesis');

  let specialistNotes = null;
  const records = [];
  let debateStepFailureCode = 0;
  const runRecorded = async (step, input, attempt) => {
    const result = await runStep({ step, input, notes: specialistNotes, plan, attempt, runId });
    const code = result.code ?? 0;
    if (
      debateStepFailureCode === 0 &&
      (step.role === 'comparator' || step.role === 'synthesis') &&
      code !== 0
    ) {
      debateStepFailureCode = code;
    }
    records.push({
      role: step.role,
      model: step.model,
      attempt,
      code,
      approved: result.approved ?? null,
      output: result.output ?? '',
    });
    return result;
  };

  let artifact = null;
  let approved = true;
  let repairs = 0;

  if (comparatorSteps.length > 0) {
    const comparatorOutputs = [];
    for (const comparatorStep of comparatorSteps) {
      const comparator = await runRecorded(comparatorStep, null, 0);
      comparatorOutputs.push(comparator.output ?? '');
    }
    if (synthesisStep) {
      const synthesis = await runRecorded(synthesisStep, comparatorOutputs, 0);
      artifact = synthesis.output ?? '';
    }
  } else {
    if (ownerStep) {
      const owner = await runRecorded(ownerStep, null, 0);
      artifact = owner.output ?? '';
    }

    if (specialistStep) {
      const specialist = await runRecorded(specialistStep, artifact, 0);
      specialistNotes = specialist.output ?? null;
    }

    if (reviewerStep) {
      let review = await runRecorded(reviewerStep, artifact, 0);
      approved = Boolean(review.approved);
      while (!approved && repairs < maxRepairs && ownerStep) {
        repairs += 1;
        const repair = await runRecorded(ownerStep, review.output ?? '', repairs);
        artifact = repair.output ?? artifact;
        review = await runRecorded(reviewerStep, artifact, repairs);
        approved = Boolean(review.approved);
      }
    }

    if (auditStep) {
      await runRecorded(auditStep, artifact, repairs);
    }
  }

  let gate = { command: plan.gate || null, skipped: !plan.gate, status: 0 };
  if (plan.gate) {
    if (isProductionFinancial(plan)) {
      assertGate(plan);
    }
    gate = runGate(plan.gate, { runner: gateRunner, throwOnFailure: false });
  }

  let exitCode = 0;
  if (gate.status && gate.status !== 0) {
    exitCode = gate.status;
  } else if (debateStepFailureCode !== 0) {
    exitCode = debateStepFailureCode;
  } else if (reviewerStep && !approved) {
    exitCode = 1;
  }

  const record = {
    runId,
    workflow: workflow.selected,
    phase: plan.phase,
    risk: plan.risk,
    approved,
    repairs,
    steps: records,
    gate: {
      command: gate.command ?? null,
      status: gate.status ?? 0,
      skipped: gate.skipped ?? false,
    },
    exitCode,
  };

  if (ledgerWriter) {
    try {
      ledgerWriter(record);
    } catch {
      // ledger persistence is best-effort; the execution result is still returned
    }
  }

  return record;
}

function printHelp(stdout = process.stdout) {
  stdout.write(`Usage:
  node orchestrate.js --phase <research|production|distribution> --task "<description>"
  node orchestrate.js --json --phase production --task "fix xirr calculation"
  node orchestrate.js --dry-run --phase research --task "trace reserve engine flow"
  node orchestrate.js --dry-run --workflow pair --model codex --phase production --task "implement feature"
  node orchestrate.js --phase production --task "repair calc gate" --skip-preflight-gate --skip-reason "<reason>"

Phases:
  research      Default Claude planning lane; gate: npm run doctor:quick.
  production    Default Codex implementation lane; gate: npm run check.
  distribution  Default Claude handoff lane; gate: npm run lint.
  Financial production tasks are promoted internally to production-financial; gate: npm run calc-gate.

Model overrides:
  --claude | --codex | --kimi
  --model <claude|codex|kimi>

Output:
  --dry-run       Print the routing plan and prompt without model execution.
  --json          Print routing plan JSON only.
  --help, -h      Show this help.

Workflow planning:
  --workflow <auto|solo|pair|chain|debate|review>
                 Add a planning-only workflow recommendation to dry-run output.

Gate controls:
  --skip-preflight-gate --skip-reason "<reason>"
                 Skip only the preflight gate; postflight gates still run.
                 Legacy --skip-gates is rejected.

Legacy commands:
  bootstrap | smoke | enable-algorithms | doctor
`);
}

class Orchestrator {
  constructor({ root = ROOT, routing = null, brain = '', soul = '' } = {}) {
    this.root = root;
    this.routing = routing;
    this.brain = brain;
    this.soul = soul;
  }

  plan({
    phase = 'research',
    task,
    manualModel = null,
    requestedWorkflow = 'auto',
    routing = this.routing,
  }) {
    if (!routing) throw new Error('Routing config is required to build a Hermes plan');
    return createRoutingPlan({ phase, task, routing, manualModel, requestedWorkflow });
  }

  execute({
    phase = 'research',
    task,
    manualModel = null,
    routing = this.routing,
    env = process.env,
  }) {
    const plan = this.plan({ phase, task, manualModel, routing });
    const prompt = buildPrompt({ plan, brain: this.brain, soul: this.soul });
    return executeModel(plan.model, prompt, routing, env);
  }

  async bootstrap() {
    const dirs = ['client/src/core/reserves', 'client/src/core/pacing', 'tests/fixtures'];

    for (const dir of dirs) {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
        console.log(`[legacy] Created ${dir}`);
      }
    }

    console.log('[legacy] Bootstrap sequence completed');
  }

  async runSmokeTests(fetchImpl = globalThis.fetch) {
    const tests = [
      {
        name: 'ReserveEngine API',
        url: 'http://localhost:5000/api/reserves/1',
        validator: (data) =>
          Array.isArray(data) &&
          data.length > 0 &&
          data[0].allocation !== undefined &&
          data[0].confidence !== undefined,
      },
      {
        name: 'PacingEngine API',
        url: 'http://localhost:5000/api/pacing/summary',
        validator: (data) =>
          Array.isArray(data) &&
          data.length > 0 &&
          data[0].quarter !== undefined &&
          data[0].deployment !== undefined,
      },
    ];

    for (const test of tests) {
      try {
        const response = await fetchImpl(test.url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        const status = test.validator(data) ? 'PASS' : 'FAIL invalid response structure';
        console.log(`[legacy] ${test.name}: ${status}`);
      } catch (error) {
        console.log(`[legacy] ${test.name}: FAIL ${error.message}`);
      }
    }
  }

  enableAlgorithms() {
    process.env.ALG_RESERVE = 'true';
    process.env.ALG_PACING = 'true';
    console.log('[legacy] ALG_RESERVE=true');
    console.log('[legacy] ALG_PACING=true');
  }
}

async function main(argv = process.argv.slice(2), env = process.env, io = process, deps = {}) {
  const options = parseArgs(argv);
  const runModel = deps.executeModel || executeModel;
  const gateRunner = deps.gateRunner || spawnSync;
  const ledgerWriter = deps.writeRunLedger === undefined ? writeRunLedger : deps.writeRunLedger;
  const clock = deps.clock || (() => new Date());

  if (options.help) {
    printHelp(io.stdout);
    return 0;
  }

  if (options.legacyCommand) {
    if (options.legacyCommand === 'doctor') {
      const routingPath =
        env.HERMES_MODEL_ROUTING_FILE || join(ROOT, '.claude', 'hermes', 'model-routing.json');
      const routing = deps.routing || loadJSON(routingPath);
      const report = buildDoctorReport({
        routing,
        env,
        providers: DOCTOR_PROVIDERS,
        commandExists: deps.commandExists || commandExists,
      });
      printDoctorReport(report, io.stdout);
      return 0;
    }

    const orchestrator = new Orchestrator();
    if (options.legacyCommand === 'bootstrap') await orchestrator.bootstrap();
    if (options.legacyCommand === 'smoke') await orchestrator.runSmokeTests();
    if (options.legacyCommand === 'enable-algorithms') orchestrator.enableAlgorithms();
    return 0;
  }

  if (!options.task) {
    throw new Error('--task is required. Use --help for usage.');
  }

  if (options.workflowProvided && !options.dryRun && !options.json) {
    throw new Error('--workflow is planning-only; use --dry-run or --json.');
  }

  const routingPath =
    env.HERMES_MODEL_ROUTING_FILE || join(ROOT, '.claude', 'hermes', 'model-routing.json');
  const brainPath = env.HERMES_DEV_BRAIN_FILE || join(ROOT, 'DEV_BRAIN.md');
  const soulPath = env.HERMES_SOUL_FILE || join(ROOT, '.claude', 'hermes', 'SOUL.md');
  const routing = deps.routing || loadJSON(routingPath);
  const brain = deps.brain ?? loadText(brainPath);
  const soul = deps.soul ?? loadText(soulPath, { optional: true });
  const runId = generateRunId(clock());
  const plan = createRoutingPlan({
    phase: options.phase,
    task: options.task,
    routing,
    manualModel: options.manualModel,
    requestedWorkflow: options.workflowProvided ? options.workflow : null,
    skipPreflightGate: options.skipPreflightGate,
    gateSkipReason: options.gateSkipReason,
  });
  const prompt = buildPrompt({ plan, brain, soul, runId });

  if (options.json) {
    io.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
    return 0;
  }

  if (options.dryRun) {
    io.stdout.write('=== ROUTING PLAN ===\n');
    io.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
    io.stdout.write('\n=== PROMPT ===\n');
    io.stdout.write(`${prompt}\n`);
    return 0;
  }

  const ledger = {
    runId,
    startedAt: clock().toISOString(),
    plan,
    preflight: null,
    model: null,
    postflight: null,
    exitCode: null,
  };

  const finalizeLedger = (exitCode) => {
    ledger.exitCode = exitCode;
    ledger.completedAt = clock().toISOString();
    if (!ledgerWriter) return;
    try {
      ledgerWriter(ledger);
    } catch (error) {
      io.stderr.write(`[hermes] WARNING: failed to write run ledger: ${error.message}\n`);
    }
  };

  const gates = getGateRunPlan(plan, options);

  if (gates.preflight) {
    const preflight = runGate(plan.gate, {
      env,
      runner: gateRunner,
      throwOnFailure: false,
    });
    ledger.preflight = { command: plan.gate, status: preflight.status, skipped: false };
    if (preflight.status !== 0) {
      finalizeLedger(preflight.status);
      return preflight.status;
    }
  } else if (plan.gate && options.skipPreflightGate) {
    ledger.preflight = {
      command: plan.gate,
      status: null,
      skipped: true,
      reason: options.gateSkipReason,
    };
    io.stderr.write(
      `[hermes] WARNING: skipping preflight gate "${plan.gate}"; reason: ${options.gateSkipReason}\n`
    );
  }

  const code = await runModel(plan.model, prompt, routing, env);
  ledger.model = { name: plan.model, exitCode: code };

  if (shouldRunPostflightGate(plan, code, gates)) {
    const postflight = runGate(plan.gate, {
      env,
      runner: gateRunner,
      throwOnFailure: false,
    });
    ledger.postflight = { command: plan.gate, status: postflight.status };
    if (postflight.status !== 0) {
      if (code !== 0) {
        io.stderr.write(
          `[hermes] WARNING: model exited ${code} and postflight gate exited ${postflight.status}\n`
        );
      }
      finalizeLedger(postflight.status);
      return postflight.status;
    }
  }

  finalizeLedger(code);
  return code;
}

if (isCliEntryPoint(import.meta.url, process.argv)) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      process.stderr.write(`[hermes] ${error.message}\n`);
      process.exitCode = 1;
    });
}

export {
  Orchestrator,
  assertFinancialGate,
  buildDoctorReport,
  buildPrompt,
  chooseModel,
  createWorkflowPlan,
  createRoutingPlan,
  evaluateReadiness,
  executeWorkflow,
  generateRunId,
  getGateRunPlan,
  isCliEntryPoint,
  isProductionFinancial,
  main,
  parseArgs,
  recommendWorkflow,
  resolveEffectivePhase,
  resolveGate,
  resolveOwnership,
  runGate,
  shouldRunPostflightGate,
  scoreSpecialist,
  writeRunLedger,
};
