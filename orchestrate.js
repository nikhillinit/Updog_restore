#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = dirname(__filename);
const LEGACY_COMMANDS = new Set(['bootstrap', 'smoke', 'enable-algorithms']);

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
    }
  }

  options.task = options.task.trim();
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

    for (const keyword of config.keywords || []) {
      const phrase = String(
        typeof keyword === 'string' ? keyword : keyword.phrase || ''
      ).toLowerCase();
      const weight = typeof keyword === 'string' ? 1 : keyword.weight || 1;

      if (phrase && input.includes(phrase)) {
        score += weight;
      }
    }

    if (score >= minScore) {
      candidates.push({
        name,
        score,
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

  return candidates[0];
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

function createRoutingPlan({ phase, task, routing, manualModel = null }) {
  const specialist = scoreSpecialist(task, routing.specialists || {}, routing.scoring || {});
  const model = chooseModel(task, phase, routing, manualModel);
  const gate = resolveGate(phase, specialist, routing.gates || {});

  return {
    phase,
    task,
    model,
    specialist: specialist?.name || null,
    risk: specialist?.risk || 'standard',
    score: specialist?.score || 0,
    gate,
  };
}

function buildPrompt({ plan, brain, soul = '' }) {
  const lines = [
    'You are operating inside Updog_restore.',
    '',
    `PHASE: ${plan.phase}`,
    `MODEL ROLE: ${plan.model}`,
  ];

  if (plan.specialist) {
    lines.push(`SPECIALIST: ${plan.specialist} (risk: ${plan.risk})`);
  }

  if (plan.gate) {
    lines.push(`REQUIRED GATE: ${plan.gate}`);
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
    '7. Return: Summary, Affected Files, Changes or Plan, Verification, Risks.'
  );

  return lines.join('\n');
}

function commandExists(bin) {
  if (!bin) return false;
  const checker = process.platform === 'win32' ? 'where.exe' : 'which';
  const result = spawnSync(checker, [bin], { stdio: 'ignore' });
  return result.status === 0;
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

function printHelp(stdout = process.stdout) {
  stdout.write(`Usage:
  node orchestrate.js --phase <phase> --task "<description>"
  node orchestrate.js --json --phase production --task "fix xirr calculation"
  node orchestrate.js --dry-run --phase research --task "trace reserve engine flow"

Phases: research | production | distribution
Options: --claude | --codex | --kimi | --dry-run | --json | --help
Legacy commands: bootstrap | smoke | enable-algorithms
`);
}

class Orchestrator {
  constructor({ root = ROOT, routing = null, brain = '', soul = '' } = {}) {
    this.root = root;
    this.routing = routing;
    this.brain = brain;
    this.soul = soul;
  }

  plan({ phase = 'research', task, manualModel = null, routing = this.routing }) {
    if (!routing) throw new Error('Routing config is required to build a Hermes plan');
    return createRoutingPlan({ phase, task, routing, manualModel });
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
        url: 'http://localhost:3000/api/reserves/1',
        validator: (data) =>
          Array.isArray(data) &&
          data.length > 0 &&
          data[0].allocation !== undefined &&
          data[0].confidence !== undefined,
      },
      {
        name: 'PacingEngine API',
        url: 'http://localhost:3000/api/pacing/summary',
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

async function main(argv = process.argv.slice(2), env = process.env, io = process) {
  const options = parseArgs(argv);

  if (options.help) {
    printHelp(io.stdout);
    return 0;
  }

  if (options.legacyCommand) {
    const orchestrator = new Orchestrator();
    if (options.legacyCommand === 'bootstrap') await orchestrator.bootstrap();
    if (options.legacyCommand === 'smoke') await orchestrator.runSmokeTests();
    if (options.legacyCommand === 'enable-algorithms') orchestrator.enableAlgorithms();
    return 0;
  }

  if (!options.task) {
    throw new Error('--task is required. Use --help for usage.');
  }

  const routingPath =
    env.HERMES_MODEL_ROUTING_FILE || join(ROOT, '.claude', 'hermes', 'model-routing.json');
  const brainPath = env.HERMES_DEV_BRAIN_FILE || join(ROOT, 'DEV_BRAIN.md');
  const soulPath = env.HERMES_SOUL_FILE || join(ROOT, '.claude', 'hermes', 'SOUL.md');
  const routing = loadJSON(routingPath);
  const brain = loadText(brainPath);
  const soul = loadText(soulPath, { optional: true });
  const plan = createRoutingPlan({
    phase: options.phase,
    task: options.task,
    routing,
    manualModel: options.manualModel,
  });
  const prompt = buildPrompt({ plan, brain, soul });

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

  return executeModel(plan.model, prompt, routing, env);
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
  buildPrompt,
  chooseModel,
  createRoutingPlan,
  isCliEntryPoint,
  main,
  parseArgs,
  resolveGate,
  scoreSpecialist,
};
