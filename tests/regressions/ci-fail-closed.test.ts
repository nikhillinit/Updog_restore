import { execFile } from 'node:child_process';
import { access, mkdtemp, open, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { runInNewContext } from 'node:vm';

import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';
import YAML from 'yaml';

type WorkflowStep = {
  ['continue-on-error']?: boolean;
  env?: Record<string, unknown>;
  id?: string;
  name?: string;
  run?: string;
  shell?: string;
  uses?: string;
  with?: Record<string, unknown>;
};

type WorkflowJob = {
  defaults?: {
    run?: {
      shell?: string;
    };
  };
  environment?: string;
  if?: string;
  needs?: string | string[];
  outputs?: Record<string, unknown>;
  ['runs-on']?: string | string[];
  steps?: WorkflowStep[];
  uses?: string;
  with?: Record<string, unknown>;
  secrets?: unknown;
};

type Workflow = {
  defaults?: {
    run?: {
      shell?: string;
    };
  };
  jobs?: Record<string, WorkflowJob>;
  on?: Record<string, unknown>;
  permissions?: Record<string, unknown>;
};

type AutomationSurface = {
  content: string;
  dialect?: ShellDialect;
  id: string;
  language: 'action' | 'javascript' | 'python' | 'shell';
};

type ShellDialect = 'cmd' | 'portable' | 'posix' | 'powershell';

const DYNAMIC_ATOMIC_ARGUMENT = '__DYNAMIC_ATOMIC_ARGUMENT__';
const DYNAMIC_SHELL_ARGUMENT = '__DYNAMIC_SHELL_ARGUMENT__';

type CompositeAction = {
  runs?: {
    steps?: WorkflowStep[];
  };
};

const workflowsDir = path.join(process.cwd(), '.github', 'workflows');
const execFileAsync = promisify(execFile);

const AUTOMATION_SCAN_EXCLUDED_DIRECTORIES = new Set([
  '.git',
  '.cache',
  '.npm-cache',
  '.omx',
  '.superpowers',
  '.vercel',
  'build',
  'coverage',
  'dist',
  'docs',
  'node_modules',
  'snapshots',
  'tests',
]);
const AUTOMATION_SOURCE_EXTENSIONS = new Set([
  '.bat',
  '.bash',
  '.cjs',
  '.cmd',
  '.cts',
  '.js',
  '.mjs',
  '.mts',
  '.ps1',
  '.py',
  '.sh',
  '.ts',
  '.tsx',
  '.zsh',
]);

async function readWorkflow(name: string): Promise<Workflow> {
  const contents = await readFile(path.join(workflowsDir, name), 'utf8');
  return YAML.parse(contents) as Workflow;
}

function allRunScripts(workflow: Workflow): string[] {
  return Object.values(workflow.jobs ?? {}).flatMap((job) =>
    (job.steps ?? []).flatMap((step) => (typeof step.run === 'string' ? [step.run] : []))
  );
}

function normalizeNeeds(needs: WorkflowJob['needs']): string[] {
  if (typeof needs === 'string') return [needs];
  return needs ?? [];
}

// A "reporting publisher" writes presentation-only content to the GitHub API
// (PR comments, labels, commit statuses, check runs). These calls depend on an
// external service; an outage on that surface is not a validation failure, so a
// reporting step must never be able to fail a job that feeds the required gate.
const REPORTING_WRITE_CALL =
  /createComment|updateComment|addLabels|removeLabel|setLabels|createCommitStatus|createStatus|checks\.create|checks\.update/;

function isReportingPublisher(step: WorkflowStep | undefined): boolean {
  if (!step || typeof step.uses !== 'string' || !step.uses.startsWith('actions/github-script')) {
    return false;
  }
  const script = typeof step.with?.script === 'string' ? step.with.script : '';
  return REPORTING_WRITE_CALL.test(script);
}

function isFailOpen(step: WorkflowStep | undefined): boolean {
  return step?.['continue-on-error'] === true;
}

function hasBoundedRetries(step: WorkflowStep | undefined): boolean {
  // The actions/github-script default is `retries: 0` (no retry). A reporting
  // step must set a bounded, positive retry count so a transient 5xx is absorbed
  // before it gives up; continue-on-error then guarantees that even an exhausted
  // retry cannot fail the job or regain gate authority.
  const retries = step?.with?.retries;
  return typeof retries === 'number' && Number.isInteger(retries) && retries > 0;
}

function reportingPublishers(job: WorkflowJob | undefined): WorkflowStep[] {
  return (job?.steps ?? []).filter(isReportingPublisher);
}

function normalizeShellContinuations(script: string, dialect: ShellDialect): string {
  const continuation =
    dialect === 'posix'
      ? /\\\r?\n/g
      : dialect === 'powershell'
        ? /`\r?\n/g
        : dialect === 'cmd'
          ? /\^\r?\n/g
          : /[\\`^]\r?\n/g;
  return script.replace(continuation, ' ');
}

function stripShellComments(script: string, dialect: ShellDialect = 'portable'): string {
  return script
    .split(/\r?\n/)
    .map((line) => {
      if (dialect === 'cmd' && /^\s*(?:::|rem(?:\s|$))/i.test(line)) return '';
      let quote: '"' | "'" | undefined;
      let escaped = false;

      for (let index = 0; index < line.length; index += 1) {
        const character = line[index];
        if (escaped) {
          escaped = false;
          continue;
        }
        const escapeCharacter =
          (dialect === 'posix' && character === '\\') ||
          (dialect === 'powershell' && character === '`') ||
          (dialect === 'cmd' && character === '^') ||
          (dialect === 'portable' && ['\\', '`', '^'].includes(character));
        const literalEscape =
          ((dialect === 'posix' || dialect === 'powershell') && quote === "'") ||
          (dialect === 'cmd' && quote === '"');
        if (escapeCharacter && !literalEscape) {
          escaped = true;
          continue;
        }
        if (quote) {
          if (character === quote) quote = undefined;
          continue;
        }
        if (character === '"' || (character === "'" && dialect !== 'cmd')) {
          quote = character;
          continue;
        }
        if (
          dialect !== 'cmd' &&
          character === '#' &&
          (index === 0 || /\s/.test(line[index - 1] ?? ''))
        ) {
          return line.slice(0, index);
        }
      }

      return line;
    })
    .join('\n');
}

function unquoteShellToken(token: string, dialect: ShellDialect = 'portable'): string {
  const first = token.at(0);
  const last = token.at(-1);
  if (first === last && (first === '"' || (first === "'" && dialect !== 'cmd'))) {
    return token.slice(1, -1);
  }
  return dialect === 'cmd' ? token.replace(/^'+|'+$/g, '') : token;
}

function shellCommandTokens(script: string, dialect: ShellDialect = 'portable'): string[][] {
  return shellCommandStrings(script, dialect).map((command) =>
    tokenizeShellCommand(command, dialect)
  );
}

function shellCommandStrings(script: string, dialect: ShellDialect = 'portable'): string[] {
  const commands = splitShellCommands(
    stripShellComments(normalizeShellContinuations(script, dialect), dialect),
    dialect
  );
  const assignments = new Map<string, string>();
  return commands.map((command) => {
    const assignment = staticShellAssignment(command, dialect);
    if (assignment) {
      const key = dialect === 'posix' ? assignment.name : assignment.name.toLowerCase();
      if (assignment.value === undefined) assignments.delete(key);
      else assignments.set(key, assignment.value);
      return command;
    }
    return resolveShellVariables(command, dialect, assignments);
  });
}

function tokenizeShellCommand(command: string, dialect: ShellDialect): string[] {
  const tokenPattern = dialect === 'cmd' ? /"[^"]*"|[^\s]+/g : /"[^"]*"|'[^']*'|[^\s]+/g;
  return command.match(tokenPattern)?.map((token) => unquoteShellToken(token, dialect)) ?? [];
}

type StaticShellAssignment = {
  name: string;
  value?: string;
};

function staticShellAssignment(
  command: string,
  dialect: ShellDialect
): StaticShellAssignment | undefined {
  const trimmed = command.trim();
  if (dialect === 'posix') {
    const name = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/)?.[1];
    if (!name) return undefined;
    const literal = trimmed.match(
      /^(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*\s*=\s*(?:"([^"]*)"|'([^']*)'|([A-Za-z0-9_./:@%+-]+))\s*$/
    );
    return { name, value: literal?.[1] ?? literal?.[2] ?? literal?.[3] };
  }
  if (dialect === 'powershell') {
    const name = trimmed.match(/^\$([A-Za-z_][A-Za-z0-9_]*)\s*=/)?.[1];
    if (!name) return undefined;
    const literal = trimmed.match(/^\$[A-Za-z_][A-Za-z0-9_]*\s*=\s*(?:"([^"$`]*)"|'([^']*)')\s*$/);
    return { name, value: literal?.[1] ?? literal?.[2] };
  }
  if (dialect === 'cmd') {
    const match = trimmed.match(
      /^set\s+(?:"([A-Za-z_][A-Za-z0-9_]*)=([^"]*)"|([A-Za-z_][A-Za-z0-9_]*)=(.*))$/i
    );
    if (!match) return undefined;
    return { name: match[1] ?? match[3] ?? '', value: (match[2] ?? match[4] ?? '').trim() };
  }
  return undefined;
}

function resolveShellVariables(
  command: string,
  dialect: ShellDialect,
  assignments: Map<string, string>
): string {
  if (dialect === 'cmd') {
    return command.replace(
      /%([A-Za-z_][A-Za-z0-9_]*)%/g,
      (reference, name: string, offset: number) => {
        const value = assignments.get(name.toLowerCase());
        if (value === undefined) return reference;
        const quoted = command[offset - 1] === '"' && command[offset + reference.length] === '"';
        return !quoted && /\s/.test(value) ? `"${value}"` : value;
      }
    );
  }

  let resolved = '';
  let quote: '"' | "'" | undefined;
  for (let index = 0; index < command.length; index += 1) {
    const character = command[index] ?? '';
    if (character === '"' || character === "'") {
      if (!quote) quote = character;
      else if (quote === character) quote = undefined;
      resolved += character;
      continue;
    }
    if (character !== '$' || quote === "'") {
      resolved += character;
      continue;
    }

    const remainder = command.slice(index);
    const variableMatch =
      remainder.match(/^\$\{([A-Za-z_][A-Za-z0-9_]*)\}/) ??
      remainder.match(/^\$([A-Za-z_][A-Za-z0-9_]*)/);
    const variable = variableMatch?.[1];
    if (!variable) {
      resolved += character;
      continue;
    }
    const key = dialect === 'posix' ? variable : variable.toLowerCase();
    const value = assignments.get(key);
    if (value === undefined) {
      resolved += variableMatch[0];
    } else {
      resolved += !quote && dialect === 'powershell' && /\s/.test(value) ? `"${value}"` : value;
    }
    index += variableMatch[0].length - 1;
  }
  return resolved;
}

function splitShellCommands(script: string, dialect: ShellDialect): string[] {
  const commands: string[] = [];
  let command = '';
  let quote: '"' | "'" | undefined;
  let escaped = false;

  const finishCommand = (): void => {
    commands.push(command);
    command = '';
  };

  for (let index = 0; index < script.length; index += 1) {
    const character = script[index] ?? '';
    if (escaped) {
      command += character;
      escaped = false;
      continue;
    }
    const escapeCharacter =
      (dialect === 'posix' && character === '\\') ||
      (dialect === 'powershell' && character === '`') ||
      (dialect === 'cmd' && character === '^') ||
      (dialect === 'portable' && ['\\', '`', '^'].includes(character));
    const literalEscape =
      ((dialect === 'posix' || dialect === 'powershell') && quote === "'") ||
      (dialect === 'cmd' && quote === '"');
    if (escapeCharacter && !literalEscape) {
      command += character;
      escaped = true;
      continue;
    }
    if (quote) {
      command += character;
      if (character === quote) quote = undefined;
      continue;
    }
    if (character === '"' || (character === "'" && dialect !== 'cmd')) {
      command += character;
      quote = character;
      continue;
    }

    if (
      character === '\n' ||
      character === '\r' ||
      (character === ';' && dialect !== 'cmd') ||
      character === '|'
    ) {
      finishCommand();
      if (character === '|' && script[index + 1] === '|') index += 1;
      continue;
    }
    if (character === '&') {
      const callOperator =
        command.trim().length === 0 && (dialect === 'powershell' || dialect === 'portable');
      if (callOperator) {
        command += character;
      } else {
        finishCommand();
      }
      if (script[index + 1] === '&') index += 1;
      continue;
    }
    command += character;
  }

  finishCommand();
  return commands;
}

function isCommandPrefix(tokens: string[]): boolean {
  return tokens.every(
    (token) =>
      ['if', '!', 'command', 'sudo', 'env', '&', 'call', 'cmd', '/c', 'corepack'].includes(
        token.toLowerCase()
      ) || /^[A-Za-z_][A-Za-z0-9_]*=/.test(token)
  );
}

function isVercelToken(token: string): boolean {
  return /(?:^|\/)(?:vercel|vc)(?:\.cmd)?(?:@[^\s/]+)?$/.test(token.replace(/^@/, ''));
}

function vercelCommandTokens(script: string, dialect: ShellDialect = 'portable'): string[][] {
  return shellCommandTokens(script, dialect).filter((tokens) => {
    const vercelIndex = tokens.findIndex(isVercelToken);
    if (vercelIndex === -1) return false;

    const first = tokens[0]?.toLowerCase();
    if (first === 'echo' || first === 'printf' || first === 'write-host') return false;
    if (tokens[vercelIndex - 1] === '&' || tokens[vercelIndex - 1] === '=') return true;

    const prefix = tokens.slice(0, vercelIndex);
    if (isCommandPrefix(prefix)) return true;

    return prefix.some((token, launcherIndex) => {
      const launcher = token
        .replace(/^@/, '')
        .replace(/\.cmd$/i, '')
        .toLowerCase();
      if (!isCommandPrefix(prefix.slice(0, launcherIndex))) return false;
      if (launcher === 'npx' || launcher === 'bunx' || launcher === 'pnpx') return true;

      const launcherArguments = prefix
        .slice(launcherIndex + 1)
        .map((argument) => argument.toLowerCase());
      if (launcher === 'npm') {
        return launcherArguments.includes('exec') || launcherArguments.includes('x');
      }
      if (launcher === 'pnpm' || launcher === 'yarn') {
        return launcherArguments.includes('dlx') || launcherArguments.includes('exec');
      }
      if (launcher === 'bun') return launcherArguments.includes('x');
      return false;
    });
  });
}

function possibleVercelCommandTokens(
  script: string,
  dialect: ShellDialect = 'portable'
): string[][] {
  return vercelCommandTokens(script.replaceAll(DYNAMIC_SHELL_ARGUMENT, 'env'), dialect);
}

const VERCEL_OPTIONS_WITH_VALUES = new Set([
  '--archive',
  '--build-env',
  '--cwd',
  '--env',
  '--global-config',
  '--local-config',
  '--meta',
  '--name',
  '--regions',
  '--scope',
  '--target',
  '--timeout',
  '--token',
  '-a',
  '-q',
  '-s',
  '-t',
]);

type PositionalVercelArgument = {
  index: number;
  token: string;
};

function positionalVercelArguments(argumentsAfterVercel: string[]): PositionalVercelArgument[] {
  const positional: PositionalVercelArgument[] = [];
  for (let index = 0; index < argumentsAfterVercel.length; index += 1) {
    const token = normalizeCliArgument(argumentsAfterVercel[index] ?? '');
    if (token === '--') continue;
    if (token.startsWith('-')) {
      if (!token.includes('=') && VERCEL_OPTIONS_WITH_VALUES.has(token)) index += 1;
      continue;
    }
    positional.push({ index, token });
  }
  return positional;
}

function normalizeCliArgument(token: string): string {
  return token.toLowerCase().replace(/=(['"])(.*?)\1$/, '=$2');
}

function productionTargetIndex(argumentsAfterVercel: string[]): number {
  return argumentsAfterVercel.findIndex((rawToken, index) => {
    const token = normalizeCliArgument(rawToken);
    const nextToken = normalizeCliArgument(argumentsAfterVercel[index + 1] ?? '');
    return (
      token === '--prod' ||
      token.startsWith('--prod=') ||
      token === '--target=production' ||
      (token === '--target' && nextToken === 'production')
    );
  });
}

function containsDirectProductionVercelCommand(
  script: string,
  dialect: ShellDialect = 'portable'
): boolean {
  return vercelCommandTokens(script, dialect).some((tokens) => {
    const vercelIndex = tokens.findIndex(isVercelToken);
    const argumentsAfterVercel = tokens
      .slice(vercelIndex + 1)
      .filter((token) => token !== DYNAMIC_ATOMIC_ARGUMENT);
    const normalizedArguments = argumentsAfterVercel.map((token) => token.toLowerCase());
    const positionalArguments = positionalVercelArguments(normalizedArguments);
    const subcommand = positionalArguments[0]?.token;
    const subcommandIndex = positionalArguments[0]?.index ?? Number.POSITIVE_INFINITY;

    if (subcommand === 'promote') return true;
    if (subcommand === 'alias') {
      return !['list', 'ls'].includes(positionalArguments[1]?.token ?? '');
    }
    if (subcommand === 'rollback') {
      return positionalArguments[1]?.token !== 'status';
    }

    if (subcommand === 'rolling-release' || subcommand === 'rr') {
      const rollingReleaseAction = positionalArguments[1]?.token;
      if (rollingReleaseAction === 'fetch' && positionalArguments.length === 2) {
        return false;
      }
      return true;
    }

    const targetIndex = productionTargetIndex(normalizedArguments);
    if (targetIndex === -1) return false;

    if (subcommand === 'ls' || subcommand === 'list') {
      return targetIndex < subcommandIndex;
    }
    return true;
  });
}

function containsDynamicAtomicProductionCommand(script: string, dialect: ShellDialect): boolean {
  return shellCommandTokens(script, dialect).some((tokens) => {
    if (!tokens.includes(DYNAMIC_ATOMIC_ARGUMENT)) return false;
    const possibleCommand = tokens
      .map((token) => (token === DYNAMIC_ATOMIC_ARGUMENT ? 'env' : token))
      .join(' ');
    if (vercelCommandTokens(possibleCommand, dialect).length === 0) return false;

    const vercelIndex = tokens.findIndex(isVercelToken);
    const dynamicIndex = tokens.indexOf(DYNAMIC_ATOMIC_ARGUMENT);
    if (dynamicIndex < vercelIndex) return true;

    const positional = positionalVercelArguments(tokens.slice(vercelIndex + 1));
    const subcommand = positional[0]?.token;
    if (!subcommand || subcommand === DYNAMIC_ATOMIC_ARGUMENT.toLowerCase()) return true;
    if (subcommand === 'ls' || subcommand === 'list') return false;
    if (subcommand === 'alias') {
      return !['list', 'ls'].includes(positional[1]?.token ?? '');
    }
    if (subcommand === 'rollback') return positional[1]?.token !== 'status';
    if (subcommand === 'rolling-release' || subcommand === 'rr') {
      return positional[1]?.token !== 'fetch';
    }
    return true;
  });
}

type NestedShellCommand = {
  dialect: ShellDialect;
  text: string;
};

function nestedShellCommandStrings(script: string, dialect: ShellDialect): NestedShellCommand[] {
  const nested: NestedShellCommand[] = [];

  for (const command of shellCommandStrings(script, dialect)) {
    const tokens = tokenizeShellCommand(command, dialect);
    const first = tokens[0]?.replace(/^@/, '').toLowerCase();
    if (first === 'echo' || first === 'printf' || first === 'write-host') continue;

    const shellIndex = tokens.findIndex((token) => /(?:^|\/)(?:ba|z)?sh(?:\.exe)?$/i.test(token));
    if (shellIndex !== -1 && isCommandPrefix(tokens.slice(0, shellIndex))) {
      const flagIndex = tokens.findIndex(
        (token, index) => index > shellIndex && /^-[a-z]*c[a-z]*$/i.test(token)
      );
      if (flagIndex !== -1 && tokens[flagIndex + 1]) {
        nested.push({
          dialect: 'posix',
          text: tokens[flagIndex + 1],
        });
      }
    }

    const cmdIndex = tokens.findIndex((token) => /(?:^|\/)cmd(?:\.exe)?$/i.test(token));
    if (cmdIndex !== -1 && isCommandPrefix(tokens.slice(0, cmdIndex))) {
      const flagIndex = tokens.findIndex(
        (token, index) => index > cmdIndex && token.toLowerCase() === '/c'
      );
      if (flagIndex !== -1 && tokens[flagIndex + 1]) {
        nested.push({
          dialect: 'cmd',
          text: tokens[flagIndex + 1],
        });
      }
    }

    const powerShellIndex = tokens.findIndex((token) =>
      /(?:^|\/)(?:pwsh|powershell)(?:\.exe)?$/i.test(token)
    );
    if (powerShellIndex !== -1 && isCommandPrefix(tokens.slice(0, powerShellIndex))) {
      const flagIndex = tokens.findIndex(
        (token, index) =>
          index > powerShellIndex && ['-command', '-c'].includes(token.toLowerCase())
      );
      if (flagIndex !== -1 && tokens[flagIndex + 1]) {
        nested.push({
          dialect: 'powershell',
          text: tokens[flagIndex + 1],
        });
      }
    }

    const expressionIndex = tokens.findIndex((token) => /^(?:invoke-expression|iex)$/i.test(token));
    if (
      expressionIndex !== -1 &&
      isCommandPrefix(tokens.slice(0, expressionIndex)) &&
      tokens[expressionIndex + 1]
    ) {
      nested.push({
        dialect: 'powershell',
        text: tokens[expressionIndex + 1],
      });
    }

    const processIndex = tokens.findIndex((token) => /^start-process$/i.test(token));
    if (processIndex !== -1 && isCommandPrefix(tokens.slice(0, processIndex))) {
      const filePathIndex = tokens.findIndex(
        (token, index) => index > processIndex && token.toLowerCase() === '-filepath'
      );
      const executable =
        filePathIndex === -1 ? tokens[processIndex + 1] : tokens[filePathIndex + 1];
      const argumentListIndex = tokens.findIndex(
        (token, index) => index > processIndex && token.toLowerCase() === '-argumentlist'
      );
      if (executable && argumentListIndex !== -1) {
        const argumentListMatch = /\s-ArgumentList\s+/i.exec(command);
        const rawArguments = argumentListMatch
          ? command.slice((argumentListMatch.index ?? 0) + argumentListMatch[0].length).trim()
          : '';
        const arrayOpenIndex = rawArguments.match(/^@?\s*\(/)?.[0].lastIndexOf('(') ?? -1;
        const arrayContent =
          arrayOpenIndex === -1
            ? undefined
            : balancedContent(rawArguments, arrayOpenIndex, '(', ')');
        const scalarArgument = rawArguments.match(/^"([^"]*)"|'([^']*)'|([^\s]+)/);
        const argumentsList =
          arrayContent !== undefined
            ? splitTopLevelArguments(arrayContent).map((argument) => {
                const literal = argument.trim().match(/^(['"])(.*?)\1$/);
                return literal?.[2] ?? DYNAMIC_ATOMIC_ARGUMENT;
              })
            : [scalarArgument?.[1] ?? scalarArgument?.[2] ?? scalarArgument?.[3] ?? ''].filter(
                Boolean
              );
        nested.push({ dialect: 'powershell', text: [executable, ...argumentsList].join(' ') });
      }
    }
  }

  return nested;
}

function containsProductionVercelCommand(
  script: string,
  dialect: ShellDialect = 'portable',
  depth = 0
): boolean {
  if (dialect === 'portable') {
    return (['posix', 'powershell', 'cmd'] as const).some((candidate) =>
      containsProductionVercelCommand(script, candidate, depth)
    );
  }
  if (containsDirectProductionVercelCommand(script, dialect)) return true;
  if (
    script.includes(DYNAMIC_SHELL_ARGUMENT) &&
    possibleVercelCommandTokens(script, dialect).length > 0
  ) {
    return true;
  }
  if (containsDynamicAtomicProductionCommand(script, dialect)) return true;
  if (depth >= 4) return false;
  return nestedShellCommandStrings(script, dialect).some((nested) =>
    containsProductionVercelCommand(nested.text, nested.dialect, depth + 1)
  );
}

type JavaScriptAnalysisContext = {
  checker: ts.TypeChecker;
  sourceFile: ts.SourceFile;
};

function createJavaScriptAnalysisContext(source: string): JavaScriptAnalysisContext {
  const fileName = 'automation.ts';
  const compilerOptions: ts.CompilerOptions = {
    noLib: true,
    noResolve: true,
    target: ts.ScriptTarget.Latest,
  };
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  const baseHost = ts.createCompilerHost(compilerOptions, true);
  const host: ts.CompilerHost = {
    ...baseHost,
    fileExists: (name) => name === fileName,
    readFile: (name) => (name === fileName ? source : undefined),
    getSourceFile: (name) => (name === fileName ? sourceFile : undefined),
    writeFile: () => undefined,
    getDefaultLibFileName: () => '',
    getCurrentDirectory: () => '',
    getDirectories: () => [],
    getCanonicalFileName: (name) => name,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => '\n',
  };
  const program = ts.createProgram([fileName], compilerOptions, host);
  return { checker: program.getTypeChecker(), sourceFile };
}

function symbolDeclaration(
  identifier: ts.Identifier,
  context: JavaScriptAnalysisContext
): ts.Declaration | undefined {
  const declarations = context.checker.getSymbolAtLocation(identifier)?.declarations ?? [];
  return declarations.length === 1 ? declarations[0] : undefined;
}

function isConstDeclaration(declaration: ts.VariableDeclaration): boolean {
  return (ts.getCombinedNodeFlags(declaration.parent) & ts.NodeFlags.Const) !== 0;
}

function staticCommandText(
  node: ts.Expression | undefined,
  context: JavaScriptAnalysisContext,
  resolving = new Set<ts.Declaration>()
): string | undefined {
  if (!node) return undefined;
  if (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isTypeAssertionExpression(node)
  ) {
    return staticCommandText(node.expression, context, resolving);
  }
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  if (ts.isIdentifier(node)) {
    const binding = symbolDeclaration(node, context);
    if (
      !binding ||
      !ts.isVariableDeclaration(binding) ||
      !isConstDeclaration(binding) ||
      !binding.initializer ||
      resolving.has(binding)
    ) {
      return undefined;
    }
    const nextResolving = new Set(resolving);
    nextResolving.add(binding);
    return staticCommandText(binding.initializer, context, nextResolving);
  }
  if (ts.isTemplateExpression(node)) {
    return [
      node.head.text,
      ...node.templateSpans.flatMap((span) => [
        staticCommandText(span.expression, context, resolving) ?? ` ${DYNAMIC_SHELL_ARGUMENT} `,
        span.literal.text,
      ]),
    ].join('');
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    return `${staticCommandText(node.left, context, resolving) ?? ` ${DYNAMIC_SHELL_ARGUMENT} `}${
      staticCommandText(node.right, context, resolving) ?? ` ${DYNAMIC_SHELL_ARGUMENT} `
    }`;
  }
  return undefined;
}

type StaticArray = {
  argumentsList: string[];
  unresolved: boolean;
};

function staticCommandArray(
  node: ts.Expression | undefined,
  context: JavaScriptAnalysisContext,
  resolving = new Set<ts.Declaration>()
): StaticArray | undefined {
  if (!node) return undefined;
  if (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isTypeAssertionExpression(node)
  ) {
    return staticCommandArray(node.expression, context, resolving);
  }
  if (ts.isIdentifier(node)) {
    const binding = symbolDeclaration(node, context);
    if (
      !binding ||
      !ts.isVariableDeclaration(binding) ||
      !isConstDeclaration(binding) ||
      !binding.initializer ||
      resolving.has(binding)
    ) {
      return undefined;
    }
    const nextResolving = new Set(resolving);
    nextResolving.add(binding);
    return staticCommandArray(binding.initializer, context, nextResolving);
  }
  if (!ts.isArrayLiteralExpression(node)) return undefined;

  let unresolved = false;
  const argumentsList: string[] = [];
  for (const element of node.elements) {
    if (ts.isSpreadElement(element)) {
      const spreadArray = staticCommandArray(element.expression, context, resolving);
      if (spreadArray) {
        argumentsList.push(...spreadArray.argumentsList);
        unresolved ||= spreadArray.unresolved;
        continue;
      }
      unresolved = true;
      argumentsList.push(DYNAMIC_ATOMIC_ARGUMENT);
      continue;
    }
    const value = staticCommandText(element, context, resolving);
    if (value === undefined || value.includes(DYNAMIC_SHELL_ARGUMENT)) {
      unresolved = true;
      argumentsList.push(DYNAMIC_ATOMIC_ARGUMENT);
      continue;
    }
    argumentsList.push(value);
  }
  return { argumentsList, unresolved };
}

type ProcessModule = 'child_process' | 'execa';
type ProcessProvenance = {
  importedName?: string;
  module: ProcessModule;
  namespace: boolean;
};

function processModuleName(moduleName: string): ProcessModule | undefined {
  if (moduleName === 'child_process' || moduleName === 'node:child_process') {
    return 'child_process';
  }
  return moduleName === 'execa' ? 'execa' : undefined;
}

function importModuleName(
  binding: ts.ImportClause | ts.ImportSpecifier | ts.NamespaceImport
): string | undefined {
  let ancestor: ts.Node | undefined = binding.parent;
  while (ancestor && !ts.isImportDeclaration(ancestor)) ancestor = ancestor.parent;
  return ancestor && ts.isStringLiteral(ancestor.moduleSpecifier)
    ? ancestor.moduleSpecifier.text
    : undefined;
}

function requireModuleName(node: ts.Expression | undefined): string | undefined {
  if (
    !node ||
    !ts.isCallExpression(node) ||
    !ts.isIdentifier(node.expression) ||
    node.expression.text !== 'require'
  ) {
    return undefined;
  }
  const moduleArgument = node.arguments[0];
  return moduleArgument && ts.isStringLiteral(moduleArgument) ? moduleArgument.text : undefined;
}

function containingVariableDeclaration(
  binding: ts.BindingElement
): ts.VariableDeclaration | undefined {
  const bindingPattern = binding.parent;
  return ts.isObjectBindingPattern(bindingPattern) &&
    ts.isVariableDeclaration(bindingPattern.parent)
    ? bindingPattern.parent
    : undefined;
}

function staticPropertyName(
  expression: ts.PropertyAccessExpression | ts.ElementAccessExpression,
  context: JavaScriptAnalysisContext
): string | undefined {
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  const argument = expression.argumentExpression;
  return staticCommandText(argument, context);
}

function processNamespace(
  expression: ts.Expression,
  context: JavaScriptAnalysisContext,
  resolving = new Set<ts.Declaration>()
): ProcessProvenance | undefined {
  if (ts.isIdentifier(expression)) {
    const binding = symbolDeclaration(expression, context);
    const provenance = binding ? processProvenance(binding, context, resolving) : undefined;
    return provenance?.namespace ? provenance : undefined;
  }
  const module = processModuleName(requireModuleName(expression) ?? '');
  return module ? { module, namespace: true } : undefined;
}

function processProvenance(
  binding: ts.Declaration,
  context: JavaScriptAnalysisContext,
  resolving = new Set<ts.Declaration>()
): ProcessProvenance | undefined {
  if (resolving.has(binding)) return undefined;
  const nextResolving = new Set(resolving);
  nextResolving.add(binding);

  if (ts.isImportSpecifier(binding)) {
    const module = processModuleName(importModuleName(binding) ?? '');
    if (!module) return undefined;
    return {
      importedName: binding.propertyName?.text ?? binding.name.text,
      module,
      namespace: false,
    };
  }
  if (ts.isNamespaceImport(binding)) {
    const module = processModuleName(importModuleName(binding) ?? '');
    return module ? { module, namespace: true } : undefined;
  }
  if (ts.isImportClause(binding)) {
    const module = processModuleName(importModuleName(binding) ?? '');
    return module === 'execa' ? { importedName: 'execa', module, namespace: false } : undefined;
  }
  if (ts.isBindingElement(binding)) {
    const declaration = containingVariableDeclaration(binding);
    const directModule = processModuleName(requireModuleName(declaration?.initializer) ?? '');
    const namespace =
      declaration?.initializer && !directModule
        ? processNamespace(declaration.initializer, context, nextResolving)
        : undefined;
    const module = directModule ?? namespace?.module;
    if (!module) return undefined;
    const importedName =
      binding.propertyName && ts.isIdentifier(binding.propertyName)
        ? binding.propertyName.text
        : ts.isIdentifier(binding.name)
          ? binding.name.text
          : undefined;
    if (!importedName) return undefined;
    return { importedName, module, namespace: false };
  }
  if (!ts.isVariableDeclaration(binding) || !binding.initializer) return undefined;

  const requiredModule = processModuleName(requireModuleName(binding.initializer) ?? '');
  if (requiredModule) {
    return {
      importedName: requiredModule === 'execa' ? 'execa' : undefined,
      module: requiredModule,
      namespace: true,
    };
  }
  if (ts.isIdentifier(binding.initializer)) {
    const sourceBinding = symbolDeclaration(binding.initializer, context);
    return sourceBinding ? processProvenance(sourceBinding, context, nextResolving) : undefined;
  }
  if (
    ts.isPropertyAccessExpression(binding.initializer) ||
    ts.isElementAccessExpression(binding.initializer)
  ) {
    const namespace = processNamespace(binding.initializer.expression, context, nextResolving);
    const importedName = staticPropertyName(binding.initializer, context);
    if (namespace && importedName) {
      return { importedName, module: namespace.module, namespace: false };
    }
  }
  return undefined;
}

type ProcessCallKind = 'argv' | 'command';

function processCallKind(
  expression: ts.LeftHandSideExpression,
  context: JavaScriptAnalysisContext
): ProcessCallKind | undefined {
  let provenance: ProcessProvenance | undefined;
  let importedName: string | undefined;

  if (ts.isIdentifier(expression)) {
    const binding = symbolDeclaration(expression, context);
    provenance = binding ? processProvenance(binding, context) : undefined;
    importedName = provenance?.importedName;
  } else if (
    ts.isPropertyAccessExpression(expression) ||
    ts.isElementAccessExpression(expression)
  ) {
    provenance = processNamespace(expression.expression, context);
    if (provenance?.namespace) importedName = staticPropertyName(expression, context);
  }
  if (!provenance || !importedName) return undefined;

  if (provenance.module === 'child_process') {
    if (['exec', 'execSync'].includes(importedName)) return 'command';
    if (['spawn', 'spawnSync', 'execFile', 'execFileSync'].includes(importedName)) return 'argv';
  }
  if (provenance.module === 'execa') {
    if (['execaCommand', 'execaCommandSync'].includes(importedName)) return 'command';
    if (['execa', 'execaSync'].includes(importedName)) return 'argv';
  }
  return undefined;
}

type ChildProcessInspection = {
  commands: string[];
  unresolvedVercelCommand: boolean;
  unresolvedVercelArguments: boolean;
};

function childProcessInspection(source: string): ChildProcessInspection {
  const context = createJavaScriptAnalysisContext(source);
  const { sourceFile } = context;
  const commands: string[] = [];
  let unresolvedVercelCommand = false;
  let unresolvedVercelArguments = false;

  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node)) {
      const callKind = processCallKind(node.expression, context);
      if (callKind === 'command') {
        const commandNode = node.arguments[0];
        const command = staticCommandText(commandNode, context);
        if (command !== undefined) {
          commands.push(command);
          if (
            command.includes(DYNAMIC_SHELL_ARGUMENT) &&
            possibleVercelCommandTokens(command).length > 0
          ) {
            unresolvedVercelCommand = true;
          }
        }
      }

      if (callKind === 'argv') {
        const executable = staticCommandText(node.arguments[0], context);
        const argumentNode = node.arguments[1];
        const staticArguments = staticCommandArray(argumentNode, context);
        if (executable && staticArguments) {
          const command = [executable, ...staticArguments.argumentsList].join(' ');
          commands.push(command);
          if (
            staticArguments.unresolved &&
            containsDynamicAtomicProductionCommand(command, 'portable')
          ) {
            unresolvedVercelArguments = true;
          }
        } else if (executable && argumentNode && vercelCommandTokens(executable).length > 0) {
          unresolvedVercelArguments = true;
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return { commands, unresolvedVercelArguments, unresolvedVercelCommand };
}

const BRANCH_POLICY_ENDPOINT =
  /(?:^|\/)branches\/[^/\s]+\/protection(?:[/?#]|$)|(?:^|\/)rulesets?(?:[/?#]|$)/i;
const BRANCH_PROTECTION_GRAPHQL_MUTATION = /\b(?:create|update|delete)BranchProtectionRule\b/;
const OCTOKIT_MODULES = new Set([
  '@actions/github',
  '@octokit/core',
  '@octokit/graphql',
  '@octokit/rest',
]);

function isBranchPolicyEndpoint(value: string): boolean {
  return BRANCH_POLICY_ENDPOINT.test(value);
}

function isGhCommand(tokens: string[], ghIndex: number): boolean {
  return (
    ghIndex >= 0 &&
    /(?:^|[/\\])gh(?:\.exe)?$/i.test(tokens[ghIndex] ?? '') &&
    isCommandPrefix(tokens.slice(0, ghIndex))
  );
}

type GhApiMethod = {
  specified: boolean;
  value?: string;
};

function ghApiMethod(argumentsList: string[]): GhApiMethod {
  let specified = false;
  let value: string | undefined;
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index] ?? '';
    if (argument === '--method' || argument === '-X') {
      specified = true;
      value = argumentsList[index + 1];
      index += 1;
      continue;
    }
    const assignedMethod = argument.match(/^(?:--method|-X)=(.+)$/i);
    if (assignedMethod) {
      specified = true;
      value = assignedMethod[1];
      continue;
    }
    const compactMethod = argument.match(/^-X(.+)$/i);
    if (compactMethod) {
      specified = true;
      value = compactMethod[1];
    }
  }
  return { specified, value };
}

function ghApiHasPayload(argumentsList: string[]): boolean {
  return argumentsList.some((argument) =>
    /^(?:--(?:input|field|raw-field)|-[fF])(?:=|$|[^\s])/.test(argument)
  );
}

function shellHasBranchPolicyMutation(script: string, dialect: ShellDialect, depth = 0): boolean {
  if (dialect === 'portable') {
    return (['posix', 'powershell', 'cmd'] as const).some((candidate) =>
      shellHasBranchPolicyMutation(script, candidate, depth)
    );
  }

  for (const command of shellCommandStrings(script, dialect)) {
    const tokens = tokenizeShellCommand(command, dialect);
    const first = tokens[0]?.replace(/^@/, '').toLowerCase();
    if (first === 'echo' || first === 'printf' || first === 'write-host') continue;

    const ghIndex = tokens.findIndex((token) => /(?:^|[/\\])gh(?:\.exe)?$/i.test(token));
    if (isGhCommand(tokens, ghIndex) && tokens[ghIndex + 1]?.toLowerCase() === 'api') {
      const apiArguments = tokens.slice(ghIndex + 2);
      const isGraphqlMutation =
        apiArguments.some((argument) => argument.toLowerCase() === 'graphql') &&
        tokens.some((token) => BRANCH_PROTECTION_GRAPHQL_MUTATION.test(token));
      if (isGraphqlMutation) return true;

      if (apiArguments.some(isBranchPolicyEndpoint)) {
        if (ghApiHasPayload(apiArguments)) return true;
        const method = ghApiMethod(apiArguments);
        if (method.specified && (!method.value || !/^(?:GET|HEAD)$/i.test(method.value))) {
          return true;
        }
      }
    }

    if (
      depth < 4 &&
      nestedShellCommandStrings(command, dialect).some((nested) =>
        shellHasBranchPolicyMutation(nested.text, nested.dialect, depth + 1)
      )
    ) {
      return true;
    }
  }
  return false;
}

function isGitHubBranchPolicyApiUrl(value: string): boolean {
  return /^https:\/\/api\.github\.com(?:\/|$)/i.test(value) && isBranchPolicyEndpoint(value);
}

function curlRequestMethod(argumentsList: string[]): GhApiMethod {
  let specified = false;
  let value: string | undefined;
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index] ?? '';
    if (argument === '--request' || argument === '-X') {
      specified = true;
      value = argumentsList[index + 1];
      index += 1;
      continue;
    }
    const assignedMethod = argument.match(/^(?:--request|-X)=(.+)$/i);
    if (assignedMethod) {
      specified = true;
      value = assignedMethod[1];
      continue;
    }
    const compactMethod = argument.match(/^-X(.+)$/i);
    if (compactMethod) {
      specified = true;
      value = compactMethod[1];
    }
  }
  return { specified, value };
}

function curlHasPayload(argumentsList: string[]): boolean {
  return argumentsList.some((argument) =>
    /^(?:--data(?:-raw|-binary|-urlencode)?|-d|--form|-F|--json|-T|--upload-file)(?:=|$|[^\s])/.test(
      argument
    )
  );
}

function shellHasGitHubBranchPolicyRestMutation(
  script: string,
  dialect: ShellDialect,
  depth = 0
): boolean {
  if (dialect === 'portable') {
    return (['posix', 'powershell', 'cmd'] as const).some((candidate) =>
      shellHasGitHubBranchPolicyRestMutation(script, candidate, depth)
    );
  }

  for (const command of shellCommandStrings(script, dialect)) {
    const tokens = tokenizeShellCommand(command, dialect);
    const first = tokens[0]?.replace(/^@/, '').toLowerCase();
    if (first === 'echo' || first === 'printf' || first === 'write-host') continue;

    const curlIndex = tokens.findIndex((token) => /(?:^|[/\\])curl(?:\.exe)?$/i.test(token));
    if (curlIndex !== -1 && tokens.some(isGitHubBranchPolicyApiUrl)) {
      const argumentsList = tokens.slice(curlIndex + 1);
      const method = curlRequestMethod(argumentsList);
      if (method.specified && (!method.value || !/^(?:GET|HEAD)$/i.test(method.value))) {
        return true;
      }
      if (curlHasPayload(argumentsList)) return true;
    }

    if (
      depth < 4 &&
      nestedShellCommandStrings(command, dialect).some((nested) =>
        shellHasGitHubBranchPolicyRestMutation(nested.text, nested.dialect, depth + 1)
      )
    ) {
      return true;
    }
  }
  return false;
}

function isOctokitExpression(
  expression: ts.Expression,
  context: JavaScriptAnalysisContext,
  resolving = new Set<ts.Declaration>(),
  allowGithubScriptGlobal = false
): boolean {
  if (ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression)) {
    return isOctokitExpression(expression.expression, context, resolving, allowGithubScriptGlobal);
  }
  if (ts.isCallExpression(expression) || ts.isNewExpression(expression)) {
    return isOctokitExpression(expression.expression, context, resolving, allowGithubScriptGlobal);
  }
  if (!ts.isIdentifier(expression)) return false;

  if (allowGithubScriptGlobal && expression.text === 'github') return true;
  if (OCTOKIT_MODULES.has(javaScriptBindingModule(expression, context) ?? '')) return true;
  const binding = symbolDeclaration(expression, context);
  if (
    !binding ||
    resolving.has(binding) ||
    !ts.isVariableDeclaration(binding) ||
    !binding.initializer
  ) {
    return false;
  }
  const nextResolving = new Set(resolving);
  nextResolving.add(binding);
  return isOctokitExpression(binding.initializer, context, nextResolving, allowGithubScriptGlobal);
}

function isOctokitGraphqlCall(
  call: ts.CallExpression,
  context: JavaScriptAnalysisContext,
  allowGithubScriptGlobal: boolean
): boolean {
  const expression = call.expression;
  if (ts.isIdentifier(expression)) {
    return (
      OCTOKIT_MODULES.has(javaScriptBindingModule(expression, context) ?? '') &&
      importedJavaScriptName(expression, context) === 'graphql'
    );
  }
  return (
    (ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression)) &&
    staticPropertyName(expression, context) === 'graphql' &&
    isOctokitExpression(expression.expression, context, new Set(), allowGithubScriptGlobal)
  );
}

function octokitCallHasBranchPolicyMutation(
  call: ts.CallExpression,
  context: JavaScriptAnalysisContext,
  allowGithubScriptGlobal: boolean
): boolean {
  const expression = call.expression;
  const method =
    ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression)
      ? staticPropertyName(expression, context)
      : undefined;
  const receiver =
    ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression)
      ? expression.expression
      : undefined;

  if (
    method === 'updateBranchProtection' &&
    receiver &&
    isOctokitExpression(receiver, context, new Set(), allowGithubScriptGlobal)
  ) {
    return true;
  }
  if (isOctokitGraphqlCall(call, context, allowGithubScriptGlobal)) {
    return call.arguments.some((argument) =>
      BRANCH_PROTECTION_GRAPHQL_MUTATION.test(staticCommandText(argument, context) ?? '')
    );
  }
  if (
    !method ||
    !receiver ||
    !isOctokitExpression(receiver, context, new Set(), allowGithubScriptGlobal)
  ) {
    return false;
  }
  if (/^(?:create|update|delete)(?:Repo|Org)?Ruleset$/.test(method)) return true;
  if (method !== 'request') return false;

  const route = staticCommandText(call.arguments[0], context);
  if (!route || !isBranchPolicyEndpoint(route)) return false;
  const methodMatch = route.match(/^\s*([A-Z]+)\s+/i);
  return !methodMatch || !/^(?:GET|HEAD)$/i.test(methodMatch[1] ?? '');
}

function javaScriptHasBranchPolicyMutation(
  source: string,
  allowGithubScriptGlobal = false
): boolean {
  if (
    childProcessInspection(source).commands.some((command) =>
      shellHasBranchPolicyMutation(command, 'portable')
    )
  ) {
    return true;
  }

  const context = createJavaScriptAnalysisContext(source);
  let mutation = false;
  function visit(node: ts.Node): void {
    if (
      !mutation &&
      ts.isCallExpression(node) &&
      octokitCallHasBranchPolicyMutation(node, context, allowGithubScriptGlobal)
    ) {
      mutation = true;
    }
    if (!mutation) ts.forEachChild(node, visit);
  }
  visit(context.sourceFile);
  return mutation;
}

function javaScriptExpressionHasGitHubBranchPolicyApi(
  expression: ts.Expression | undefined,
  context: JavaScriptAnalysisContext
): boolean {
  const resolved = resolvedJavaScriptExpression(expression, context);
  const staticText = staticCommandText(resolved, context);
  if (staticText && isGitHubBranchPolicyApiUrl(staticText)) return true;
  if (!resolved || !ts.isObjectLiteralExpression(resolved)) return false;
  const hostname = javaScriptObjectProperty(resolved, 'hostname', context).expression;
  const host = hostname ?? javaScriptObjectProperty(resolved, 'host', context).expression;
  const pathExpression = javaScriptObjectProperty(resolved, 'path', context).expression;
  const staticHost = staticCommandText(host, context);
  const staticPath = staticCommandText(pathExpression, context);
  if (
    staticHost?.toLowerCase() === 'api.github.com' &&
    staticPath !== undefined &&
    isBranchPolicyEndpoint(staticPath)
  ) {
    return true;
  }
  return resolved.properties.some((property) => {
    if (ts.isPropertyAssignment(property)) {
      return javaScriptExpressionHasGitHubBranchPolicyApi(property.initializer, context);
    }
    if (ts.isShorthandPropertyAssignment(property)) {
      return javaScriptExpressionHasGitHubBranchPolicyApi(property.name, context);
    }
    return ts.isSpreadAssignment(property)
      ? javaScriptExpressionHasGitHubBranchPolicyApi(property.expression, context)
      : false;
  });
}

function javaScriptTransportCallMutatesGitHubBranchPolicy(
  call: ts.CallExpression,
  context: JavaScriptAnalysisContext
): boolean {
  const transport = javaScriptTransportCall(call, context);
  if (
    !transport ||
    !call.arguments.some((argument) =>
      javaScriptExpressionHasGitHubBranchPolicyApi(argument, context)
    )
  ) {
    return false;
  }
  if (transport.methodName && ['get', 'head'].includes(transport.methodName)) return false;
  if (transport.methodName && ['post', 'put', 'patch', 'delete'].includes(transport.methodName)) {
    return true;
  }

  const firstArgument = resolvedJavaScriptExpression(call.arguments[0], context);
  const options =
    transport.optionsOnlyAtZero && firstArgument && ts.isObjectLiteralExpression(firstArgument)
      ? call.arguments[0]
      : call.arguments[transport.optionsIndex ?? -1];
  const methodProperty = javaScriptObjectProperty(options, 'method', context);
  if (methodProperty.expression) {
    const method = staticCommandText(methodProperty.expression, context);
    return methodProperty.dynamic || !method || !['GET', 'HEAD'].includes(method.toUpperCase());
  }
  if (methodProperty.dynamic) return true;
  return transport.defaultMethod !== 'GET';
}

function javaScriptHasGitHubBranchPolicyRestMutation(source: string): boolean {
  if (
    childProcessInspection(source).commands.some((command) =>
      shellHasGitHubBranchPolicyRestMutation(command, 'portable')
    )
  ) {
    return true;
  }

  const context = createJavaScriptAnalysisContext(source);
  let mutation = false;
  function visit(node: ts.Node): void {
    if (
      !mutation &&
      ts.isCallExpression(node) &&
      javaScriptTransportCallMutatesGitHubBranchPolicy(node, context)
    ) {
      mutation = true;
    }
    if (!mutation) ts.forEachChild(node, visit);
  }
  visit(context.sourceFile);
  return mutation;
}

function automationSurfaceHasBranchPolicyMutation(surface: AutomationSurface): boolean {
  if (surface.language === 'shell') {
    const dialect = surface.dialect ?? 'portable';
    return (
      shellHasBranchPolicyMutation(surface.content, dialect) ||
      shellHasGitHubBranchPolicyRestMutation(surface.content, dialect)
    );
  }
  if (surface.language === 'javascript') {
    return (
      javaScriptHasBranchPolicyMutation(
        surface.content,
        surface.id.startsWith('workflow-github-script:')
      ) || javaScriptHasGitHubBranchPolicyRestMutation(surface.content)
    );
  }
  if (surface.language === 'python') {
    return pythonChildProcessCommandStrings(surface.content).some(
      (command) =>
        shellHasBranchPolicyMutation(command, 'portable') ||
        shellHasGitHubBranchPolicyRestMutation(command, 'portable')
    );
  }
  return false;
}

function automationSurfaceHasProductionMutation(surface: AutomationSurface): boolean {
  if (surface.language === 'action') return /vercel/i.test(surface.content);
  if (surface.language === 'shell') {
    return containsProductionVercelCommand(surface.content, surface.dialect ?? 'portable');
  }
  if (surface.language === 'javascript') {
    const inspection = childProcessInspection(surface.content);
    return (
      inspection.unresolvedVercelCommand ||
      inspection.unresolvedVercelArguments ||
      inspection.commands.some(containsProductionVercelCommand)
    );
  }
  if (surface.language === 'python') {
    return pythonChildProcessCommandStrings(surface.content).some(
      (command) =>
        containsProductionVercelCommand(command) ||
        (command.includes(DYNAMIC_ATOMIC_ARGUMENT) &&
          containsDynamicAtomicProductionCommand(command, 'portable'))
    );
  }
  return false;
}

function automationSurfaceHasVercelRestMutation(surface: AutomationSurface): boolean {
  if (surface.language === 'shell') {
    const dialect = surface.dialect ?? 'portable';
    if (dialect === 'portable') {
      return (['posix', 'powershell', 'cmd'] as const).some((candidate) =>
        shellHasVercelRestMutation(surface.content, candidate)
      );
    }
    return shellHasVercelRestMutation(surface.content, dialect);
  }
  if (surface.language === 'javascript') {
    return javaScriptHasVercelRestMutation(surface.content);
  }
  if (surface.language === 'python') {
    return pythonHasVercelRestMutation(surface.content);
  }
  return false;
}

function isVercelApiUrl(value: string): boolean {
  return /https:\/\/api\.vercel\.com(?:\/|\b)/i.test(value);
}

function shellHasVercelRestMutation(script: string, dialect: ShellDialect): boolean {
  if (dialect === 'portable') {
    return (['posix', 'powershell', 'cmd'] as const).some((candidate) =>
      shellHasVercelRestMutation(script, candidate)
    );
  }
  return shellCommandStrings(script, dialect).some((command) => {
    const tokens = tokenizeShellCommand(command, dialect);
    const first = tokens[0]?.replace(/^@/, '').toLowerCase();
    if (first === 'echo' || first === 'printf' || first === 'write-host') return false;
    if (!tokens.some(isVercelApiUrl)) return false;

    const nested = nestedShellCommandStrings(command, dialect);
    if (nested.length > 0) {
      return nested.some((payload) => shellHasVercelRestMutation(payload.text, payload.dialect));
    }

    const curlIndex = tokens.findIndex((token) => /(?:^|[/\\])curl(?:\.exe)?$/i.test(token));
    if (curlIndex !== -1) {
      const curlArguments = tokens.slice(curlIndex + 1);
      let method: string | undefined;
      let requestFlagSeen = false;
      for (let index = 0; index < curlArguments.length; index += 1) {
        const argument = curlArguments[index] ?? '';
        if (argument === '-X' || argument === '--request') {
          requestFlagSeen = true;
          method = curlArguments[index + 1];
          index += 1;
          continue;
        }
        if (argument.startsWith('--request=')) {
          requestFlagSeen = true;
          method = argument.slice('--request='.length);
          continue;
        }
        if (/^-X.+/.test(argument)) {
          requestFlagSeen = true;
          method = argument.slice(2).replace(/^=/, '');
        }
      }
      if (requestFlagSeen && !method) return true;
      if (method) return !['GET', 'HEAD'].includes(method.toUpperCase());
      if (
        curlArguments.includes('-G') ||
        curlArguments.includes('--get') ||
        curlArguments.includes('-I') ||
        curlArguments.includes('--head')
      ) {
        return false;
      }
      return curlArguments.some((token) =>
        /^(?:--data(?:-raw|-binary|-urlencode)?|-d|--form|-F|--json|-T|--upload-file)(?:=|$)/.test(
          token
        )
      );
    }

    const powerShellRequestIndex = tokens.findIndex((token) =>
      /^(?:invoke-restmethod|irm|invoke-webrequest|iwr)$/i.test(token)
    );
    if (powerShellRequestIndex !== -1) {
      const requestArguments = tokens.slice(powerShellRequestIndex + 1);
      const methodIndex = requestArguments.findIndex((token) => /^-method$/i.test(token));
      if (methodIndex === -1) return false;
      const method = requestArguments[methodIndex + 1];
      return !method || !['GET', 'HEAD'].includes(method.toUpperCase());
    }

    const wgetIndex = tokens.findIndex((token) => /(?:^|[/\\])wget(?:\.exe)?$/i.test(token));
    if (wgetIndex !== -1) {
      const wgetArguments = tokens.slice(wgetIndex + 1);
      const assignedMethod = wgetArguments.find((token) => /^--method=/.test(token));
      const methodIndex = wgetArguments.findIndex((token) => token === '--method');
      const method =
        methodIndex === -1
          ? assignedMethod?.slice('--method='.length)
          : wgetArguments[methodIndex + 1];
      if (methodIndex !== -1 && !method) return true;
      if (method) return !['GET', 'HEAD'].includes(method.toUpperCase());
      return wgetArguments.some((token) =>
        /^(?:--post-data|--post-file|--body-data|--body-file)(?:=|$)/.test(token)
      );
    }

    return true;
  });
}

function javaScriptHasVercelRestMutation(source: string): boolean {
  if (
    childProcessInspection(source).commands.some((command) =>
      shellHasVercelRestMutation(command, 'portable')
    )
  ) {
    return true;
  }
  const context = createJavaScriptAnalysisContext(source);
  let mutation = false;

  function visit(node: ts.Node): void {
    if (mutation) return;
    if (ts.isCallExpression(node)) {
      if (javaScriptTransportCallMutatesVercel(node, context)) mutation = true;
      if (!mutation && isVercelSdkMutationCall(node, context)) mutation = true;
    }
    ts.forEachChild(node, visit);
  }

  visit(context.sourceFile);
  return mutation;
}

type JavaScriptTransportCall = {
  defaultMethod: 'GET' | 'UNKNOWN';
  methodName?: string;
  optionsIndex?: number;
  optionsOnlyAtZero?: boolean;
};

function javaScriptTransportCall(
  call: ts.CallExpression,
  context: JavaScriptAnalysisContext
): JavaScriptTransportCall | undefined {
  const expression = call.expression;
  if (
    (ts.isIdentifier(expression) &&
      expression.text === 'fetch' &&
      symbolDeclaration(expression, context) === undefined) ||
    (ts.isPropertyAccessExpression(expression) &&
      ts.isIdentifier(expression.expression) &&
      expression.expression.text === 'globalThis' &&
      expression.name.text === 'fetch')
  ) {
    return { defaultMethod: 'GET', optionsIndex: 1 };
  }

  if (ts.isIdentifier(expression)) {
    const module = javaScriptBindingModule(expression, context);
    if (module === 'node-fetch') return { defaultMethod: 'GET', optionsIndex: 1 };
    if (
      ['node:http', 'node:https', 'http', 'https', 'undici'].includes(module ?? '') &&
      ['request', 'get'].includes(importedJavaScriptName(expression, context) ?? '')
    ) {
      const methodName = importedJavaScriptName(expression, context);
      return {
        defaultMethod: methodName === 'get' ? 'GET' : 'GET',
        methodName,
        optionsIndex: 1,
        optionsOnlyAtZero: module !== 'undici',
      };
    }
    if (module === 'axios') return { defaultMethod: 'GET', optionsIndex: 0 };
    return undefined;
  }

  if (!ts.isPropertyAccessExpression(expression) && !ts.isElementAccessExpression(expression)) {
    return undefined;
  }
  const methodName = staticPropertyName(expression, context)?.toLowerCase();
  if (!methodName) return undefined;
  const receiver = expression.expression;
  if (ts.isIdentifier(receiver) && isAxiosReceiver(receiver, context)) {
    if (methodName === 'create') return undefined;
    if (methodName === 'request') return { defaultMethod: 'GET', methodName, optionsIndex: 0 };
    return { defaultMethod: 'UNKNOWN', methodName, optionsIndex: 1 };
  }
  if (
    ts.isIdentifier(receiver) &&
    javaScriptClientBase(receiver, context)?.module === 'undici' &&
    methodName === 'request'
  ) {
    return { defaultMethod: 'GET', methodName, optionsIndex: 0 };
  }
  const root = expressionRootIdentifier(receiver);
  const module = root ? javaScriptBindingModule(root, context) : undefined;
  if (['node:http', 'node:https', 'http', 'https', 'undici'].includes(module ?? '')) {
    if (methodName === 'request' || methodName === 'get') {
      return {
        defaultMethod: 'GET',
        methodName,
        optionsIndex: 1,
        optionsOnlyAtZero: module !== 'undici',
      };
    }
  }
  return undefined;
}

function importedJavaScriptName(
  identifier: ts.Identifier,
  context: JavaScriptAnalysisContext
): string | undefined {
  const binding = symbolDeclaration(identifier, context);
  if (binding && ts.isImportSpecifier(binding)) {
    return binding.propertyName?.text ?? binding.name.text;
  }
  return identifier.text;
}

function resolvedJavaScriptExpression(
  expression: ts.Expression | undefined,
  context: JavaScriptAnalysisContext,
  resolving = new Set<ts.Declaration>()
): ts.Expression | undefined {
  if (!expression || !ts.isIdentifier(expression)) return expression;
  const binding = symbolDeclaration(expression, context);
  if (
    !binding ||
    !ts.isVariableDeclaration(binding) ||
    !isConstDeclaration(binding) ||
    !binding.initializer ||
    resolving.has(binding)
  ) {
    return expression;
  }
  const nextResolving = new Set(resolving);
  nextResolving.add(binding);
  return resolvedJavaScriptExpression(binding.initializer, context, nextResolving);
}

function javaScriptExpressionHasVercelApi(
  expression: ts.Expression | undefined,
  context: JavaScriptAnalysisContext
): boolean {
  const resolved = resolvedJavaScriptExpression(expression, context);
  const staticText = staticCommandText(resolved, context);
  if (staticText && isVercelApiUrl(staticText)) return true;
  if (resolved && ts.isObjectLiteralExpression(resolved)) {
    const hostname = javaScriptObjectProperty(resolved, 'hostname', context).expression;
    const host = hostname ?? javaScriptObjectProperty(resolved, 'host', context).expression;
    const staticHost = staticCommandText(host, context);
    if (staticHost?.toLowerCase() === 'api.vercel.com') return true;
    return resolved.properties.some((property) => {
      if (ts.isPropertyAssignment(property)) {
        return javaScriptExpressionHasVercelApi(property.initializer, context);
      }
      if (ts.isShorthandPropertyAssignment(property)) {
        return javaScriptExpressionHasVercelApi(property.name, context);
      }
      return ts.isSpreadAssignment(property)
        ? javaScriptExpressionHasVercelApi(property.expression, context)
        : false;
    });
  }
  if (resolved && ts.isArrayLiteralExpression(resolved)) {
    return resolved.elements.some(
      (element) =>
        !ts.isSpreadElement(element) && javaScriptExpressionHasVercelApi(element, context)
    );
  }
  return false;
}

function javaScriptObjectProperty(
  expression: ts.Expression | undefined,
  propertyName: string,
  context: JavaScriptAnalysisContext
): { dynamic: boolean; expression?: ts.Expression } {
  const resolved = resolvedJavaScriptExpression(expression, context);
  if (!resolved) return { dynamic: false };
  if (!ts.isObjectLiteralExpression(resolved)) return { dynamic: true };
  let dynamic = false;
  let propertyExpression: ts.Expression | undefined;
  for (const property of resolved.properties) {
    if (ts.isSpreadAssignment(property)) {
      dynamic = true;
      continue;
    }
    if (!ts.isPropertyAssignment(property)) continue;
    const name =
      ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)
        ? property.name.text
        : undefined;
    if (name === propertyName) {
      propertyExpression = property.initializer;
      dynamic = false;
    }
  }
  return { dynamic, expression: propertyExpression };
}

function javaScriptTransportCallMutatesVercel(
  call: ts.CallExpression,
  context: JavaScriptAnalysisContext
): boolean {
  const transport = javaScriptTransportCall(call, context);
  if (!transport) return false;
  const receiver =
    ts.isPropertyAccessExpression(call.expression) || ts.isElementAccessExpression(call.expression)
      ? call.expression.expression
      : undefined;
  const clientBase =
    receiver && ts.isIdentifier(receiver)
      ? javaScriptClientBase(receiver, context)?.baseUrl
      : undefined;
  if (
    !call.arguments.some((argument) => javaScriptExpressionHasVercelApi(argument, context)) &&
    !(clientBase && isVercelApiUrl(clientBase))
  ) {
    return false;
  }
  if (transport.methodName && ['get', 'head'].includes(transport.methodName)) return false;
  if (transport.methodName && ['post', 'put', 'patch', 'delete'].includes(transport.methodName)) {
    return true;
  }

  const firstArgument = resolvedJavaScriptExpression(call.arguments[0], context);
  const options =
    transport.optionsOnlyAtZero && firstArgument && ts.isObjectLiteralExpression(firstArgument)
      ? call.arguments[0]
      : call.arguments[transport.optionsIndex ?? -1];
  const methodProperty = javaScriptObjectProperty(options, 'method', context);
  if (methodProperty.expression) {
    const method = staticCommandText(methodProperty.expression, context);
    return methodProperty.dynamic || !method || !['GET', 'HEAD'].includes(method.toUpperCase());
  }
  if (methodProperty.dynamic) return true;
  return transport.defaultMethod !== 'GET';
}

function javaScriptClientBase(
  identifier: ts.Identifier,
  context: JavaScriptAnalysisContext,
  resolving = new Set<ts.Declaration>()
): { baseUrl?: string; module: 'axios' | 'undici' } | undefined {
  const binding = symbolDeclaration(identifier, context);
  if (
    !binding ||
    resolving.has(binding) ||
    !ts.isVariableDeclaration(binding) ||
    !binding.initializer
  ) {
    return undefined;
  }
  const nextResolving = new Set(resolving);
  nextResolving.add(binding);
  if (ts.isIdentifier(binding.initializer)) {
    return javaScriptClientBase(binding.initializer, context, nextResolving);
  }
  if (
    ts.isCallExpression(binding.initializer) &&
    (ts.isPropertyAccessExpression(binding.initializer.expression) ||
      ts.isElementAccessExpression(binding.initializer.expression)) &&
    staticPropertyName(binding.initializer.expression, context) === 'create'
  ) {
    const receiver = binding.initializer.expression.expression;
    if (ts.isIdentifier(receiver) && isAxiosReceiver(receiver, context)) {
      const baseUrlProperty = javaScriptObjectProperty(
        binding.initializer.arguments[0],
        'baseURL',
        context
      );
      return {
        baseUrl: staticCommandText(baseUrlProperty.expression, context),
        module: 'axios',
      };
    }
  }
  if (
    ts.isNewExpression(binding.initializer) &&
    ts.isIdentifier(binding.initializer.expression) &&
    javaScriptBindingModule(binding.initializer.expression, context) === 'undici' &&
    importedJavaScriptName(binding.initializer.expression, context) === 'Client'
  ) {
    return {
      baseUrl: staticCommandText(binding.initializer.arguments?.[0], context),
      module: 'undici',
    };
  }
  return undefined;
}

function javaScriptBindingModule(
  identifier: ts.Identifier,
  context: JavaScriptAnalysisContext
): string | undefined {
  const binding = symbolDeclaration(identifier, context);
  if (!binding) return undefined;
  if (
    ts.isImportClause(binding) ||
    ts.isImportSpecifier(binding) ||
    ts.isNamespaceImport(binding)
  ) {
    return importModuleName(binding);
  }
  if (ts.isVariableDeclaration(binding)) return requireModuleName(binding.initializer);
  return undefined;
}

function isAxiosReceiver(
  identifier: ts.Identifier,
  context: JavaScriptAnalysisContext,
  resolving = new Set<ts.Declaration>()
): boolean {
  const binding = symbolDeclaration(identifier, context);
  if (!binding || resolving.has(binding)) return false;
  if (javaScriptBindingModule(identifier, context) === 'axios') return true;
  if (!ts.isVariableDeclaration(binding) || !binding.initializer) return false;

  const nextResolving = new Set(resolving);
  nextResolving.add(binding);
  if (ts.isIdentifier(binding.initializer)) {
    return isAxiosReceiver(binding.initializer, context, nextResolving);
  }
  if (
    ts.isCallExpression(binding.initializer) &&
    ts.isPropertyAccessExpression(binding.initializer.expression) &&
    binding.initializer.expression.name.text === 'create' &&
    ts.isIdentifier(binding.initializer.expression.expression)
  ) {
    return isAxiosReceiver(binding.initializer.expression.expression, context, nextResolving);
  }
  return false;
}

function expressionRootIdentifier(expression: ts.Expression): ts.Identifier | undefined {
  if (ts.isIdentifier(expression)) return expression;
  if (ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression)) {
    return expressionRootIdentifier(expression.expression);
  }
  return undefined;
}

function isVercelSdkExpression(
  expression: ts.Expression,
  context: JavaScriptAnalysisContext,
  resolving = new Set<ts.Declaration>()
): boolean {
  if (ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression)) {
    return isVercelSdkExpression(expression.expression, context, resolving);
  }
  if (ts.isNewExpression(expression) || ts.isCallExpression(expression)) {
    return isVercelSdkExpression(expression.expression, context, resolving);
  }
  if (!ts.isIdentifier(expression)) return false;

  const binding = symbolDeclaration(expression, context);
  if (!binding || resolving.has(binding)) return false;
  const module = javaScriptBindingModule(expression, context);
  if (module === '@vercel/sdk' || module === '@vercel/client') return true;

  const nextResolving = new Set(resolving);
  nextResolving.add(binding);
  if (ts.isBindingElement(binding)) {
    const declaration = containingVariableDeclaration(binding);
    return Boolean(
      declaration?.initializer &&
      isVercelSdkExpression(declaration.initializer, context, nextResolving)
    );
  }
  if (ts.isVariableDeclaration(binding) && binding.initializer) {
    return isVercelSdkExpression(binding.initializer, context, nextResolving);
  }
  return false;
}

function isVercelSdkMutatorExpression(
  expression: ts.Expression,
  context: JavaScriptAnalysisContext,
  resolving = new Set<ts.Declaration>()
): boolean {
  const mutator =
    /^(?:create|delete|update|promote|rollback|assign|set|start|approve|abort|complete|configure)/i;
  if (ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression)) {
    const method = staticPropertyName(expression, context);
    return Boolean(
      method && mutator.test(method) && isVercelSdkExpression(expression.expression, context)
    );
  }
  if (!ts.isIdentifier(expression)) return false;
  const binding = symbolDeclaration(expression, context);
  if (!binding || resolving.has(binding)) return false;
  const nextResolving = new Set(resolving);
  nextResolving.add(binding);
  if (ts.isBindingElement(binding)) {
    const declaration = containingVariableDeclaration(binding);
    const importedName =
      binding.propertyName && ts.isIdentifier(binding.propertyName)
        ? binding.propertyName.text
        : binding.name.getText();
    return Boolean(
      mutator.test(importedName) &&
      declaration?.initializer &&
      isVercelSdkExpression(declaration.initializer, context)
    );
  }
  return Boolean(
    ts.isVariableDeclaration(binding) &&
    binding.initializer &&
    isVercelSdkMutatorExpression(binding.initializer, context, nextResolving)
  );
}

function isVercelSdkMutationCall(
  call: ts.CallExpression,
  context: JavaScriptAnalysisContext
): boolean {
  return isVercelSdkMutatorExpression(call.expression, context);
}

function pythonHasVercelRestMutation(source: string): boolean {
  if (
    pythonChildProcessCommandStrings(source).some((command) =>
      shellHasVercelRestMutation(command, 'portable')
    )
  ) {
    return true;
  }
  const withoutComments = stripShellComments(source, 'posix');
  type PythonHttpModule = 'httpx' | 'requests' | 'urllib';
  const namespaces = new Map<string, PythonHttpModule>();
  const directCalls = new Map<string, { api: string; module: PythonHttpModule }>();
  for (const match of withoutComments.matchAll(
    /^\s*import\s+(httpx|requests)(?:\s+as\s+([A-Za-z_]\w*))?\s*$/gm
  )) {
    const module = match[1] as PythonHttpModule;
    namespaces.set(match[2] ?? module, module);
  }
  for (const match of withoutComments.matchAll(
    /^\s*import\s+urllib\.request(?:\s+as\s+([A-Za-z_]\w*))?\s*$/gm
  )) {
    namespaces.set(match[1] ?? 'urllib', 'urllib');
  }
  for (const match of withoutComments.matchAll(
    /^\s*from\s+(httpx|requests|urllib\.request)\s+import\s+(.+?)\s*$/gm
  )) {
    const module = match[1] === 'urllib.request' ? 'urllib' : (match[1] as PythonHttpModule);
    for (const imported of (match[2] ?? '').split(',')) {
      const [api = '', alias] = imported.trim().split(/\s+as\s+/);
      if (api) directCalls.set(alias ?? api, { api, module });
    }
  }

  const callSearchSource = maskQuotedContent(withoutComments);
  const callPattern = /\b([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\s*\(/g;
  for (const match of callSearchSource.matchAll(callPattern)) {
    const callee = match[1] ?? '';
    const parts = callee.split('.');
    const directCall = parts.length === 1 ? directCalls.get(callee) : undefined;
    const module = directCall?.module ?? namespaces.get(parts[0] ?? '');
    const api = directCall?.api ?? parts.at(-1) ?? '';
    if (!module) continue;
    if (
      (module === 'requests' || module === 'httpx') &&
      !['get', 'head', 'post', 'put', 'patch', 'delete', 'request'].includes(api.toLowerCase())
    ) {
      continue;
    }
    if (module === 'urllib' && !['Request', 'urlopen'].includes(api)) continue;

    const openParenthesis = (match.index ?? 0) + match[0].lastIndexOf('(');
    const callArguments = balancedContent(withoutComments, openParenthesis, '(', ')');
    if (callArguments === undefined) continue;
    const argumentsList = splitTopLevelArguments(callArguments);
    const assignments = pythonAssignmentsBefore(withoutComments, match.index ?? 0);
    const resolvedArguments = argumentsList.map((argument) => {
      const expression = pythonKeywordArgument(argument).expression;
      return pythonStaticCommand(expression, assignments) ?? expression;
    });
    if (!resolvedArguments.some((argument) => isVercelApiUrl(argument))) continue;
    const normalizedApi = api.toLowerCase();
    if (normalizedApi === 'get' || normalizedApi === 'head') continue;
    if (['post', 'put', 'patch', 'delete'].includes(normalizedApi)) return true;
    const keywordArguments = new Map(
      argumentsList
        .map(pythonKeywordArgument)
        .filter(
          (argument): argument is { expression: string; name: string } =>
            argument.name !== undefined
        )
        .map((argument) => [argument.name.toLowerCase(), argument.expression])
    );
    if (normalizedApi === 'request' && module !== 'urllib') {
      const methodExpression = keywordArguments.get('method') ?? argumentsList[0] ?? '';
      const method = pythonStaticCommand(methodExpression, assignments);
      if (!method || !['GET', 'HEAD'].includes(method.toUpperCase())) return true;
      continue;
    }
    const methodExpression = keywordArguments.get('method');
    if (methodExpression) {
      const method = pythonStaticCommand(methodExpression, assignments);
      if (!method || !['GET', 'HEAD'].includes(method.toUpperCase())) return true;
      continue;
    }
    if (
      argumentsList.some((argument) => argument.trim().startsWith('**')) ||
      keywordArguments.has('data') ||
      (normalizedApi === 'urlopen' &&
        argumentsList.filter((argument) => !argument.includes('=')).length > 1)
    ) {
      return true;
    }
  }
  return false;
}

function pythonAssignmentsBefore(source: string, beforeIndex: number): Map<string, string> {
  const assignments = new Map<string, string>();
  const prefix = source.slice(0, beforeIndex);
  for (const match of prefix.matchAll(/^\s*([A-Za-z_]\w*)\s*=\s*(.+?)\s*$/gm)) {
    const name = match[1];
    const expression = match[2];
    if (name && expression) assignments.set(name, expression);
  }
  return assignments;
}

function pythonKeywordArgument(argument: string): { expression: string; name?: string } {
  const match = argument.trim().match(/^([A-Za-z_]\w*)\s*=\s*([\s\S]+)$/);
  return match ? { expression: match[2] ?? '', name: match[1] } : { expression: argument.trim() };
}

function pythonChildProcessCommandStrings(source: string): string[] {
  const withoutComments = stripShellComments(source, 'posix');
  const commands: string[] = [];
  const namespaces = new Map<string, 'os' | 'subprocess'>();
  const directCalls = new Map<string, { api: string; module: 'os' | 'subprocess' }>();
  const assignments = new Map<string, string>();
  const ambiguousAssignments = new Set<string>();

  for (const match of withoutComments.matchAll(
    /^\s*import\s+(os|subprocess)(?:\s+as\s+([A-Za-z_]\w*))?\s*$/gm
  )) {
    const module = match[1] as 'os' | 'subprocess';
    namespaces.set(match[2] ?? module, module);
  }
  for (const match of withoutComments.matchAll(
    /^\s*from\s+(os|subprocess)\s+import\s+(.+?)\s*$/gm
  )) {
    const module = match[1] as 'os' | 'subprocess';
    for (const imported of (match[2] ?? '').split(',')) {
      const parts = imported.trim().split(/\s+as\s+/);
      const api = parts[0] ?? '';
      const localName = parts[1] ?? api;
      if (api && localName) directCalls.set(localName, { api, module });
    }
  }
  for (const match of withoutComments.matchAll(/^\s*([A-Za-z_]\w*)\s*=\s*(.+?)\s*$/gm)) {
    const name = match[1] ?? '';
    const expression = match[2] ?? '';
    if (!name || !expression) continue;
    if (assignments.has(name)) ambiguousAssignments.add(name);
    assignments.set(name, expression);
    namespaces.delete(name);
    directCalls.delete(name);
  }
  for (const name of ambiguousAssignments) assignments.delete(name);

  const allowedApis = {
    os: new Set(['system']),
    subprocess: new Set(['call', 'check_call', 'check_output', 'Popen', 'run']),
  };
  const callPattern = /\b([A-Za-z_]\w*)(?:\.([A-Za-z_]\w*))?\s*\(/g;
  const callSearchSource = maskQuotedContent(withoutComments);
  for (const match of callSearchSource.matchAll(callPattern)) {
    const namespaceOrCall = match[1] ?? '';
    const property = match[2];
    const directCall = property ? undefined : directCalls.get(namespaceOrCall);
    const module = property ? namespaces.get(namespaceOrCall) : directCall?.module;
    const api = property ?? directCall?.api;
    if (!module || !api || !allowedApis[module].has(api)) continue;

    const openParenthesis = (match.index ?? 0) + match[0].lastIndexOf('(');
    const callArguments = balancedContent(withoutComments, openParenthesis, '(', ')');
    if (callArguments === undefined) continue;
    const firstArgument = firstTopLevelArgument(callArguments);
    const command = pythonStaticCommand(firstArgument, assignments);
    if (command) commands.push(command);
  }
  return commands;
}

function maskQuotedContent(source: string): string {
  const characters = [...source];
  let quote: '"' | "'" | undefined;
  let escaped = false;
  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index];
    if (escaped) {
      if (character !== '\n' && character !== '\r') characters[index] = ' ';
      escaped = false;
      continue;
    }
    if (quote) {
      if (character === '\\') {
        characters[index] = ' ';
        escaped = true;
      } else if (character === quote) {
        quote = undefined;
      } else if (character !== '\n' && character !== '\r') {
        characters[index] = ' ';
      }
      continue;
    }
    if (character === '"' || character === "'") quote = character;
  }
  return characters.join('');
}

function balancedContent(
  source: string,
  openIndex: number,
  opening: '(' | '[',
  closing: ')' | ']'
): string | undefined {
  let depth = 0;
  let quote: '"' | "'" | undefined;
  let escaped = false;
  for (let index = openIndex; index < source.length; index += 1) {
    const character = source[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === '\\') {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = undefined;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === opening) depth += 1;
    if (character === closing) {
      depth -= 1;
      if (depth === 0) return source.slice(openIndex + 1, index);
    }
  }
  return undefined;
}

function firstTopLevelArgument(argumentsText: string): string {
  return splitTopLevelArguments(argumentsText)[0]?.trim() ?? '';
}

function splitTopLevelArguments(argumentsText: string): string[] {
  const argumentsList: string[] = [];
  let argumentStart = 0;
  let roundDepth = 0;
  let squareDepth = 0;
  let curlyDepth = 0;
  let quote: '"' | "'" | undefined;
  let escaped = false;
  for (let index = 0; index < argumentsText.length; index += 1) {
    const character = argumentsText[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === '\\') {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = undefined;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === '(') roundDepth += 1;
    if (character === ')') roundDepth -= 1;
    if (character === '[') squareDepth += 1;
    if (character === ']') squareDepth -= 1;
    if (character === '{') curlyDepth += 1;
    if (character === '}') curlyDepth -= 1;
    if (character === ',' && roundDepth === 0 && squareDepth === 0 && curlyDepth === 0) {
      argumentsList.push(argumentsText.slice(argumentStart, index).trim());
      argumentStart = index + 1;
    }
  }
  argumentsList.push(argumentsText.slice(argumentStart).trim());
  return argumentsList.filter(Boolean);
}

function pythonStaticCommand(
  expression: string,
  assignments: Map<string, string>,
  resolving = new Set<string>()
): string | undefined {
  const trimmed = expression.trim();
  if (/^[A-Za-z_]\w*$/.test(trimmed)) {
    if (resolving.has(trimmed)) return undefined;
    const initializer = assignments.get(trimmed);
    if (!initializer) return undefined;
    const nextResolving = new Set(resolving);
    nextResolving.add(trimmed);
    return pythonStaticCommand(initializer, assignments, nextResolving);
  }

  const stringMatch = trimmed.match(/^(['"])([\s\S]*)\1$/);
  if (stringMatch) return stringMatch[2];
  const sequence =
    (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
    (trimmed.startsWith('(') && trimmed.endsWith(')'));
  if (!sequence) return undefined;

  const argumentsList = splitTopLevelArguments(trimmed.slice(1, -1)).map((argument) => {
    const literal = argument.match(/^(['"])(.*?)\1$/);
    return literal?.[2] ?? DYNAMIC_ATOMIC_ARGUMENT;
  });
  return argumentsList.some((argument) => argument !== DYNAMIC_ATOMIC_ARGUMENT)
    ? argumentsList.join(' ')
    : undefined;
}

function shouldExcludeAutomationPath(relativePath: string): boolean {
  const normalizedPath = relativePath.replaceAll('\\', '/');
  const segments = normalizedPath.split('/');
  return (
    segments.some(
      (segment) =>
        AUTOMATION_SCAN_EXCLUDED_DIRECTORIES.has(segment) ||
        segment === 'generated' ||
        segment === '_generated'
    ) || normalizedPath === 'api/_app.generated.mjs'
  );
}

async function listRepositoryFiles(): Promise<string[]> {
  const { stdout } = await execFileAsync('git', ['ls-files', '-z'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  const trackedFiles = stdout
    .split('\0')
    .filter(Boolean)
    .filter((relativePath) => !shouldExcludeAutomationPath(relativePath));
  const filesPresentInWorktree = await Promise.all(
    trackedFiles.map(async (relativePath) => {
      try {
        await access(path.join(process.cwd(), relativePath));
        return relativePath;
      } catch {
        return undefined;
      }
    })
  );
  return filesPresentInWorktree.filter((relativePath): relativePath is string =>
    Boolean(relativePath)
  );
}

function automationLanguage(filePath: string, content: string): AutomationSurface['language'] {
  if (/\.(?:cjs|cts|js|mjs|mts|ts|tsx)$/.test(filePath) || /^#!.*\bnode\b/.test(content)) {
    return 'javascript';
  }
  if (/\.py$/.test(filePath) || /^#!.*\bpython(?:3)?\b/.test(content)) {
    return 'python';
  }
  return 'shell';
}

function dialectFromShellName(shell: string | undefined): ShellDialect | undefined {
  if (!shell || shell.includes('${{')) return undefined;
  const executable = shell.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
  if (/(?:^|[/\\])(?:pwsh|powershell)(?:\.exe)?$/.test(executable)) return 'powershell';
  if (/(?:^|[/\\])cmd(?:\.exe)?$/.test(executable)) return 'cmd';
  if (/(?:^|[/\\])(?:ba|z)?sh(?:\.exe)?$/.test(executable)) return 'posix';
  return undefined;
}

function workflowStepDialect(
  step: WorkflowStep,
  job: WorkflowJob,
  workflow: Workflow
): ShellDialect {
  const configuredShell = step.shell ?? job.defaults?.run?.shell ?? workflow.defaults?.run?.shell;
  const explicit = dialectFromShellName(configuredShell);
  if (explicit) return explicit;
  if (configuredShell) return 'portable';
  const runners = typeof job['runs-on'] === 'string' ? [job['runs-on']] : (job['runs-on'] ?? []);
  if (runners.some((runner) => /windows/i.test(runner))) return 'powershell';
  if (runners.length > 0 && runners.every((runner) => /ubuntu|macos|linux/i.test(runner))) {
    return 'posix';
  }
  return 'portable';
}

function operatorDialect(filePath: string, content: string): ShellDialect {
  if (/\.(?:ps1)$/i.test(filePath) || /^#!.*\b(?:pwsh|powershell)\b/i.test(content)) {
    return 'powershell';
  }
  if (/\.(?:bat|cmd)$/i.test(filePath) || /^#!.*\bcmd(?:\.exe)?\b/i.test(content)) {
    return 'cmd';
  }
  if (/\.(?:bash|sh|zsh)$/i.test(filePath) || /^#!.*(?:\/|\b)(?:ba|z)?sh(?:\s|$)/i.test(content)) {
    return 'posix';
  }
  return 'portable';
}

async function readAutomationSource(
  absolutePath: string,
  extension: string
): Promise<string | undefined> {
  if (AUTOMATION_SOURCE_EXTENSIONS.has(extension)) {
    return readFile(absolutePath, 'utf8');
  }

  const handle = await open(absolutePath, 'r');
  try {
    const probe = Buffer.alloc(512);
    const { bytesRead } = await handle.read(probe, 0, probe.length, 0);
    if (!probe.subarray(0, bytesRead).toString('utf8').startsWith('#!')) return undefined;
  } finally {
    await handle.close();
  }
  return readFile(absolutePath, 'utf8');
}

async function collectAutomationSurfaces(): Promise<AutomationSurface[]> {
  const surfaces: AutomationSurface[] = [];
  const repositoryFiles = await listRepositoryFiles();
  const workflowPaths = repositoryFiles.filter((filePath) =>
    /^\.github\/workflows\/[^/]+\.ya?ml$/.test(filePath)
  );

  for (const workflowPath of workflowPaths) {
    const workflowName = path.basename(workflowPath);
    const workflow = await readWorkflow(workflowName);
    for (const [jobName, job] of Object.entries(workflow.jobs ?? {})) {
      if (typeof job.uses === 'string') {
        surfaces.push({
          id: `workflow-use:${workflowName}#${jobName}`,
          content: job.uses,
          language: 'action',
        });
      }
      for (const [stepIndex, step] of (job.steps ?? []).entries()) {
        if (typeof step.uses === 'string') {
          surfaces.push({
            id: `workflow-use:${workflowName}#${jobName}:${stepIndex}`,
            content: step.uses,
            language: 'action',
          });
        }
        if (typeof step.run === 'string') {
          surfaces.push({
            id: `workflow:${workflowName}#${jobName}:${stepIndex}`,
            content: step.run,
            dialect: workflowStepDialect(step, job, workflow),
            language: 'shell',
          });
        }
      }
    }
  }

  for (const actionPath of repositoryFiles.filter((filePath) =>
    /^\.github\/actions\/.+\/action\.ya?ml$/.test(filePath)
  )) {
    const contents = await readFile(path.join(process.cwd(), actionPath), 'utf8');
    const action = YAML.parse(contents) as CompositeAction;
    for (const [stepIndex, step] of (action.runs?.steps ?? []).entries()) {
      if (typeof step.uses === 'string') {
        surfaces.push({
          id: `action-use:${actionPath.slice('.github/actions/'.length)}#${stepIndex}`,
          content: step.uses,
          language: 'action',
        });
      }
      if (typeof step.run === 'string') {
        surfaces.push({
          id: `action:${actionPath.slice('.github/actions/'.length)}#${stepIndex}`,
          content: step.run,
          dialect: dialectFromShellName(step.shell) ?? 'portable',
          language: 'shell',
        });
      }
    }
  }

  for (const packagePath of repositoryFiles.filter(
    (filePath) => path.basename(filePath) === 'package.json'
  )) {
    const packageDocument = JSON.parse(
      await readFile(path.join(process.cwd(), packagePath), 'utf8')
    ) as { scripts?: Record<string, unknown> };
    for (const [scriptName, script] of Object.entries(packageDocument.scripts ?? {})) {
      if (typeof script === 'string') {
        surfaces.push({
          id: `package:${packagePath}#${scriptName}`,
          content: script,
          dialect: 'portable',
          language: 'shell',
        });
      }
    }
  }

  for (const filePath of repositoryFiles) {
    const extension = path.extname(filePath);
    const absolutePath = path.join(process.cwd(), filePath);
    const content = await readAutomationSource(absolutePath, extension);
    if (content === undefined) continue;

    surfaces.push({
      id: `operator:${filePath}`,
      content,
      dialect: operatorDialect(filePath, content),
      language: automationLanguage(filePath, content),
    });
  }

  return surfaces;
}

async function collectOrdinaryBranchPolicySurfaces(): Promise<AutomationSurface[]> {
  const surfaces = (await collectAutomationSurfaces()).filter(
    (surface) =>
      surface.id.startsWith('workflow:') ||
      surface.id.startsWith('action:') ||
      surface.id.startsWith('package:') ||
      surface.id.startsWith('operator:scripts/')
  );
  const workflowPaths = (await listRepositoryFiles()).filter((filePath) =>
    /^\.github\/workflows\/[^/]+\.ya?ml$/.test(filePath)
  );

  for (const workflowPath of workflowPaths) {
    const workflow = await readWorkflow(path.basename(workflowPath));
    for (const [jobName, job] of Object.entries(workflow.jobs ?? {})) {
      for (const [stepIndex, step] of (job.steps ?? []).entries()) {
        if (
          typeof step.uses === 'string' &&
          step.uses.startsWith('actions/github-script') &&
          typeof step.with?.script === 'string'
        ) {
          surfaces.push({
            id: `workflow-github-script:${path.basename(workflowPath)}#${jobName}:${stepIndex}`,
            content: step.with.script,
            language: 'javascript',
          });
        }
      }
    }
  }
  return surfaces;
}

function callsReleaseWorkflow(workflow: Workflow): boolean {
  const jobs = Object.values(workflow.jobs ?? {});
  if (jobs.some((job) => job.uses === './.github/workflows/release-production.yml')) {
    return true;
  }

  return allRunScripts(workflow).some((script) =>
    shellCommandTokens(script).some((tokens) => {
      if (tokens[0] !== 'gh') return false;

      const delegatesWithCli =
        tokens[1] === 'workflow' &&
        tokens[2] === 'run' &&
        tokens[3]?.replace(/^\.\//, '') === 'release-production.yml';
      if (delegatesWithCli) return true;

      if (tokens[1] !== 'api') return false;

      const apiArguments = tokens.slice(2);
      const hasDispatchEndpoint = apiArguments.some((token) =>
        /\/actions\/workflows\/release-production\.yml\/dispatches(?:\?|$)/.test(token)
      );
      const hasExplicitPost = apiArguments.some((token, index) => {
        if (/^(?:--method|-X)=POST$/i.test(token) || /^-XPOST$/i.test(token)) return true;
        return (
          (token === '--method' || token === '-X') &&
          apiArguments[index + 1]?.toUpperCase() === 'POST'
        );
      });
      return hasDispatchEndpoint && hasExplicitPost;
    })
  );
}

function directProductionCommandScripts(workflow: Workflow): string[] {
  return allRunScripts(workflow).filter(containsProductionVercelCommand);
}

type SmokeGuardResult = {
  npxCalled: boolean;
  status: 'passed' | 'failed';
  stderr: string;
};

async function executeSmokeGuardFragment(
  runScript: string,
  expectedSha: string
): Promise<SmokeGuardResult> {
  const playwrightInvocation = runScript.indexOf('npx playwright test');
  if (playwrightInvocation < 0) {
    throw new Error('Smoke run step must invoke Playwright');
  }

  const guardFragment = runScript.slice(0, playwrightInvocation);
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'updog-smoke-guard-'));
  const npxPath = path.join(tempDir, 'npx');
  const markerPath = path.join(tempDir, 'npx-called');

  // Keep stub behavior hermetic and avoid relying on a repository-local npm
  // executable.
  await writeFile(
    npxPath,
    '#!/usr/bin/env bash\nset -euo pipefail\nprintf %s "$*" > "$NX_MARKER"\n',
    { mode: 0o755 }
  );

  try {
    await execFileAsync(
      'bash',
      [
        '--noprofile',
        '--norc',
        '-e',
        '-o',
        'pipefail',
        '-c',
        `${guardFragment}\nnpx playwright test`,
      ],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          EXPECTED_SHA: expectedSha,
          PRODUCTION_URL: process.env['PRODUCTION_URL'] ?? 'https://production.example',
          HEALTH_KEY: process.env['HEALTH_KEY'] ?? 'health-key',
          METRICS_KEY: process.env['METRICS_KEY'] ?? 'metrics-key',
          PROD_SMOKE_USERNAME: process.env['PROD_SMOKE_USERNAME'] ?? 'smoke-user',
          PROD_SMOKE_PASSWORD: process.env['PROD_SMOKE_PASSWORD'] ?? 'smoke-password',
          NX_MARKER: markerPath,
          PATH: `${tempDir}:${process.env['PATH'] ?? ''}`,
        },
        encoding: 'utf8',
        maxBuffer: 2 * 1024 * 1024,
      }
    );
    await access(markerPath);
    return { npxCalled: true, status: 'passed', stderr: '' };
  } catch (error) {
    const stderr =
      typeof error === 'object' && error !== null && 'stderr' in error
        ? String((error as { stderr?: unknown }).stderr ?? '')
        : String(error);
    let npxCalled = false;
    try {
      await access(markerPath);
      npxCalled = true;
    } catch {
      // Guard rejected before the hermetic npx stub ran.
    }
    return { npxCalled, status: 'failed', stderr };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function compileReleaseIdentityMatcher(
  source: string
): (body: unknown, version: string, sha: string) => boolean {
  const functionSource = source.match(/export function releaseIdentityMatches\([\s\S]*?\n\}/)?.[0];
  if (!functionSource) throw new Error('releaseIdentityMatches helper not found');

  const transpiled = ts.transpileModule(functionSource.replace(/^export\s+/, ''), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  return runInNewContext(
    `(function () { ${transpiled}; return releaseIdentityMatches; })()`,
    {}
  ) as (body: unknown, version: string, sha: string) => boolean;
}

function extractRequireResultFunction(gateScript: string): string {
  const match = gateScript.match(/^\s*require_result\(\) \{[\s\S]*?^\s*\}/m);
  if (!match) throw new Error('require_result helper not found');
  return match[0];
}

async function executeRequireResult(
  gateScript: string,
  result: string,
  expected: 'true' | 'false'
): Promise<{ passed: boolean; stderr: string; stdout: string }> {
  const requireResult = extractRequireResultFunction(gateScript);
  const script = [
    'fail=0',
    requireResult,
    'require_result "matrix" "$1" "$2"',
    'exit "$fail"',
  ].join('\n');

  try {
    const { stderr, stdout } = await execFileAsync(
      'bash',
      ['--noprofile', '--norc', '-o', 'pipefail', '-c', script, '--', result, expected],
      { cwd: process.cwd(), encoding: 'utf8' }
    );
    return { passed: true, stderr, stdout };
  } catch (error) {
    const details = error as { stderr?: unknown; stdout?: unknown };
    return {
      passed: false,
      stderr: String(details.stderr ?? ''),
      stdout: String(details.stdout ?? ''),
    };
  }
}

// The exact set of jobs the required aggregator (CI Gate Status) consumes.
// Pinned so that adding a new gate input forces a conscious review of its
// authority-vs-reporting classification below.
const GATE_FEEDING_JOBS = [
  'changes',
  'docs-link-check',
  'check',
  'test-affected',
  'test-full',
  'build',
  'release-static',
  'dependency-validation',
  'pr-light-security',
  'security-tests',
  'memory-mode',
  'guards',
  'neon-lane',
  'secret-scan',
];

describe('required CI fails closed', () => {
  it.each([
    ['POSIX backslash continuation', 'npx vercel \\\n --prod', 'posix'],
    ['PowerShell backtick continuation', 'npx vercel `\n --prod', 'powershell'],
    ['CMD caret continuation', 'npx vercel ^\n --prod', 'cmd'],
    ['POSIX ampersand separator', 'printf safe & vercel --prod', 'posix'],
    ['PowerShell ampersand separator', 'Write-Host safe & vercel --prod', 'powershell'],
    ['CMD ampersand separator', 'echo safe & vercel --prod', 'cmd'],
    ['PowerShell leading call operator', '& vercel --prod', 'powershell'],
  ] as const)('uses dialect-specific shell semantics with %s', (_caseName, script, dialect) => {
    expect(containsProductionVercelCommand(script, dialect)).toBe(true);
  });

  it.each([
    ['POSIX does not consume backtick', 'npx vercel `\n --prod', 'posix'],
    ['POSIX does not consume caret', 'npx vercel ^\n --prod', 'posix'],
    ['PowerShell does not consume backslash', 'npx vercel \\\n --prod', 'powershell'],
    ['PowerShell does not consume caret', 'npx vercel ^\n --prod', 'powershell'],
    ['CMD does not consume backslash', 'npx vercel \\\n --prod', 'cmd'],
    ['CMD does not consume backtick', 'npx vercel `\n --prod', 'cmd'],
    ['POSIX escaped ampersand', 'printf safe \\& vercel --prod', 'posix'],
    ['PowerShell escaped ampersand', 'Write-Host safe `& vercel --prod', 'powershell'],
    ['CMD escaped ampersand', 'echo safe ^& vercel --prod', 'cmd'],
    ['quoted ampersand', 'Write-Host "safe & vercel --prod"', 'powershell'],
    ['CMD REM comment', 'REM safe & vercel --prod', 'cmd'],
    ['CMD semicolon is ordinary', 'echo safe; vercel --prod', 'cmd'],
  ] as const)('keeps dialect-inert command text inert with %s', (_caseName, script, dialect) => {
    expect(containsProductionVercelCommand(script, dialect)).toBe(false);
  });

  it.each([
    ['POSIX variable payload', 'PAYLOAD=\'npx vercel --prod\'; bash -c "$PAYLOAD"', 'posix'],
    ['CMD variable payload', 'set "PAYLOAD=npx vercel --prod"\ncmd /c %PAYLOAD%', 'cmd'],
    [
      'PowerShell variable payload',
      "$Payload = 'npx vercel --prod'; Invoke-Expression $Payload",
      'powershell',
    ],
  ] as const)('resolves static interpreter payload with %s', (_caseName, script, dialect) => {
    expect(containsProductionVercelCommand(script, dialect)).toBe(true);
  });

  it('does not invent production movement from unrelated static payloads', () => {
    expect(
      containsProductionVercelCommand(
        "PAYLOAD='echo safe'; OTHER='npx vercel --prod'; bash -c \"$PAYLOAD\"",
        'posix'
      )
    ).toBe(false);
  });

  it.each([
    ['POSIX direct executable', 'CLI=vercel; "$CLI" --prod', 'posix'],
    ['POSIX assigned interpreter', "SHELL=bash; $SHELL -c 'npx vercel --prod'", 'posix'],
    ['PowerShell direct executable', "$Cli = 'vercel'; & $Cli --prod", 'powershell'],
    [
      'PowerShell Start-Process executable',
      "$Exe = 'vercel'; Start-Process $Exe -ArgumentList '--prod'",
      'powershell',
    ],
    ['CMD direct executable', 'set "CLI=vercel"\n%CLI% --prod', 'cmd'],
  ] as const)('resolves static executable wrapper with %s', (_caseName, script, dialect) => {
    expect(containsProductionVercelCommand(script, dialect)).toBe(true);
  });

  it.each([
    ['later assignment', 'bash -c "$PAYLOAD"; PAYLOAD=\'npx vercel --prod\''],
    [
      'dynamic reassignment invalidates binding',
      'PAYLOAD=\'npx vercel --prod\'; PAYLOAD=$RUNTIME; bash -c "$PAYLOAD"',
    ],
  ])('does not resolve stale POSIX assignment with %s', (_caseName, script) => {
    expect(containsProductionVercelCommand(script, 'posix')).toBe(false);
  });

  it('uses dialect-specific comment and quote rules', () => {
    expect(containsProductionVercelCommand('REM safe & vercel --prod', 'posix')).toBe(true);
    expect(containsProductionVercelCommand('REM safe & vercel --prod', 'powershell')).toBe(true);
    expect(containsProductionVercelCommand('# safe & vercel --prod', 'cmd')).toBe(true);
    expect(containsProductionVercelCommand("echo 'safe & vercel --prod'", 'cmd')).toBe(true);
    expect(
      containsProductionVercelCommand("Write-Host 'safe `& vercel --prod'", 'powershell')
    ).toBe(false);
    expect(
      containsProductionVercelCommand("Write-Host 'safe `' & vercel --prod", 'powershell')
    ).toBe(true);
    expect(containsProductionVercelCommand('echo "safe ^" & vercel --prod', 'cmd')).toBe(true);
  });

  it('applies workflow shell precedence and runner defaults', () => {
    expect(
      workflowStepDialect(
        { run: 'echo safe', shell: 'cmd' },
        { defaults: { run: { shell: 'pwsh' } }, 'runs-on': 'ubuntu-latest' },
        { defaults: { run: { shell: 'bash' } } }
      )
    ).toBe('cmd');
    expect(
      workflowStepDialect(
        { run: 'echo safe' },
        { defaults: { run: { shell: 'pwsh' } }, 'runs-on': 'ubuntu-latest' },
        { defaults: { run: { shell: 'bash' } } }
      )
    ).toBe('powershell');
    expect(
      workflowStepDialect(
        { run: 'echo safe' },
        { 'runs-on': 'ubuntu-latest' },
        { defaults: { run: { shell: 'bash' } } }
      )
    ).toBe('posix');
    expect(workflowStepDialect({ run: 'echo safe' }, { 'runs-on': 'windows-latest' }, {})).toBe(
      'powershell'
    );
  });

  it.each([
    ['line continuation before production flag', 'npx vercel \\\n  --prod'],
    ['global option before production flag', 'npx vercel --yes --prod'],
    ['deploy subcommand before production flag', 'npx vercel deploy --prod'],
    ['global option before promote', 'npx vercel --yes promote "$DEPLOYMENT_URL"'],
    ['global option before alias', 'npx vercel --scope team alias source target'],
    ['production target assignment', 'npx vercel deploy --target=production'],
    ['production target pair', 'npx vercel deploy --target production'],
    ['rollback', 'vercel rollback "$DEPLOYMENT_URL" --yes'],
    ['rolling release mutation', 'npx vercel rolling-release approve'],
    ['conditional promotion', 'if npx vercel promote "$DEPLOYMENT_URL"; then exit 0; fi'],
    ['PowerShell call operator', '& vercel rollback "$DEPLOYMENT_URL" --yes'],
    ['sudo wrapper', 'sudo npx vercel deploy --prod'],
    ['npm exec wrapper', 'npm exec vercel -- --prod'],
    ['pnpm dlx wrapper', 'pnpm dlx vercel --prod'],
    ['deploy path named ls', 'npx vercel deploy ls --prod'],
    ['default deploy path named ls', 'npx vercel --prod ls'],
    ['batch echo-suppressed command', '@vercel deploy --prod'],
    ['batch call wrapper', 'call npx vercel deploy --prod'],
    ['cmd wrapper', 'cmd /c npx vercel deploy --prod'],
    ['official vc alias', 'vc deploy --prod'],
    ['Windows vc shim', 'vc.cmd deploy --prod'],
    ['Windows Vercel shim', 'vercel.cmd deploy --prod'],
    ['Windows npx shim', 'npx.cmd vercel deploy --prod'],
    ['npx package with vc alias', 'npx --package=vercel@55 vc --prod'],
    ['Corepack pnpm wrapper', 'corepack pnpm dlx vercel --prod'],
    ['Bun x wrapper', 'bun x vercel --prod'],
    ['quoted production target', "npx vercel deploy --target='production'"],
    ['nested bash shell', "bash -lc 'npx vercel --prod'"],
    ['nested sh shell', "sh -c 'npx vercel deploy --prod'"],
    ['nested zsh shell', "zsh -c 'vc --prod'"],
    ['nested cmd shell', 'cmd /c "vercel --prod"'],
    ['nested PowerShell shell', "pwsh -Command 'vercel promote https://example.vercel.app'"],
    ['PowerShell expression', "Invoke-Expression 'vercel rollback deployment-url'"],
    ['PowerShell expression alias', "IEX 'vercel --prod'"],
    ['PowerShell process', "Start-Process vercel -ArgumentList '--prod'"],
    [
      'PowerShell process with file path',
      "Start-Process -FilePath vercel -ArgumentList '--target=production'",
    ],
    ['single ampersand sequence', 'Write-Host safe & npx vercel --prod'],
    ['single ampersand direct sequence', 'Write-Host safe & vercel --prod'],
    ['PowerShell backtick continuation', 'npx vercel `\n  --prod'],
    ['batch caret continuation', 'npx vercel ^\n  --prod'],
    [
      'PowerShell process argument array',
      'Start-Process -FilePath npx.cmd -ArgumentList @("vercel","--prod")',
    ],
    [
      'PowerShell process dynamic Vercel arguments',
      "Start-Process -FilePath npx.cmd -ArgumentList @('vercel', $runtimeArgs)",
    ],
    [
      'PowerShell process dynamic direct arguments',
      "Start-Process vercel -ArgumentList @('deploy', $runtimeFlag)",
    ],
  ])('detects Vercel production movement with %s', (_caseName, script) => {
    expect(containsProductionVercelCommand(script)).toBe(true);
  });

  it.each(
    ['start', 'approve', 'abort', 'complete', 'configure'].flatMap((action) => [
      [`long rolling-release ${action}`, `npx vercel rolling-release ${action}`],
      [`short rolling-release ${action}`, `npx vercel rr ${action}`],
    ])
  )('detects Vercel rolling-release mutation with %s', (_caseName, script) => {
    expect(containsProductionVercelCommand(script)).toBe(true);
  });

  it.each([
    ['commented command', '# npx vercel deploy --prod'],
    ['echoed command', 'echo "npx vercel deploy --prod"'],
    ['PowerShell display string', 'Write-Host "vercel rollback old-url --yes"'],
    ['production-filtered listing', 'vercel ls --prod'],
    ['production-filtered listing through npx', 'npx vercel ls --prod'],
    ['production-filtered list alias', 'npx vercel list --prod'],
    ['global option before listing', 'npx vercel --scope team ls --prod'],
    ['global assignment before list alias', 'npx vercel --scope=team list --prod'],
    ['long rolling-release fetch', 'npx vercel rolling-release fetch'],
    ['short rolling-release fetch', 'npx vercel rr fetch'],
    ['optioned long rolling-release fetch', 'npx vercel --scope team rolling-release fetch --yes'],
    ['optioned short rolling-release fetch', 'npx vercel rr --scope team fetch --yes'],
    ['read-only alias list', 'npx vercel alias list'],
    ['read-only alias ls', 'npx vercel --scope team alias ls'],
    ['read-only rollback status', 'npx vercel rollback status project-name'],
    ['read-only vc listing', 'vc list --prod'],
    ['nested read-only listing', "bash -lc 'vercel ls --prod'"],
    ['nested read-only alias list', "pwsh -Command 'vercel alias list'"],
    ['PowerShell call operator read-only', '& vercel ls --prod'],
    ['quoted ampersand example', 'Write-Host "safe & npx vercel --prod"'],
    [
      'PowerShell process read-only argument array',
      'Start-Process -FilePath npx.cmd -ArgumentList @("vercel","ls","--prod")',
    ],
    [
      'PowerShell process bounded argument list',
      "Start-Process vercel -ArgumentList @('ls','--prod') -WorkingDirectory 'x --prod'",
    ],
  ])('ignores inert or read-only Vercel production text with %s', (_caseName, script) => {
    expect(containsProductionVercelCommand(script)).toBe(false);
  });

  it('detects JavaScript child-process mutations but ignores inert examples', () => {
    expect(
      automationSurfaceHasProductionMutation({
        id: 'synthetic:exec',
        content: [
          "import { execSync } from 'node:child_process';",
          "execSync('npx vercel --prod');",
        ].join('\n'),
        language: 'javascript',
      })
    ).toBe(true);
    expect(
      automationSurfaceHasProductionMutation({
        id: 'synthetic:spawn',
        content: [
          "import { spawnSync } from 'node:child_process';",
          "spawnSync('pnpm', ['dlx', 'vercel', 'rr', 'approve']);",
        ].join('\n'),
        language: 'javascript',
      })
    ).toBe(true);
    expect(
      automationSurfaceHasProductionMutation({
        id: 'synthetic:template',
        content: [
          "const { execSync } = require('node:child_process');",
          'execSync(`npx vercel --prod --meta sha=${expectedSha}`);',
        ].join('\n'),
        language: 'javascript',
      })
    ).toBe(true);
    expect(
      automationSurfaceHasProductionMutation({
        id: 'synthetic:concatenation',
        content: [
          "const childProcess = require('child_process');",
          "childProcess.execSync('npx vercel deploy ' + '--target=production');",
        ].join('\n'),
        language: 'javascript',
      })
    ).toBe(true);
    expect(
      automationSurfaceHasProductionMutation({
        id: 'synthetic:dynamic-spawn',
        content: [
          "import * as childProcess from 'node:child_process';",
          "childProcess.execFileSync('vercel', ['deploy', dynamicFlag, '--prod']);",
        ].join('\n'),
        language: 'javascript',
      })
    ).toBe(true);
    expect(
      automationSurfaceHasProductionMutation({
        id: 'synthetic:const-command',
        content: [
          "import { execSync } from 'node:child_process';",
          "const target = '--prod';",
          "const command = 'npx vercel deploy ' + target;",
          'execSync(command);',
        ].join('\n'),
        language: 'javascript',
      })
    ).toBe(true);
    expect(
      automationSurfaceHasProductionMutation({
        id: 'synthetic:const-args',
        content: [
          "import { execaSync } from 'execa';",
          "const cli = 'vercel';",
          "const args = ['deploy', '--target=production'];",
          'execaSync(cli, args);',
        ].join('\n'),
        language: 'javascript',
      })
    ).toBe(true);
    expect(
      automationSurfaceHasProductionMutation({
        id: 'synthetic:unresolved-vercel-args',
        content: [
          "import { spawnSync } from 'node:child_process';",
          "spawnSync('vercel', runtimeArgs);",
        ].join('\n'),
        language: 'javascript',
      })
    ).toBe(true);
    expect(
      automationSurfaceHasProductionMutation({
        id: 'synthetic:unresolved-exec-template',
        content: [
          "import { execSync } from 'node:child_process';",
          "const cli = 'vercel';",
          'execSync(`${cli} ${runtimeArgs}`);',
        ].join('\n'),
        language: 'javascript',
      })
    ).toBe(true);
    expect(
      automationSurfaceHasProductionMutation({
        id: 'synthetic:unresolved-exec-wrapper',
        content: [
          "import { execSync } from 'node:child_process';",
          'execSync(`${runtimeRunner} vercel ${runtimeArgs}`);',
        ].join('\n'),
        language: 'javascript',
      })
    ).toBe(true);
    expect(
      automationSurfaceHasProductionMutation({
        id: 'synthetic:unresolved-exec-wrapper-with-prod',
        content: [
          "import { execSync } from 'node:child_process';",
          'execSync(`${runtimeRunner} vercel --prod`);',
        ].join('\n'),
        language: 'javascript',
      })
    ).toBe(true);
    expect(
      automationSurfaceHasProductionMutation({
        id: 'synthetic:duplicate-const-scopes',
        content: [
          "import { execSync } from 'node:child_process';",
          "function deploy() { const cmd = 'npx vercel --prod'; execSync(cmd); }",
          "function safe() { const cmd = 'echo safe'; execSync(cmd); }",
        ].join('\n'),
        language: 'javascript',
      })
    ).toBe(true);
    expect(
      automationSurfaceHasProductionMutation({
        id: 'synthetic:duplicate-safe-const-scopes',
        content: [
          "import { execSync } from 'node:child_process';",
          "function inspect() { const cmd = 'vercel ls --prod'; execSync(cmd); }",
          "function safe() { const cmd = 'echo safe'; execSync(cmd); }",
        ].join('\n'),
        language: 'javascript',
      })
    ).toBe(false);
    expect(
      automationSurfaceHasProductionMutation({
        id: 'synthetic:dormant-cross-scope-command',
        content: [
          "import { execSync } from 'node:child_process';",
          "function dormant() { const cmd = 'npx vercel --prod'; return cmd; }",
          "function safe() { const cmd = 'echo safe'; execSync(cmd); }",
        ].join('\n'),
        language: 'javascript',
      })
    ).toBe(false);
    expect(
      automationSurfaceHasProductionMutation({
        id: 'synthetic:unrelated-method-name',
        content: "runner.execSync('npx vercel --prod');",
        language: 'javascript',
      })
    ).toBe(false);
    expect(
      automationSurfaceHasProductionMutation({
        id: 'synthetic:echoed-unresolved-exec',
        content: [
          "import { execSync } from 'node:child_process';",
          'execSync(`echo ${runtimeText} vercel --prod`);',
        ].join('\n'),
        language: 'javascript',
      })
    ).toBe(false);
    expect(
      automationSurfaceHasProductionMutation({
        id: 'synthetic:inert',
        content: [
          "// execSync('npx vercel --prod');",
          'const example = "execSync(\'npx vercel --prod\')";',
        ].join('\n'),
        language: 'javascript',
      })
    ).toBe(false);
    expect(
      automationSurfaceHasProductionMutation({
        id: 'synthetic:python',
        content: 'import subprocess\nsubprocess.run(["npx", "vercel", "deploy", "--prod"])',
        language: 'python',
      })
    ).toBe(true);
    expect(
      automationSurfaceHasProductionMutation({
        id: 'synthetic:python-comment',
        content: '# subprocess.run(["npx", "vercel", "deploy", "--prod"])',
        language: 'python',
      })
    ).toBe(false);
    expect(
      automationSurfaceHasProductionMutation({
        id: 'synthetic:python-keyword-string',
        content:
          'import subprocess\nsubprocess.run(["vercel", "deploy"], env={"TARGET": "--prod"})',
        language: 'python',
      })
    ).toBe(false);
    expect(
      automationSurfaceHasProductionMutation({
        id: 'synthetic:batch',
        content: 'vercel deploy --target production',
        language: 'shell',
      })
    ).toBe(true);
    expect(
      automationSurfaceHasProductionMutation({
        id: 'synthetic:batch-comment',
        content: 'REM vercel deploy --target production',
        language: 'shell',
      })
    ).toBe(false);
  });

  it.each([
    [
      'spawnSync wrapper spread',
      "import { spawnSync } from 'node:child_process';\nspawnSync('npx', ['vercel', ...runtimeArgs]);",
    ],
    [
      'spawn wrapper spread',
      "import { spawn } from 'node:child_process';\nspawn('pnpm', ['dlx', 'vercel', ...runtimeArgs]);",
    ],
    [
      'execFileSync wrapper spread',
      "import { execFileSync } from 'node:child_process';\nexecFileSync('npm', ['exec', 'vercel', ...runtimeArgs]);",
    ],
    [
      'execFile wrapper spread',
      "import { execFile } from 'node:child_process';\nexecFile('bun', ['x', 'vercel', ...runtimeArgs]);",
    ],
    [
      'execaSync wrapper spread',
      "import { execaSync } from 'execa';\nexecaSync('npx', ['vercel', ...runtimeArgs]);",
    ],
    [
      'execa wrapper spread',
      "import { execa } from 'execa';\nexeca('yarn', ['dlx', 'vercel', ...runtimeArgs]);",
    ],
    [
      'const argv wrapper spread',
      [
        "import { spawnSync } from 'node:child_process';",
        "const argv = ['vercel', ...runtimeArgs];",
        "spawnSync('npx', argv);",
      ].join('\n'),
    ],
  ])('fails closed for unresolved wrapped argv with %s', (_caseName, content) => {
    expect(
      automationSurfaceHasProductionMutation({
        id: 'synthetic:wrapped-unresolved',
        content,
        language: 'javascript',
      })
    ).toBe(true);
  });

  it.each([
    [
      'aliased ESM child-process import',
      "import { spawnSync as run } from 'node:child_process';\nrun('npx', ['vercel', '--prod']);",
    ],
    [
      'ESM child-process namespace',
      "import * as cp from 'child_process';\ncp.execFileSync('npx', ['vercel', '--prod']);",
    ],
    [
      'destructured CJS child-process require',
      "const { spawnSync: run } = require('node:child_process');\nrun('npx', ['vercel', '--prod']);",
    ],
    [
      'CJS child-process namespace',
      "const cp = require('child_process');\ncp.execSync('npx vercel --prod');",
    ],
    ['default execa import', "import execa from 'execa';\nexeca('npx', ['vercel', '--prod']);"],
    [
      'resolved static array spread',
      [
        "import { spawnSync } from 'node:child_process';",
        "const prefix = ['vercel'];",
        'const argv = [...prefix, ...runtimeArgs];',
        "spawnSync('npx', argv);",
      ].join('\n'),
    ],
    [
      'inline child-process require',
      "require('node:child_process').execSync('npx vercel --prod');",
    ],
    [
      'CJS namespace element access',
      "const cp = require('child_process');\ncp['execSync']('npx vercel --prod');",
    ],
    [
      'namespace member alias',
      "const cp = require('child_process');\nconst run = cp.execSync;\nrun('npx vercel --prod');",
    ],
    [
      'named import alias variable',
      "import { execSync } from 'node:child_process';\nconst run = execSync;\nrun('npx vercel --prod');",
    ],
    ['inline execa require', "require('execa').execaSync('npx', ['vercel', '--prod']);"],
    [
      'two-step CJS namespace destructure',
      [
        "const cp = require('child_process');",
        'const { execSync } = cp;',
        "execSync('npx vercel --prod');",
      ].join('\n'),
    ],
    [
      'computed const process method',
      [
        "import * as cp from 'node:child_process';",
        "const method = 'execSync';",
        "cp[method]('npx vercel --prod');",
      ].join('\n'),
    ],
  ])('accepts proven process provenance with %s', (_caseName, content) => {
    expect(
      automationSurfaceHasProductionMutation({
        id: 'synthetic:provenance-positive',
        content,
        language: 'javascript',
      })
    ).toBe(true);
  });

  it.each([
    [
      'fully dynamic wrapper argv',
      "import { spawnSync } from 'node:child_process';\nspawnSync('npx', runtimeArgs);",
    ],
    ['unproven bare call', "execSync('npx vercel --prod');"],
    ['unrelated object method', "runner.execSync('npx vercel --prod');"],
    [
      'function shadow',
      [
        "import { execSync } from 'node:child_process';",
        'function safe() {',
        '  function execSync(_command) {}',
        "  execSync('npx vercel --prod');",
        '}',
      ].join('\n'),
    ],
    [
      'parameter shadow',
      [
        "import { execSync } from 'node:child_process';",
        "function safe(execSync) { execSync('npx vercel --prod'); }",
      ].join('\n'),
    ],
    [
      'catch binding shadow',
      [
        "import { execSync } from 'node:child_process';",
        "try { throw new Error('safe'); }",
        "catch (execSync) { execSync('npx vercel --prod'); }",
      ].join('\n'),
    ],
    [
      'local const shadow',
      [
        "import { execSync } from 'node:child_process';",
        "function safe() { const execSync = () => undefined; execSync('npx vercel --prod'); }",
      ].join('\n'),
    ],
  ])('ignores unproven or shadowed process call with %s', (_caseName, content) => {
    expect(
      automationSurfaceHasProductionMutation({
        id: 'synthetic:provenance-negative',
        content,
        language: 'javascript',
      })
    ).toBe(false);
  });

  it.each([
    ['list', "spawnSync('vercel', ['ls', ...runtimeArgs]);"],
    ['list alias', "spawnSync('vercel', ['list', ...runtimeArgs]);"],
    ['alias list', "spawnSync('vercel', ['alias', 'list', ...runtimeArgs]);"],
    ['alias ls', "spawnSync('vercel', ['alias', 'ls', ...runtimeArgs]);"],
    ['rollback status', "spawnSync('vercel', ['rollback', 'status', ...runtimeArgs]);"],
    ['rolling release fetch', "spawnSync('vercel', ['rr', 'fetch', ...runtimeArgs]);"],
  ])('keeps fixed read-only atomic argv read-only with %s', (_caseName, invocation) => {
    expect(
      automationSurfaceHasProductionMutation({
        id: 'synthetic:read-only-atomic-tail',
        content: ["import { spawnSync } from 'node:child_process';", invocation].join('\n'),
        language: 'javascript',
      })
    ).toBe(false);
  });

  it('fails closed when dynamic atomic argv precedes the Vercel action', () => {
    expect(
      automationSurfaceHasProductionMutation({
        id: 'synthetic:dynamic-atomic-action',
        content: [
          "import { spawnSync } from 'node:child_process';",
          "spawnSync('vercel', [runtimeAction, 'ls']);",
        ].join('\n'),
        language: 'javascript',
      })
    ).toBe(true);
  });

  it('keeps atomic template interpolation after a fixed read-only action read-only', () => {
    expect(
      automationSurfaceHasProductionMutation({
        id: 'synthetic:atomic-template-tail',
        content: [
          "import { spawnSync } from 'node:child_process';",
          "spawnSync('vercel', ['ls', `${runtimeTail}`]);",
        ].join('\n'),
        language: 'javascript',
      })
    ).toBe(false);
  });

  it('distinguishes Start-Process read-only tails from dynamic actions', () => {
    expect(
      containsProductionVercelCommand(
        "Start-Process vercel -ArgumentList @('ls', $runtimeArgs)",
        'powershell'
      )
    ).toBe(false);
    expect(
      containsProductionVercelCommand(
        "Start-Process vercel -ArgumentList @($runtimeAction, 'ls')",
        'powershell'
      )
    ).toBe(true);
  });

  it.each([
    ['inline list', 'import subprocess\nsubprocess.run(["npx", "vercel", "--prod"])'],
    ['inline tuple', 'import subprocess\nsubprocess.run(("npx", "vercel", "--prod"))'],
    ['inline string', 'import subprocess\nsubprocess.run("npx vercel --prod", shell=True)'],
    [
      'const-bound list',
      'import subprocess\nargv = ["npx", "vercel", "--prod"]\nsubprocess.run(argv)',
    ],
    [
      'const-bound tuple',
      'import subprocess\nargv = ("npx", "vercel", "--prod")\nsubprocess.Popen(argv)',
    ],
    [
      'unresolved inline tail',
      'import subprocess\nsubprocess.run(["npx", "vercel", *runtime_args])',
    ],
    [
      'unresolved const tail',
      'import subprocess\nargv = ["npx", "vercel", *runtime_args]\nsubprocess.run(argv)',
    ],
    ['aliased subprocess import', 'import subprocess as sp\nsp.run(("npx", "vercel", "--prod"))'],
    [
      'aliased direct import',
      'from subprocess import run as execute\nexecute(["npx", "vercel", "--prod"])',
    ],
    ['os system import', 'import os\nos.system("npx vercel --prod")'],
    [
      'dynamic action before read-only token',
      'import subprocess\nsubprocess.run(["vercel", runtime_action, "ls"])',
    ],
  ])('detects Python production invocation with %s', (_caseName, content) => {
    expect(
      automationSurfaceHasProductionMutation({
        id: 'synthetic:python-command',
        content,
        language: 'python',
      })
    ).toBe(true);
  });

  it.each([
    ['read-only tuple', 'import subprocess\nsubprocess.run(("vercel", "ls", "--prod"))'],
    ['dormant const', 'argv = ["npx", "vercel", "--prod"]\nprint("safe")'],
    ['unrelated dynamic argv', 'import subprocess\nsubprocess.run(["echo", *runtime_args])'],
    [
      'fake subprocess object',
      [
        'import subprocess',
        'class Fake:',
        '    def run(self, argv): pass',
        'subprocess = Fake()',
        'subprocess.run(["npx", "vercel", "--prod"])',
      ].join('\n'),
    ],
    [
      'proven import with inert string',
      ['import subprocess', 'example = \'subprocess.run(["npx", "vercel", "--prod"])\''].join('\n'),
    ],
    [
      'fully dynamic wrapper tail without Vercel evidence',
      'import subprocess\nsubprocess.run(["npx", *runtime_args])',
    ],
    [
      'dynamic tail after fixed read-only action',
      'import subprocess\nsubprocess.run(["vercel", "ls", runtime_tail])',
    ],
  ])('ignores safe Python invocation with %s', (_caseName, content) => {
    expect(
      automationSurfaceHasProductionMutation({
        id: 'synthetic:python-safe',
        content,
        language: 'python',
      })
    ).toBe(false);
  });

  it('rejects Vercel deployment action uses and pins scan exclusions', () => {
    expect(
      automationSurfaceHasProductionMutation({
        id: 'synthetic:action',
        content: 'amondnet/vercel-action@v25',
        language: 'action',
      })
    ).toBe(true);
    expect(
      automationSurfaceHasProductionMutation({
        id: 'synthetic:safe-action',
        content: 'actions/checkout@pinned-sha',
        language: 'action',
      })
    ).toBe(false);

    expect([...AUTOMATION_SCAN_EXCLUDED_DIRECTORIES].sort()).toEqual(
      [
        '.cache',
        '.git',
        '.npm-cache',
        '.omx',
        '.superpowers',
        '.vercel',
        'build',
        'coverage',
        'dist',
        'docs',
        'node_modules',
        'snapshots',
        'tests',
      ].sort()
    );
    expect(shouldExcludeAutomationPath(path.join('api', '_app.generated.mjs'))).toBe(true);
    expect(shouldExcludeAutomationPath(path.join('docs', 'deploy.sh'))).toBe(true);
    expect(shouldExcludeAutomationPath('deploy.sh')).toBe(false);
    expect([...AUTOMATION_SOURCE_EXTENSIONS]).toEqual(
      expect.arrayContaining(['.bat', '.cmd', '.cts', '.mts', '.py', '.tsx'])
    );
  });

  it('distinguishes Vercel REST mutations from read-only API requests', () => {
    for (const command of [
      'curl -X DELETE "https://api.vercel.com/v13/deployments/dpl_123"',
      'curl -XPOST "https://api.vercel.com/v13/deployments"',
      'curl -X "$METHOD" "https://api.vercel.com/v13/deployments"',
      'curl -X "https://api.vercel.com/v13/deployments"',
      'curl --json \'{"name":"release"}\' "https://api.vercel.com/v13/deployments"',
      'curl -T payload.json "https://api.vercel.com/v13/deployments/dpl_123"',
      'wget --method=POST "https://api.vercel.com/v13/deployments"',
      "bash -c 'curl -X POST https://api.vercel.com/v13/deployments'",
      'curl -X GET --request POST "https://api.vercel.com/v13/deployments"',
      'curl -XGET --request=POST "https://api.vercel.com/v13/deployments"',
    ]) {
      expect(
        automationSurfaceHasVercelRestMutation({
          id: 'synthetic:vercel-rest-curl-mutation',
          content: command,
          dialect: 'posix',
          language: 'shell',
        })
      ).toBe(true);
    }
    expect(
      automationSurfaceHasVercelRestMutation({
        id: 'synthetic:vercel-rest-post',
        content:
          "fetch('https://api.vercel.com/v13/deployments', { method: 'POST', body: payload });",
        language: 'javascript',
      })
    ).toBe(true);
    expect(
      automationSurfaceHasVercelRestMutation({
        id: 'synthetic:vercel-rest-get',
        content: 'curl "https://api.vercel.com/v13/deployments/dpl_123"',
        dialect: 'posix',
        language: 'shell',
      })
    ).toBe(false);
    expect(
      automationSurfaceHasVercelRestMutation({
        id: 'synthetic:vercel-rest-curl-forced-get',
        content: 'curl -G --data "teamId=team_123" "https://api.vercel.com/v13/deployments"',
        dialect: 'posix',
        language: 'shell',
      })
    ).toBe(false);
    for (const command of [
      'curl --request POST -X GET "https://api.vercel.com/v13/deployments"',
      'curl --request=POST -XGET "https://api.vercel.com/v13/deployments"',
    ]) {
      expect(
        automationSurfaceHasVercelRestMutation({
          id: 'synthetic:vercel-rest-curl-last-request-wins',
          content: command,
          dialect: 'posix',
          language: 'shell',
        })
      ).toBe(false);
    }
    expect(
      automationSurfaceHasVercelRestMutation({
        id: 'synthetic:vercel-rest-powershell',
        content: "Invoke-RestMethod -Uri 'https://api.vercel.com/v13/deployments' -Method POST",
        dialect: 'powershell',
        language: 'shell',
      })
    ).toBe(true);
    expect(
      automationSurfaceHasVercelRestMutation({
        id: 'synthetic:vercel-rest-axios',
        content: [
          "import axios from 'axios';",
          "axios.patch('https://api.vercel.com/v13/deployments/dpl_123', payload);",
        ].join('\n'),
        language: 'javascript',
      })
    ).toBe(true);
    expect(
      automationSurfaceHasVercelRestMutation({
        id: 'synthetic:vercel-rest-child-process',
        content: [
          "import { execSync } from 'node:child_process';",
          "execSync('curl -X POST https://api.vercel.com/v13/deployments');",
        ].join('\n'),
        language: 'javascript',
      })
    ).toBe(true);
    expect(
      automationSurfaceHasVercelRestMutation({
        id: 'synthetic:vercel-rest-global-fetch',
        content: "globalThis.fetch('https://api.vercel.com/v13/deployments', { method: 'POST' });",
        language: 'javascript',
      })
    ).toBe(true);
    expect(
      automationSurfaceHasVercelRestMutation({
        id: 'synthetic:fake-axios',
        content: [
          'const axios = { patch: () => undefined };',
          "axios.patch('https://api.vercel.com/v13/deployments/dpl_123', payload);",
        ].join('\n'),
        language: 'javascript',
      })
    ).toBe(false);
    expect(
      automationSurfaceHasVercelRestMutation({
        id: 'synthetic:vercel-rest-echo',
        content: 'echo \'curl -X POST "https://api.vercel.com/v13/deployments"\'',
        dialect: 'posix',
        language: 'shell',
      })
    ).toBe(false);
    expect(
      automationSurfaceHasVercelRestMutation({
        id: 'synthetic:vercel-rest-python-dynamic-method',
        content: [
          'import requests',
          'requests.request(runtime_method, "https://api.vercel.com/v13/deployments")',
        ].join('\n'),
        language: 'python',
      })
    ).toBe(true);
    expect(
      automationSurfaceHasVercelRestMutation({
        id: 'synthetic:configured-axios',
        content: [
          "import axios from 'axios';",
          'const client = axios.create();',
          "client.post('https://api.vercel.com/v13/deployments', payload);",
        ].join('\n'),
        language: 'javascript',
      })
    ).toBe(true);
    expect(
      automationSurfaceHasVercelRestMutation({
        id: 'synthetic:axios-request',
        content: [
          "import axios from 'axios';",
          "axios.request({ url: 'https://api.vercel.com/v13/deployments', method: 'POST' });",
        ].join('\n'),
        language: 'javascript',
      })
    ).toBe(true);
    expect(
      automationSurfaceHasVercelRestMutation({
        id: 'synthetic:node-https-request',
        content: [
          "import https from 'node:https';",
          "https.request('https://api.vercel.com/v13/deployments', { method: 'POST' });",
        ].join('\n'),
        language: 'javascript',
      })
    ).toBe(true);
    expect(
      automationSurfaceHasVercelRestMutation({
        id: 'synthetic:node-https-options-request',
        content: [
          "import https from 'node:https';",
          "https.request({ url: 'https://api.vercel.com/v13/deployments', method: 'POST' });",
        ].join('\n'),
        language: 'javascript',
      })
    ).toBe(true);
    expect(
      automationSurfaceHasVercelRestMutation({
        id: 'synthetic:node-https-hostname-request',
        content: [
          "import https from 'node:https';",
          "https.request({ hostname: 'api.vercel.com', path: '/v13/deployments', method: 'POST' });",
        ].join('\n'),
        language: 'javascript',
      })
    ).toBe(true);
    expect(
      automationSurfaceHasVercelRestMutation({
        id: 'synthetic:undici-request',
        content: [
          "import { request } from 'undici';",
          "request('https://api.vercel.com/v13/deployments', { method: 'POST' });",
        ].join('\n'),
        language: 'javascript',
      })
    ).toBe(true);
    expect(
      automationSurfaceHasVercelRestMutation({
        id: 'synthetic:undici-client-request',
        content: [
          "import { Client } from 'undici';",
          "const client = new Client('https://api.vercel.com');",
          "client.request({ path: '/v13/deployments', method: 'POST' });",
        ].join('\n'),
        language: 'javascript',
      })
    ).toBe(true);
    expect(
      automationSurfaceHasVercelRestMutation({
        id: 'synthetic:node-fetch-post',
        content: [
          "import fetch from 'node-fetch';",
          "fetch('https://api.vercel.com/v13/deployments', { method: 'POST' });",
        ].join('\n'),
        language: 'javascript',
      })
    ).toBe(true);
    expect(
      automationSurfaceHasVercelRestMutation({
        id: 'synthetic:configured-axios-base-url',
        content: [
          "import axios from 'axios';",
          "const client = axios.create({ baseURL: 'https://api.vercel.com' });",
          "client.post('/v13/deployments', payload);",
        ].join('\n'),
        language: 'javascript',
      })
    ).toBe(true);
    expect(
      automationSurfaceHasVercelRestMutation({
        id: 'synthetic:configured-axios-base-url-get',
        content: [
          "import axios from 'axios';",
          "const client = axios.create({ baseURL: 'https://api.vercel.com' });",
          "client.get('/v13/deployments');",
        ].join('\n'),
        language: 'javascript',
      })
    ).toBe(false);
    expect(
      automationSurfaceHasVercelRestMutation({
        id: 'synthetic:vercel-rest-js-dynamic-method',
        content: "fetch('https://api.vercel.com/v13/deployments', { method: runtimeMethod });",
        language: 'javascript',
      })
    ).toBe(true);
    expect(
      automationSurfaceHasVercelRestMutation({
        id: 'synthetic:vercel-rest-js-spread-after-get',
        content:
          "fetch('https://api.vercel.com/v13/deployments', { method: 'GET', ...runtimeOptions });",
        language: 'javascript',
      })
    ).toBe(true);
    expect(
      automationSurfaceHasVercelRestMutation({
        id: 'synthetic:vercel-rest-js-duplicate-method',
        content:
          "fetch('https://api.vercel.com/v13/deployments', { method: 'GET', method: 'POST' });",
        language: 'javascript',
      })
    ).toBe(true);
    expect(
      automationSurfaceHasVercelRestMutation({
        id: 'synthetic:vercel-rest-js-overridden-spread',
        content:
          "fetch('https://api.vercel.com/v13/deployments', { ...runtimeOptions, method: 'GET' });",
        language: 'javascript',
      })
    ).toBe(false);
    expect(
      automationSurfaceHasVercelRestMutation({
        id: 'synthetic:vercel-rest-python-subprocess',
        content: [
          'import subprocess',
          'subprocess.run(["curl", "-X", "POST", "https://api.vercel.com/v13/deployments"])',
        ].join('\n'),
        language: 'python',
      })
    ).toBe(true);
    expect(
      automationSurfaceHasVercelRestMutation({
        id: 'synthetic:vercel-rest-python-const-url',
        content: [
          'import requests',
          'URL = "https://api.vercel.com/v13/deployments"',
          'requests.post(URL, json=payload)',
        ].join('\n'),
        language: 'python',
      })
    ).toBe(true);
    expect(
      automationSurfaceHasVercelRestMutation({
        id: 'synthetic:vercel-rest-js-inert',
        content: [
          "// fetch('https://api.vercel.com/v13/deployments', { method: 'POST' });",
          "const example = \"fetch('https://api.vercel.com', { method: 'POST' })\";",
          "fetch('https://api.vercel.com/v13/deployments', { method: 'GET' });",
          "fetch('https://example.com', { method: 'POST' });",
        ].join('\n'),
        language: 'javascript',
      })
    ).toBe(false);
    expect(
      automationSurfaceHasVercelRestMutation({
        id: 'synthetic:vercel-rest-python-post',
        content:
          'import requests\nrequests.post("https://api.vercel.com/v13/deployments", json=payload)',
        language: 'python',
      })
    ).toBe(true);
    expect(
      automationSurfaceHasVercelRestMutation({
        id: 'synthetic:vercel-rest-python-direct-post',
        content: [
          'from requests import post',
          'API = "https://api.vercel.com/v13/deployments"',
          'post(API, json=payload)',
        ].join('\n'),
        language: 'python',
      })
    ).toBe(true);
    expect(
      automationSurfaceHasVercelRestMutation({
        id: 'synthetic:vercel-rest-python-urllib',
        content: [
          'import urllib.request',
          'API = "https://api.vercel.com/v13/deployments"',
          "request = urllib.request.Request(API, data=payload, method='POST')",
          'urllib.request.urlopen(request)',
        ].join('\n'),
        language: 'python',
      })
    ).toBe(true);
    expect(
      automationSurfaceHasVercelRestMutation({
        id: 'synthetic:vercel-rest-python-later-assignment',
        content: [
          'import requests',
          'requests.post(API, json=payload)',
          'API = "https://api.vercel.com/v13/deployments"',
        ].join('\n'),
        language: 'python',
      })
    ).toBe(false);
    expect(
      automationSurfaceHasVercelRestMutation({
        id: 'synthetic:vercel-rest-python-before-reassignment',
        content: [
          'import requests',
          'API = "https://api.vercel.com/v13/deployments"',
          'requests.post(API, json=payload)',
          'API = runtime_url',
        ].join('\n'),
        language: 'python',
      })
    ).toBe(true);
    expect(
      automationSurfaceHasVercelRestMutation({
        id: 'synthetic:vercel-rest-python-get',
        content: 'import httpx\nhttpx.get("https://api.vercel.com/v13/deployments")',
        language: 'python',
      })
    ).toBe(false);
    expect(
      automationSurfaceHasVercelRestMutation({
        id: 'synthetic:vercel-sdk-mutation',
        content: [
          "import { Vercel } from '@vercel/sdk';",
          'const client = new Vercel();',
          'client.deployments.createDeployment(payload);',
        ].join('\n'),
        language: 'javascript',
      })
    ).toBe(true);
    expect(
      automationSurfaceHasVercelRestMutation({
        id: 'synthetic:vercel-sdk-read-only',
        content: [
          "import { Vercel } from '@vercel/sdk';",
          'const client = new Vercel();',
          'client.deployments.listDeployments();',
        ].join('\n'),
        language: 'javascript',
      })
    ).toBe(false);
    expect(
      automationSurfaceHasVercelRestMutation({
        id: 'synthetic:vercel-sdk-destructured-mutator',
        content: [
          "import { Vercel } from '@vercel/sdk';",
          'const client = new Vercel();',
          'const { createDeployment } = client.deployments;',
          'createDeployment(payload);',
        ].join('\n'),
        language: 'javascript',
      })
    ).toBe(true);
    expect(
      automationSurfaceHasVercelRestMutation({
        id: 'synthetic:vercel-sdk-aliased-mutator',
        content: [
          "import { Vercel } from '@vercel/sdk';",
          'const client = new Vercel();',
          'const promote = client.deployments.promoteDeployment;',
          'promote(payload);',
        ].join('\n'),
        language: 'javascript',
      })
    ).toBe(true);
    expect(
      automationSurfaceHasVercelRestMutation({
        id: 'synthetic:vercel-sdk-unrelated-update',
        content: ["import { Vercel } from '@vercel/sdk';", 'database.update(record);'].join('\n'),
        language: 'javascript',
      })
    ).toBe(false);
  });

  it('rejects reachable GitHub branch-policy writers while allowing read-only evidence', async () => {
    for (const command of [
      'gh api repos/acme/updog/branches/main/protection -X PUT',
      'gh api repos/acme/updog/branches/main/protection --method PATCH',
      'gh api repos/acme/updog/branches/main/protection --method DELETE',
      'gh api repos/acme/updog/branches/main/protection --input protection.json',
      'gh api repos/acme/updog/branches/main/protection -f required_status_checks=true',
      'gh api repos/acme/updog/rulesets -F name=protected',
      'gh api repos/acme/updog/rulesets --field name=protected',
      'gh api repos/acme/updog/rulesets --raw-field name=protected',
    ]) {
      expect(
        automationSurfaceHasBranchPolicyMutation({
          id: 'synthetic:github-branch-policy-cli',
          content: command,
          dialect: 'posix',
          language: 'shell',
        })
      ).toBe(true);
    }

    for (const content of [
      [
        "import { Octokit } from '@octokit/rest';",
        'const octokit = new Octokit();',
        'octokit.rest.repos.updateBranchProtection({ owner: "acme", repo: "updog", branch: "main" });',
      ].join('\n'),
      [
        "import { Octokit } from '@octokit/rest';",
        'const octokit = new Octokit();',
        'octokit.graphql(`mutation { createBranchProtectionRule(input: {}) { clientMutationId } }`);',
      ].join('\n'),
      [
        "import { graphql } from '@octokit/graphql';",
        'graphql(`mutation { updateBranchProtectionRule(input: {}) { clientMutationId } }`);',
      ].join('\n'),
      [
        "import { graphql } from '@octokit/graphql';",
        'graphql(`mutation { deleteBranchProtectionRule(input: {}) { clientMutationId } }`);',
      ].join('\n'),
    ]) {
      expect(
        automationSurfaceHasBranchPolicyMutation({
          id: 'synthetic:github-branch-policy-octokit',
          content,
          language: 'javascript',
        })
      ).toBe(true);
    }

    expect(
      automationSurfaceHasBranchPolicyMutation({
        id: 'workflow-github-script:policy.yml#guard:0',
        content:
          'github.rest.repos.updateBranchProtection({ owner: "acme", repo: "updog", branch: "main" });',
        language: 'javascript',
      })
    ).toBe(true);

    for (const command of [
      'curl -X PUT https://api.github.com/repos/acme/updog/branches/main/protection',
      'curl --request PATCH https://api.github.com/repos/acme/updog/rulesets/1',
      'curl -X DELETE https://api.github.com/repos/acme/updog/rulesets/1',
      'curl --data name=protected https://api.github.com/repos/acme/updog/rulesets',
    ]) {
      expect(
        automationSurfaceHasBranchPolicyMutation({
          id: 'synthetic:github-branch-policy-http',
          content: command,
          dialect: 'posix',
          language: 'shell',
        })
      ).toBe(true);
    }

    for (const content of [
      "fetch('https://api.github.com/repos/acme/updog/branches/main/protection', { method: 'PATCH' });",
      [
        "import axios from 'axios';",
        "axios.put('https://api.github.com/repos/acme/updog/rulesets/1', payload);",
      ].join('\n'),
      [
        "import https from 'node:https';",
        "https.request('https://api.github.com/repos/acme/updog/rulesets/1', { method: 'DELETE' });",
      ].join('\n'),
    ]) {
      expect(
        automationSurfaceHasBranchPolicyMutation({
          id: 'synthetic:github-branch-policy-http-client',
          content,
          language: 'javascript',
        })
      ).toBe(true);
    }

    for (const surface of [
      {
        id: 'action:green-scoreboard#0',
        content: 'curl -X PUT https://api.github.com/repos/acme/updog/branches/main/protection',
        dialect: 'posix' as const,
        language: 'shell' as const,
      },
      {
        id: 'package:package.json#release:check',
        content: 'curl --data name=protected https://api.github.com/repos/acme/updog/rulesets',
        dialect: 'posix' as const,
        language: 'shell' as const,
      },
    ]) {
      expect(automationSurfaceHasBranchPolicyMutation(surface)).toBe(true);
    }

    for (const command of [
      'gh api repos/acme/updog/branches/main/protection',
      'gh api repos/acme/updog/branches/main/protection --method GET',
      'gh api repos/acme/updog/rulesets -X GET',
      'curl --head https://api.github.com/repos/acme/updog/branches/main/protection',
    ]) {
      expect(
        automationSurfaceHasBranchPolicyMutation({
          id: 'synthetic:github-branch-policy-read',
          content: command,
          dialect: 'posix',
          language: 'shell',
        })
      ).toBe(false);
    }

    expect(
      automationSurfaceHasBranchPolicyMutation({
        id: 'synthetic:github-branch-policy-fetch-read',
        content: "fetch('https://api.github.com/repos/acme/updog/rulesets/1', { method: 'GET' });",
        language: 'javascript',
      })
    ).toBe(false);

    const releaseProof = await readFile(
      path.join(process.cwd(), '.github', 'workflows', 'release-proof.yml'),
      'utf8'
    );
    expect(
      automationSurfaceHasBranchPolicyMutation({
        id: 'workflow:release-proof.yml#release-proof:branch-protection',
        content: releaseProof,
        dialect: 'posix',
        language: 'shell',
      })
    ).toBe(false);

    const telemetry = await readFile(
      path.join(process.cwd(), 'scripts', 'ci-live-telemetry.mjs'),
      'utf8'
    );
    expect(
      automationSurfaceHasBranchPolicyMutation({
        id: 'operator:scripts/ci-live-telemetry.mjs',
        content: telemetry,
        language: 'javascript',
      })
    ).toBe(false);
  });

  it('keeps ordinary scripts and workflows free of branch-policy writers and writer callers', async () => {
    await expect(
      access(path.join(process.cwd(), 'scripts', 'update-branch-protection.js'))
    ).rejects.toThrow();

    const branchPolicySurfaces = await collectOrdinaryBranchPolicySurfaces();
    expect(
      branchPolicySurfaces.some((surface) => surface.id === 'action:green-scoreboard/action.yml#0')
    ).toBe(true);
    expect(
      branchPolicySurfaces.some((surface) => surface.id === 'package:package.json#release:check')
    ).toBe(true);

    const branchPolicyMutations = branchPolicySurfaces
      .filter(automationSurfaceHasBranchPolicyMutation)
      .map((surface) => surface.id);
    expect(branchPolicyMutations).toEqual([]);

    const ordinaryAutomationPaths = (await listRepositoryFiles()).filter(
      (filePath) =>
        /^\.github\/workflows\/[^/]+\.ya?ml$/.test(filePath) ||
        (filePath.startsWith('scripts/') &&
          AUTOMATION_SOURCE_EXTENSIONS.has(path.extname(filePath)))
    );
    const writerCallers = (
      await Promise.all(
        ordinaryAutomationPaths.map(async (filePath) => ({
          filePath,
          content: await readFile(path.join(process.cwd(), filePath), 'utf8'),
        }))
      )
    )
      .filter(({ content }) => /(?:^|[/\\])update-branch-protection(?:\.js)?\b/.test(content))
      .map(({ filePath }) => filePath);
    expect(writerCallers).toEqual([]);
  });

  it('keeps retired production mutation routes unreachable', async () => {
    const retiredPaths = [
      '.github/workflows/task11-prod-closeout-once.yml',
      'deploy.sh',
      'launch-script.sh',
      'pilot.sh',
      'scripts/canary-deploy.mjs',
      'scripts/rollback.mjs',
      'scripts/apply-scenario-drift-migrations.mjs',
      'scripts/phase2-slice3-audit.mjs',
      'scripts/database/setup-rls-infrastructure.sh',
      'scripts/normalize-stages.ts',
      'scripts/normalize-stages-batched.ts',
      'scripts/cold-storage/export-to-s3.sh',
    ];

    await Promise.all(
      retiredPaths.map((filePath) =>
        expect(access(path.join(process.cwd(), filePath))).rejects.toThrow()
      )
    );

    const packageJson = JSON.parse(
      await readFile(path.join(process.cwd(), 'package.json'), 'utf8')
    ) as { scripts?: Record<string, string> };
    const commands = Object.values(packageJson.scripts ?? {}).join('\n');
    for (const retiredPath of retiredPaths) {
      expect(commands).not.toContain(retiredPath);
    }
  });

  it('keeps ACTIVE guides from referencing retired mutation routes', async () => {
    const retiredMutationPaths = [
      'scripts/normalize-stages.ts',
      'scripts/normalize-stages-batched.ts',
    ];
    const { stdout } = await execFileAsync('git', ['ls-files', 'docs']);
    const markdownPaths = stdout.split(/\r?\n/).filter((filePath) => filePath.endsWith('.md'));
    const violations: string[] = [];

    for (const filePath of markdownPaths) {
      const content = await readFile(path.join(process.cwd(), filePath), 'utf8');
      if (!/^---\r?\nstatus:\s*ACTIVE\s*$/m.test(content)) continue;
      if (retiredMutationPaths.some((retiredPath) => content.includes(retiredPath))) {
        violations.push(filePath);
      }
    }

    expect(violations).toEqual([]);
  });

  it.each([
    ['GitHub CLI workflow dispatch', 'gh workflow run release-production.yml \\\n  --ref main'],
    [
      'GitHub workflow dispatch API',
      'gh api --method POST "repos/${REPO}/actions/workflows/release-production.yml/dispatches"',
    ],
    [
      'GitHub workflow dispatch API with endpoint before method',
      'gh api "repos/${REPO}/actions/workflows/release-production.yml/dispatches" --method POST',
    ],
    [
      'GitHub workflow dispatch API with short method flag',
      'gh api -X POST "repos/${REPO}/actions/workflows/release-production.yml/dispatches"',
    ],
  ])('recognizes %s as governed release delegation', (_caseName, run) => {
    const workflow: Workflow = { jobs: { dispatch: { steps: [{ run }] } } };
    expect(callsReleaseWorkflow(workflow)).toBe(true);
  });

  it.each([
    ['echoed CLI command', 'echo gh workflow run release-production.yml'],
    [
      'echoed dispatch endpoint',
      'echo POST repos/x/actions/workflows/release-production.yml/dispatches',
    ],
    ['commented CLI command', '# gh workflow run release-production.yml'],
    ['inline commented CLI command', 'echo safe # gh workflow run release-production.yml'],
    [
      'unrelated POST command',
      'POST gh api repos/x/actions/workflows/release-production.yml/dispatches',
    ],
  ])('rejects %s as governed release delegation', (_caseName, run) => {
    const workflow: Workflow = { jobs: { inert: { steps: [{ run }] } } };
    expect(callsReleaseWorkflow(workflow)).toBe(false);
  });

  it('does not treat release run lookup as governed release delegation', () => {
    const workflow: Workflow = {
      jobs: {
        lookup: {
          steps: [
            {
              run: 'gh api "repos/${REPO}/actions/workflows/release-production.yml/runs"',
            },
          ],
        },
      },
    };
    expect(callsReleaseWorkflow(workflow)).toBe(false);
  });

  it('rejects direct production movement even beside governed release delegation', () => {
    const workflow: Workflow = {
      jobs: {
        mixed: {
          steps: [
            { run: 'gh workflow run release-production.yml --ref main' },
            { run: 'npx vercel deploy --prod' },
          ],
        },
      },
    };

    expect(callsReleaseWorkflow(workflow)).toBe(true);
    expect(directProductionCommandScripts(workflow)).toEqual(['npx vercel deploy --prod']);
  });

  it('does not fall through from a failed unit or affected suite', async () => {
    const workflow = await readWorkflow('ci-unified.yml');
    const scripts = allRunScripts(workflow);

    expect(scripts.join('\n')).not.toMatch(/test:unit[^\n]*\|\|\s*npm run test:quick/);

    const affectedJob = workflow.jobs?.['test-affected'];
    const affectedScripts = (affectedJob?.steps ?? [])
      .flatMap((step) => (typeof step.run === 'string' ? [step.run] : []))
      .join('\n');
    expect(affectedScripts).not.toMatch(/npm run test:affected[^\n]*\|\|/);
    expect(affectedScripts).toContain('npm run test:affected:plan');
    expect(affectedScripts).toContain('npm run test:affected:run');
  });

  it('owns full unit coverage once while preserving affected and full integration gates', async () => {
    const workflow = await readWorkflow('ci-unified.yml');
    const checkMatrix = workflow.jobs?.check?.strategy?.matrix?.job;
    const fullMatrix = workflow.jobs?.['test-full']?.strategy?.matrix?.group;
    expect(checkMatrix).toEqual(['typecheck', 'lint', 'unit-fast']);
    expect(fullMatrix).toEqual(['integration', 'e2e', 'validate-core']);
    expect(workflow.jobs?.['test-affected']?.if).toContain(
      "needs.changes.outputs.schema != 'true'"
    );
    const affectedScript = (workflow.jobs?.['test-affected']?.steps ?? [])
      .flatMap((step) => (typeof step.run === 'string' ? [step.run] : []))
      .join('\n');
    expect(affectedScript).toContain('npm run test:affected:run -- --skip-unit');
    expect(affectedScript).not.toMatch(/full_fallback\)[\s\S]*npm run test:unit/);
    const fullScript = (workflow.jobs?.['test-full']?.steps ?? [])
      .flatMap((step) => (typeof step.run === 'string' ? [step.run] : []))
      .join('\n');
    expect(fullScript).not.toMatch(/unit\)\s*npm run test:unit/);
  });

  it('does not mask bundle-budget failures', async () => {
    const workflow = await readWorkflow('ci-unified.yml');
    const scripts = allRunScripts(workflow).join('\n');

    expect(scripts).not.toMatch(/npm run bundle:check\s*\|\|\s*true/);
    expect(scripts).toContain('npm run bundle:check');
  });

  it('does not downgrade governance failures to comments', async () => {
    const workflow = await readWorkflow('ci-unified.yml');
    const flagsGuard = workflow.jobs?.guards?.steps?.find(
      (step) => step.name === 'Feature flags guard'
    );

    expect(flagsGuard).toBeDefined();
    expect(flagsGuard).not.toHaveProperty('continue-on-error', true);
  });

  it('does not let advisory PR comments override the validated gate result', async () => {
    const workflow = await readWorkflow('ci-unified.yml');
    const gateSteps = workflow.jobs?.gate?.steps ?? [];
    const determineGateStatus = gateSteps.find((step) => step.name === 'Determine gate status');
    const commentPrStatus = gateSteps.find((step) => step.name === 'Comment PR status');

    expect(determineGateStatus).toBeDefined();
    expect(determineGateStatus).not.toHaveProperty('continue-on-error', true);
    expect(commentPrStatus).toBeDefined();
    expect(commentPrStatus).toHaveProperty('continue-on-error', true);
    // #1159 only made this advisory; the retro also requires bounded retries so a
    // transient 5xx is absorbed rather than merely swallowed.
    expect(hasBoundedRetries(commentPrStatus)).toBe(true);
  });

  it('makes critical and high Trivy findings blocking', async () => {
    const workflow = await readWorkflow('ci-unified.yml');
    const requiredSecurityJob = workflow.jobs?.['pr-light-security'];
    const trivySteps = (requiredSecurityJob?.steps ?? []).filter((step) =>
      step.uses?.includes('aquasecurity/trivy-action')
    );

    expect(trivySteps).toHaveLength(2);
    expect(trivySteps.map((step) => step.with?.['scan-type'])).toEqual(['fs', 'image']);
    for (const step of trivySteps) {
      expect(String(step.with?.severity)).toBe('CRITICAL,HIGH');
      expect(String(step.with?.['exit-code'])).toBe('1');
    }

    const gateNeeds = workflow.jobs?.gate?.needs;
    const normalizedNeeds = typeof gateNeeds === 'string' ? [gateNeeds] : (gateNeeds ?? []);
    expect(normalizedNeeds).toContain('pr-light-security');
  });

  it('keeps npm audit blocking without coupling OWASP to its upstream availability', async () => {
    const ciWorkflow = await readWorkflow('ci-unified.yml');
    const requiredSecurityJob = ciWorkflow.jobs?.['pr-light-security'];
    const productionAudit = requiredSecurityJob?.steps?.find(
      (step) => step.name === 'Production dependency audit'
    );

    expect(productionAudit?.run).toContain('npm audit --omit=dev --audit-level=high');

    const deepScanWorkflow = await readWorkflow('security-scan.yml');
    const dependencyCheck = deepScanWorkflow.jobs?.['dependency-check']?.steps?.find(
      (step) => step.name === 'OWASP Dependency-Check'
    );
    expect(String(dependencyCheck?.with?.args)).toContain('--disableNodeAudit');

    const deepScanNeeds = deepScanWorkflow.jobs?.['security-scan']?.needs;
    const normalizedDeepScanNeeds =
      typeof deepScanNeeds === 'string' ? [deepScanNeeds] : (deepScanNeeds ?? []);
    expect(normalizedDeepScanNeeds).toContain('dependency-check');
  });

  it('runs Security Deep Scan fully only for relevant paths or explicit full-scan events', async () => {
    const workflow = await readWorkflow('security-scan.yml');
    const changes = workflow.jobs?.changes;
    expect(changes?.outputs?.security_relevant).toBe(
      "${{ github.event_name == 'schedule' || github.event_name == 'workflow_dispatch' || steps.filter.outputs.security_relevant == 'true' }}"
    );
    for (const jobName of [
      'filesystem-scan',
      'container-scan',
      'license-check',
      'dependency-check',
      'sbom',
    ]) {
      expect(workflow.jobs?.[jobName]?.if).toBe(
        "needs.changes.outputs.security_relevant == 'true'"
      );
    }
    const aggregate = workflow.jobs?.['security-scan'];
    expect(aggregate?.if).toBe('always()');
    expect(normalizeNeeds(aggregate?.needs)).toEqual(
      expect.arrayContaining([
        'changes',
        'filesystem-scan',
        'container-scan',
        'license-check',
        'dependency-check',
        'sbom',
      ])
    );
    const aggregateScript = (aggregate?.steps ?? [])
      .flatMap((step) => (typeof step.run === 'string' ? [step.run] : []))
      .join('\n');
    expect(aggregateScript).toContain('Change detection failed');
    expect(aggregateScript).toContain('security deep scan skipped');
  });

  it('runs secret scanning inside the required CI aggregator', async () => {
    const secretWorkflowPath = path.join(workflowsDir, 'secret-scan.yml');
    await expect(access(secretWorkflowPath)).resolves.toBeUndefined();

    const workflow = await readWorkflow('ci-unified.yml');
    expect(workflow.jobs?.['secret-scan']?.uses).toBe('./.github/workflows/secret-scan.yml');

    const gateNeeds = workflow.jobs?.gate?.needs;
    const normalizedNeeds = typeof gateNeeds === 'string' ? [gateNeeds] : (gateNeeds ?? []);
    expect(normalizedNeeds).toContain('secret-scan');
  });

  it('reuses generic CI gates only in the upstream-gated static release diagnostic', async () => {
    const ciWorkflow = await readWorkflow('ci-unified.yml');
    const staticJob = ciWorkflow.jobs?.['release-static'];
    const staticScripts = (staticJob?.steps ?? [])
      .flatMap((step) => (typeof step.run === 'string' ? [step.run] : []))
      .join('\n');
    expect(normalizeNeeds(staticJob?.needs)).toEqual(
      expect.arrayContaining(['changes', 'check', 'build'])
    );
    expect(staticScripts).toContain('npm run release:check -- --skip-db --reuse-ci-gates');
    expect(staticScripts).toContain('npx playwright install --with-deps chromium');

    const gateNeeds = ciWorkflow.jobs?.gate?.needs;
    const normalizedGateNeeds = typeof gateNeeds === 'string' ? [gateNeeds] : (gateNeeds ?? []);
    expect(normalizedGateNeeds).toEqual(
      expect.arrayContaining(['release-static', 'check', 'build'])
    );

    const fullWorkflow = await readWorkflow('release-proof.yml');
    const fullScripts = allRunScripts(fullWorkflow).join('\n');
    expect(fullScripts).toContain('npm run release:check');
    expect(fullScripts).not.toContain('--skip-db');
    expect(fullScripts).not.toContain('--reuse-ci-gates');
  });

  it('fails closed on exact-SHA and provider identity proof before promotion', async () => {
    const proofWorkflow = await readWorkflow('release-proof.yml');
    expect(proofWorkflow.permissions).toEqual({
      actions: 'read',
      checks: 'read',
      contents: 'read',
      statuses: 'read',
    });
    expect(proofWorkflow.jobs?.['provider-identity']?.environment).toBe('Production');
    expect(proofWorkflow.jobs?.['provider-identity']?.if).toContain(
      'inputs.require_provider_identity == true'
    );
    expect(proofWorkflow.jobs?.['g3-exact-sha-verdict']?.if).toBe('${{ always() }}');
    expect(normalizeNeeds(proofWorkflow.jobs?.['g3-exact-sha-verdict']?.needs)).toEqual([
      'full-release-proof',
      'provider-identity',
    ]);
    const proofScripts = allRunScripts(proofWorkflow).join('\n');
    expect(proofScripts).toContain(
      'boot-proof.mjs --require-g3 --output "$RUNNER_TEMP/g3-boot-proofs.json"'
    );
    expect(proofScripts).toContain('verify-g3-boot-proofs.mjs');
    expect(proofScripts).toContain('verify-exact-sha-checks.mjs');
    expect(proofScripts).toContain('verify-provider-identity.mjs');
    expect(proofScripts).toContain("deployment.target === 'production'");
    expect(proofScripts).toContain('(deployment.alias ?? []).length === 0');
    expect(proofWorkflow.jobs?.['g3-exact-sha-verdict']?.name).toBe('G3 Exact-SHA Verdict');
    expect(proofScripts).toMatch(/branch protection/i);
    expect(proofScripts).not.toContain('private endpoint proof');
    expect(proofScripts).toContain('npx playwright install --with-deps chromium');
    expect(proofScripts).toContain('Project-Access-Token: ${RAILWAY_TOKEN}');
    expect(proofScripts).toContain('https://backboard.railway.com/graphql/v2');
    expect(proofScripts).toContain('projectToken { project { id } environment { id } }');
    expect(proofScripts).toContain('environment(id: $environmentId, projectId: $projectId)');
    expect(proofScripts).toContain('serviceInstances(first: 100)');
    expect(proofScripts).toContain('hasNextPage');
    expect(proofScripts).not.toContain('backboard.railway.app');
    expect(proofScripts).not.toContain('me {');
    const strictBootStep = proofWorkflow.jobs?.['full-release-proof']?.steps?.find(
      (step) => step.name === 'Run strict Vercel boot proof'
    );
    expect(strictBootStep?.env?.VERCEL_TOKEN).toBe('${{ secrets.VERCEL_TOKEN }}');
    expect(strictBootStep?.env?.VERCEL_ORG_ID).toBe('${{ vars.VERCEL_ORG_ID }}');
    expect(strictBootStep?.env?.VERCEL_PROJECT_ID).toBe('${{ vars.VERCEL_PROJECT_ID }}');
    expect(strictBootStep?.run).toContain('VERCEL_TOKEN is required for strict Vercel build proof');
    const localEvidenceStep = proofWorkflow.jobs?.['full-release-proof']?.steps?.find(
      (step) => step.name === 'Run exact local and matrix evidence'
    );
    expect(localEvidenceStep?.env).not.toHaveProperty('VERCEL_TOKEN');
    expect(localEvidenceStep?.env).not.toHaveProperty('VERCEL_ORG_ID');
    expect(localEvidenceStep?.env).not.toHaveProperty('VERCEL_PROJECT_ID');
    const verifyBootStep = proofWorkflow.jobs?.['full-release-proof']?.steps?.find(
      (step) => step.name === 'Verify strict boot proof'
    );
    expect(verifyBootStep?.env).not.toHaveProperty('VERCEL_TOKEN');

    const releaseWorkflow = await readWorkflow('release-production.yml');
    const releaseProof = releaseWorkflow.jobs?.['release-proof'];
    // Source/local proof must finish before the candidate exists. Provider
    // identity is proved only after stage-production creates its exact URL.
    expect(releaseProof?.with?.require_provider_identity).toBe(false);
    expect(releaseProof?.secrets).toBe('inherit');
    expect(normalizeNeeds(releaseWorkflow.jobs?.promote?.needs)).toContain('staged-smoke');
    expect(normalizeNeeds(releaseWorkflow.jobs?.promote?.needs)).toContain(
      'staged-provider-identity'
    );
    const stagedProviderScripts = allRunScripts({
      jobs: { staged: releaseWorkflow.jobs?.['staged-provider-identity'] ?? {} },
    }).join('\n');
    expect(normalizeNeeds(releaseWorkflow.jobs?.['staged-provider-identity']?.needs)).toEqual([
      'validate-deployment',
    ]);
    expect(stagedProviderScripts).toContain('verify-provider-identity.mjs');
    expect(stagedProviderScripts).toContain('staged-railway-evidence.json');
    expect(stagedProviderScripts).toContain('Project-Access-Token: ${RAILWAY_TOKEN}');
    expect(stagedProviderScripts).toContain('https://backboard.railway.com/graphql/v2');
    expect(stagedProviderScripts.indexOf('const url = new URL')).toBeLessThan(
      stagedProviderScripts.indexOf('x-vercel-protection-bypass')
    );
    const g4OperatorHardStop = releaseWorkflow.jobs?.['g4-operator-evidence-hard-stop'];
    expect(normalizeNeeds(g4OperatorHardStop?.needs)).toEqual(['staged-provider-identity']);
    expect(g4OperatorHardStop?.['continue-on-error']).toBeUndefined();
    expect(g4OperatorHardStop?.if).toBeUndefined();
    const g4HardStopScripts = allRunScripts({
      jobs: { hardStop: g4OperatorHardStop ?? {} },
    }).join('\n');
    expect(g4HardStopScripts).toContain('Task13');
    expect(g4HardStopScripts).toContain('attested operator /health and /ready evidence');
    expect(g4HardStopScripts).toContain('operator-mode verification');
    expect(g4HardStopScripts).toContain('exit 1');
    expect(normalizeNeeds(releaseWorkflow.jobs?.promote?.needs)).toContain(
      'g4-operator-evidence-hard-stop'
    );
    expect(normalizeNeeds(releaseWorkflow.jobs?.['stage-production']?.needs)).toContain(
      'schema-audit'
    );

    const releaseCheck = await readFile(
      path.join(process.cwd(), 'scripts', 'release-check.mjs'),
      'utf8'
    );
    expect(releaseCheck).not.toMatch(/api\.github\.com|api\.vercel\.com|railway\.app/i);
  });

  it('governs manual journaled production schema recovery at exact current main', async () => {
    const workflow = await readWorkflow('prod-journaled-migrate-0045-0049.yml');
    const scripts = allRunScripts(workflow).join('\n');
    const dispatch = workflow.on?.workflow_dispatch as
      | {
          inputs?: Record<
            string,
            {
              default?: string;
              options?: string[];
              required?: boolean;
              type?: string;
            }
          >;
        }
      | undefined;

    expect(Object.keys(workflow.on ?? {})).toEqual(['workflow_dispatch']);
    expect(dispatch?.inputs?.expected_sha?.required).toBe(true);
    expect(dispatch?.inputs?.mode).toMatchObject({
      default: 'audit',
      options: ['audit', 'apply'],
      type: 'choice',
    });
    expect(dispatch?.inputs?.restore_point_reference?.required).toBe(true);
    expect(workflow.jobs?.recover?.environment).toBe('production-schema');

    expect(scripts).toContain('node scripts/run-prod-journaled-migrations.mjs');
    expect(scripts).toContain('node scripts/run-prod-journaled-migrations.mjs --apply --yes');
    expect(scripts).toContain('refs/heads/main');
    expect(scripts).toContain('GITHUB_SHA');
    expect(scripts).toContain('repos/${REPO}/commits/main');
    expect(scripts).toContain('READ_ONLY_AUDIT');
    expect(scripts).toContain('reports/recovery.raw');
    expect(scripts).toContain(
      's/^Target database: .* user=.*/Target database: [REDACTED] user=[REDACTED]/'
    );
    expect(scripts).toContain('s#postgres(ql)?://[^[:space:]]+#[REDACTED_DATABASE_URL]#g');
    expect(scripts).toContain('rm reports/recovery.raw');
    expect(scripts).not.toContain('release-production.yml');
    expect(scripts).not.toContain('vercel promote');

    const checkout = workflow.jobs?.recover?.steps?.find((step) =>
      step.uses?.startsWith('actions/checkout@')
    );
    expect(checkout?.uses).toBe('actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0');
    expect(checkout?.with?.ref).toBe('${{ inputs.expected_sha }}');

    const setupNode = workflow.jobs?.recover?.steps?.find((step) =>
      step.uses?.startsWith('actions/setup-node@')
    );
    expect(setupNode?.uses).toBe('actions/setup-node@820762786026740c76f36085b0efc47a31fe5020');
    expect(setupNode?.with?.['node-version']).toBe('22.23.2');
    expect(scripts).toContain('npm install -g npm@10.9.2');
    expect(scripts).toContain('npm ci --prefer-offline --no-audit');

    const recoverySteps = workflow.jobs?.recover?.steps ?? [];
    const applyIndex = recoverySteps.findIndex((step) => step.name === 'Apply journaled recovery');
    expect(applyIndex).toBeGreaterThan(0);
    const applyFence = recoverySteps[applyIndex - 1];
    expect(applyFence?.name).toBe('Re-fence live main before recovery apply');
    expect(applyFence?.if).toBe("inputs.mode == 'apply'");
    expect(applyFence?.env?.EXPECTED_SHA).toBe('${{ inputs.expected_sha }}');
    expect(applyFence?.env?.GH_TOKEN).toBe('${{ github.token }}');
    expect(applyFence?.env?.REPO).toBe('${{ github.repository }}');
    expect(applyFence?.run).toContain('gh api "repos/${REPO}/commits/main" --jq \'.sha\'');
    expect(applyFence?.run).toContain('[[ ! "$LIVE_MAIN" =~ ^[0-9a-f]{40}$ ]]');
    expect(applyFence?.run).toContain('[[ "$LIVE_MAIN" != "$EXPECTED_SHA" ]]');

    const upload = workflow.jobs?.recover?.steps?.find((step) =>
      step.uses?.startsWith('actions/upload-artifact@')
    );
    expect(upload?.if).toBe('always()');
    expect(upload?.with?.path).toBe('reports/*.txt');
    expect(upload?.with?.['retention-days']).toBe(14);
  });

  // This guard intentionally scans every tracked automation surface. Under the
  // full Linux unit-fast shard, concurrent repository I/O can exceed Vitest's
  // 30-second default even though the same scan is fast in isolation.
  it('gates production promotion on a clean schema audit and authenticated smoke', async () => {
    const schemaWorkflow = await readWorkflow('prod-schema-reconcile.yml');
    const schemaScripts = allRunScripts(schemaWorkflow).join('\n');
    expect(schemaScripts).toContain('Production schema audit is clean.');

    const releaseWorkflow = await readWorkflow('release-production.yml');
    expect(Object.keys(releaseWorkflow.on ?? {})).toEqual(['workflow_dispatch']);

    const vercelConfig = JSON.parse(
      await readFile(path.join(process.cwd(), 'vercel.json'), 'utf8')
    ) as { github?: { autoAlias?: boolean }; installCommand?: string };
    expect(vercelConfig.github?.autoAlias).toBe(false);
    expect(vercelConfig.installCommand).toBe('npm ci --include=dev');

    const automationSurfaces = await collectAutomationSurfaces();
    expect(automationSurfaces.some((surface) => surface.id.startsWith('workflow:'))).toBe(true);
    expect(automationSurfaces.some((surface) => surface.id.startsWith('action:'))).toBe(true);
    expect(
      automationSurfaces.some((surface) => surface.id === 'package:package.json#vercel-build')
    ).toBe(true);
    expect(automationSurfaces.some((surface) => surface.id === 'operator:pilot.sh')).toBe(false);
    expect(automationSurfaces.some((surface) => surface.id === 'operator:server/index.ts')).toBe(
      true
    );
    expect(
      automationSurfaces.some((surface) => surface.id === 'operator:client/src/main.tsx')
    ).toBe(true);
    expect(
      automationSurfaces.some((surface) => surface.id === 'operator:scripts/deploy-production.ps1')
    ).toBe(true);
    expect(
      automationSurfaces.some(
        (surface) =>
          surface.id === 'operator:.husky/commit-msg' &&
          surface.language === 'shell' &&
          surface.dialect === 'posix'
      )
    ).toBe(true);
    expect(automationSurfaces.some((surface) => surface.id === 'operator:.husky/post-commit')).toBe(
      true
    );
    expect(automationSurfaces.some((surface) => surface.id === 'operator:.husky/pre-commit')).toBe(
      true
    );
    expect(automationSurfaces.some((surface) => surface.id.includes('HANDOFF'))).toBe(false);

    const ungovernedProductionCommands = automationSurfaces
      .filter((surface) => !surface.id.startsWith('workflow:release-production.yml#'))
      .filter(automationSurfaceHasProductionMutation)
      .map((surface) => surface.id);
    expect(ungovernedProductionCommands).toEqual([]);
    const ungovernedVercelRestMutations = automationSurfaces
      .filter((surface) => !surface.id.startsWith('workflow:release-production.yml#'))
      .filter(automationSurfaceHasVercelRestMutation)
      .map((surface) => surface.id);
    expect(ungovernedVercelRestMutations).toEqual([]);

    expect(Object.keys(releaseWorkflow.jobs ?? {})).toEqual([
      'production-mutation-block',
      'validate-target',
      'release-proof',
      'schema-audit',
      'stage-production',
      'validate-deployment',
      'staged-smoke',
      'staged-provider-identity',
      'g4-operator-evidence-hard-stop',
      'promote',
      'post-promotion-smoke',
    ]);
    const validateTarget = releaseWorkflow.jobs?.['validate-target'];
    expect(normalizeNeeds(validateTarget?.needs)).toEqual(['production-mutation-block']);
    expect(validateTarget?.outputs?.log_window_start).toBe(
      '${{ steps.target.outputs.log_window_start }}'
    );
    const validateTargetStep = validateTarget?.steps?.find(
      (step) => step.name === 'Require exact current main SHA'
    );
    expect(validateTargetStep?.id).toBe('target');
    expect(validateTargetStep?.run).toContain("log_window_start=$(date -u +'%Y-%m-%dT%H:%M:%SZ')");
    expect(normalizeNeeds(releaseWorkflow.jobs?.['release-proof']?.needs)).toEqual([
      'validate-target',
    ]);
    expect(normalizeNeeds(releaseWorkflow.jobs?.['schema-audit']?.needs)).toEqual([
      'release-proof',
    ]);
    expect(releaseWorkflow.jobs?.['schema-audit']?.uses).toBe(
      './.github/workflows/prod-schema-reconcile.yml'
    );
    const dispatchInputs = (
      releaseWorkflow.on?.workflow_dispatch as
        { inputs?: Record<string, { required?: boolean }> } | undefined
    )?.inputs;
    expect(dispatchInputs?.expected_sha?.required).toBe(true);
    expect(dispatchInputs?.deployment_url?.required).toBe(false);

    const stageProduction = releaseWorkflow.jobs?.['stage-production'];
    expect(normalizeNeeds(stageProduction?.needs)).toEqual(['schema-audit']);
    expect(stageProduction?.environment).toBe('Production');
    expect(stageProduction?.outputs?.deployment_url).toBe(
      '${{ steps.deploy.outputs.deployment_url }}'
    );
    const stageCheckout = stageProduction?.steps?.find((step) =>
      step.uses?.startsWith('actions/checkout@')
    );
    expect(stageCheckout?.uses).toBe('actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0');
    expect(stageCheckout?.with?.ref).toBe('${{ inputs.expected_sha }}');
    const stageNode = stageProduction?.steps?.find((step) =>
      step.uses?.startsWith('actions/setup-node@')
    );
    expect(stageNode?.uses).toBe('actions/setup-node@820762786026740c76f36085b0efc47a31fe5020');
    expect(stageNode?.with?.['node-version']).toBe('22.23.2');
    expect(stageNode?.with?.cache).toBeUndefined();
    const deployStep = stageProduction?.steps?.find(
      (step) => step.name === 'Create staged production deployment'
    );
    const stageDeployCommands = vercelCommandTokens(deployStep?.run ?? '');
    expect(stageDeployCommands).toHaveLength(2);
    expect(stageDeployCommands[0]).toEqual([
      'npx',
      '--yes',
      'vercel@55.0.0',
      'build',
      '--prod',
      '--yes',
    ]);
    expect(stageDeployCommands[1]).toContain('--prebuilt');
    expect(stageDeployCommands[1]).toContain('--prod');
    expect(stageDeployCommands[1]).toContain('--skip-domain');
    const stageScripts = allRunScripts({ jobs: { stage: stageProduction ?? {} } }).join('\n');
    expect(stageScripts).toContain('repos/${REPO}/commits/main');
    expect(stageScripts).toContain('git rev-parse HEAD');
    expect(stageScripts).toContain('vercel@55.0.0 build');
    expect(stageScripts).toContain('vercel@55.0.0 deploy');
    expect(stageScripts).toContain('--prebuilt');
    expect(stageScripts).toContain('--prod');
    expect(stageScripts).toContain('--skip-domain');
    expect(stageScripts).toContain('--yes');
    expect(stageScripts).toContain('--meta githubDeployment=1');
    expect(stageScripts).toContain('--meta githubCommitRef=main');
    expect(stageScripts).toContain('--meta "githubCommitSha=${EXPECTED_SHA}"');
    expect(stageScripts).not.toContain('--no-wait');
    expect(stageScripts).not.toMatch(/vercel(?:\s|@(?:latest|\^|~))/);
    expect(stageScripts).not.toContain('--token');
    expect(stageScripts).toContain('VERCEL_TOKEN is required');
    expect(stageScripts).toContain('VERCEL_ORG_ID is required');
    expect(stageScripts).toContain('VERCEL_PROJECT_ID is required');
    expect(stageScripts).toContain('GITHUB_OUTPUT');
    expect(stageScripts).toContain('Vercel deploy must return one bare HTTPS vercel.app');
    expect(deployStep?.env?.VERCEL_TOKEN).toBe('${{ secrets.VERCEL_TOKEN }}');
    expect(deployStep?.env?.VERCEL_ORG_ID).toBe('${{ vars.VERCEL_ORG_ID }}');
    expect(deployStep?.env?.VERCEL_PROJECT_ID).toBe('${{ vars.VERCEL_PROJECT_ID }}');

    const validateDeployment = releaseWorkflow.jobs?.['validate-deployment'];
    expect(normalizeNeeds(validateDeployment?.needs)).toEqual(['stage-production']);
    const identityStep = validateDeployment?.steps?.find(
      (step) => step.name === 'Normalize and verify exact staged deployment'
    );
    expect(identityStep?.env?.DEPLOYMENT_URL).toBe(
      '${{ needs.stage-production.outputs.deployment_url }}'
    );
    expect(identityStep?.run).toContain("deployment.meta?.githubDeployment === '1'");
    expect(identityStep?.run).toContain("deployment.readyState === 'READY'");
    expect(identityStep?.run).toContain("deployment.target === 'production'");
    expect(identityStep?.run).toContain('(deployment.alias ?? []).length === 0');
    expect(identityStep?.run).toContain('deployment.projectId === process.env.VERCEL_PROJECT_ID');
    expect(identityStep?.run).toContain(
      'deployment.meta?.githubCommitSha === process.env.EXPECTED_SHA'
    );
    expect(identityStep?.run).toContain("deployment.meta?.githubCommitRef === 'main'");
    expect(identityStep?.run).toContain('deploymentHost === requestedHost');
    expect(JSON.stringify(releaseWorkflow.jobs ?? {})).not.toContain('inputs.deployment_url');

    const stagedSmoke = releaseWorkflow.jobs?.['staged-smoke'];
    expect(normalizeNeeds(stagedSmoke?.needs)).toEqual(['validate-deployment']);
    const stagedSmokeStep = stagedSmoke?.steps?.find(
      (step) => step.name === 'Run authenticated staged smoke'
    );
    expect(stagedSmokeStep?.env?.PRODUCTION_URL).toBe(
      '${{ needs.validate-deployment.outputs.deployment_url }}'
    );
    expect(stagedSmokeStep?.env).toHaveProperty('VERCEL_AUTOMATION_BYPASS_SECRET');
    // Staged smoke probes RUM origin layers with the canonical production
    // origin — the ephemeral staged URL is correctly not allow-listed.
    expect(stagedSmokeStep?.env?.RUM_ALLOWED_ORIGIN).toBe('${{ vars.PRODUCTION_URL }}');
    const stagedCredentialGuard = stagedSmoke?.steps?.find(
      (step) => step.name === 'Require non-skippable smoke credentials'
    );
    expect(stagedCredentialGuard?.run).toContain('VERCEL_AUTOMATION_BYPASS_SECRET is required');
    expect(stagedCredentialGuard?.run).toContain('RUM_ALLOWED_ORIGIN is required');

    expect(normalizeNeeds(releaseWorkflow.jobs?.promote?.needs)).toEqual([
      'staged-smoke',
      'validate-deployment',
      'staged-provider-identity',
      'g4-operator-evidence-hard-stop',
    ]);
    const postPromotionSmoke = releaseWorkflow.jobs?.['post-promotion-smoke'];
    expect(normalizeNeeds(postPromotionSmoke?.needs)).toEqual(['promote', 'validate-target']);
    expect(JSON.stringify(postPromotionSmoke?.steps ?? [])).not.toContain(
      'VERCEL_AUTOMATION_BYPASS_SECRET'
    );
    const postPromotionSteps = postPromotionSmoke?.steps ?? [];
    const authenticatedSmokeIndex = postPromotionSteps.findIndex(
      (step) => step.name === 'Run authenticated production smoke'
    );
    const driverLogGateIndex = postPromotionSteps.findIndex(
      (step) => step.name === 'Require clean Vercel database-driver log window'
    );
    expect(driverLogGateIndex).toBeGreaterThan(authenticatedSmokeIndex);
    const driverLogGate = postPromotionSteps[driverLogGateIndex];
    expect(driverLogGate?.env?.LOG_WINDOW_START).toBe(
      '${{ needs.validate-target.outputs.log_window_start }}'
    );
    expect(driverLogGate?.env?.PRODUCTION_URL).toBe('${{ vars.PRODUCTION_URL }}');
    expect(driverLogGate?.env?.VERCEL_TOKEN).toBe('${{ secrets.VERCEL_TOKEN }}');
    expect(driverLogGate?.env?.VERCEL_ORG_ID).toBe('${{ vars.VERCEL_ORG_ID }}');
    expect(driverLogGate?.env?.VERCEL_PROJECT_ID).toBe('${{ vars.VERCEL_PROJECT_ID }}');
    expect(driverLogGate?.run).toContain('LOG_WINDOW_START is required');
    expect(driverLogGate?.run).toContain('PRODUCTION_URL is required');
    expect(driverLogGate?.run).toContain('VERCEL_TOKEN is required');
    expect(driverLogGate?.run).toContain('npx --yes vercel@55.0.0 logs "$PRODUCTION_URL"');
    expect(driverLogGate?.run).toContain('--environment production');
    expect(driverLogGate?.run).toContain('--since "$LOG_WINDOW_START"');
    expect(driverLogGate?.run).toContain('--json');
    expect(driverLogGate?.run).toContain('--no-color');
    expect(driverLogGate?.run).toContain('--no-follow');
    expect(driverLogGate?.run).toContain('--limit 1');
    expect(driverLogGate?.run).toContain('--query "$signature_query"');
    for (const signature of [
      'Neon pool error',
      'fetch failed',
      'No transactions support in neon-http driver',
    ]) {
      expect(driverLogGate?.run).toContain(`'"${signature}"'`);
    }
    const driverLogCommands = vercelCommandTokens(driverLogGate?.run ?? '').filter((tokens) =>
      tokens.includes('logs')
    );
    expect(driverLogCommands).toHaveLength(1);
    for (const tokens of driverLogCommands) {
      expect(tokens).toContain('--query');
      expect(tokens).toContain('--no-follow');
      expect(tokens[tokens.indexOf('--limit') + 1]).toBe('1');
    }
    expect(driverLogGate?.run).toContain('trap \'rm -f "$runtime_log"\' EXIT');
    expect(driverLogGate?.run).toContain(
      'node scripts/assert-vercel-driver-log-clean.mjs "$runtime_log"'
    );
    expect(JSON.stringify(postPromotionSmoke?.steps ?? [])).not.toContain('upload-artifact');

    const driverLogParserTest = await readFile(
      path.join(process.cwd(), 'tests/unit/scripts/assert-vercel-driver-log-clean.test.mjs'),
      'utf8'
    );
    expect(driverLogParserTest).toContain('Neon pool error');
    expect(driverLogParserTest).toContain('fetch failed');
    expect(driverLogParserTest).toContain('No transactions support in neon-http driver');

    const identityScripts = allRunScripts({
      jobs: { identity: releaseWorkflow.jobs?.['validate-deployment'] ?? {} },
    }).join('\n');
    expect(identityScripts).toContain('api.vercel.com/v13/deployments');
    expect(identityScripts).toContain('githubCommitSha');
    expect(identityScripts).toContain('GITHUB_OUTPUT');

    const releaseScripts = allRunScripts(releaseWorkflow).join('\n');
    expect(releaseScripts).toContain('vercel@55.0.0 promote');
    for (const tokens of vercelCommandTokens(releaseScripts)) {
      expect(tokens.some((token) => token === '--token' || token.startsWith('--token='))).toBe(
        false
      );
    }
    expect(releaseScripts).toContain('tests/smoke/production-boundaries.spec.ts');
    expect(releaseScripts).toContain('PROD_SMOKE_USERNAME');
    expect(releaseScripts).toContain('PROD_SMOKE_PASSWORD');
  }, 120_000);

  it('executes EXPECTED_SHA smoke guards fail-closed with hermetic npx', async () => {
    const releaseWorkflow = await readWorkflow('release-production.yml');
    const smokeSteps = [
      releaseWorkflow.jobs?.['staged-smoke']?.steps?.find(
        (step) => step.name === 'Run authenticated staged smoke'
      ),
      releaseWorkflow.jobs?.['post-promotion-smoke']?.steps?.find(
        (step) => step.name === 'Run authenticated production smoke'
      ),
    ];
    const expectedSha = 'a'.repeat(40);
    const guard = ': "${EXPECTED_SHA:?EXPECTED_SHA is required}"';

    for (const step of smokeSteps) {
      expect(step?.run).toBeTypeOf('string');
      expect(step?.env?.EXPECTED_SHA).toBe('${{ inputs.expected_sha }}');

      const run = step?.run ?? '';
      const valid = await executeSmokeGuardFragment(run, expectedSha);
      expect(valid.status).toBe('passed');
      expect(valid.npxCalled).toBe(true);

      const missing = await executeSmokeGuardFragment(run, '');
      expect(missing.status).toBe('failed');
      expect(missing.npxCalled).toBe(false);
      expect(missing.stderr).toContain('EXPECTED_SHA');

      const mutations = [
        run.replace(guard, 'echo "EXPECTED_SHA=${EXPECTED_SHA}"'),
        run.replace(guard, ": '${EXPECTED_SHA:?EXPECTED_SHA is required}'"),
        run.replace(guard, ': "${EXPECTED_SHA:-fallback}"'),
        run.replace(guard, 'true || : "${EXPECTED_SHA:?EXPECTED_SHA is required}"'),
      ];
      for (const mutatedRun of mutations) {
        expect(mutatedRun).not.toBe(run);
        const bypass = await executeSmokeGuardFragment(mutatedRun, '');
        // Each lookalike reaches the hermetic npx sentinel.  The real
        // missing-SHA run above must fail before that point; if the workflow's
        // guard is replaced by any of these forms, that earlier assertion
        // fails and the mutation cannot silently pass review.
        expect(bypass.status).toBe('passed');
        expect(bypass.npxCalled).toBe(true);
      }
    }
  });

  it(
    'fails closed on schema evidence retention, receipt, and attempt identity',
    { retry: 0 },
    async () => {
      const workflow = await readWorkflow('prod-schema-reconcile.yml');
      const steps = workflow.jobs?.reconcile?.steps ?? [];
      const retentionIndex = steps.findIndex(
        (step) => step.name === 'Verify artifact retention before apply'
      );
      const firstAttemptIndex = steps.findIndex(
        (step) => step.name === 'Require first apply attempt'
      );
      const preAuditIndex = steps.findIndex((step) => step.name === 'Run pre-apply audit');
      const postCleanIndex = steps.findIndex(
        (step) => step.name === 'Require clean post-apply audit'
      );
      const receiptIndex = steps.findIndex(
        (step) => step.name === 'Build schema reconcile receipt'
      );
      const upload = steps.find((step) => step.name === 'Upload redacted reconciliation reports');
      const capture = steps.find((step) => step.name === 'Capture apply evidence identity');
      const retention = steps[retentionIndex];
      const receipt = steps[receiptIndex];

      expect(firstAttemptIndex).toBeGreaterThan(-1);
      expect(firstAttemptIndex).toBeLessThan(preAuditIndex);
      expect(steps[firstAttemptIndex]?.if).toBe("inputs.mode == 'apply'");
      expect(steps[firstAttemptIndex]?.run).toContain('$GITHUB_RUN_ATTEMPT');
      expect(steps[firstAttemptIndex]?.run).toContain('!= "1"');

      expect(retentionIndex).toBeGreaterThan(-1);
      expect(retentionIndex).toBeLessThan(preAuditIndex);
      expect(retention?.if).toBe("inputs.mode == 'apply'");
      expect(retention?.env?.SCHEMA_EVIDENCE_RETENTION_READ_TOKEN).toBe(
        '${{ secrets.SCHEMA_EVIDENCE_RETENTION_READ_TOKEN }}'
      );
      expect(retention?.run).toContain('::add-mask::$SCHEMA_EVIDENCE_RETENTION_READ_TOKEN');
      expect(retention?.run).toContain('/actions/permissions/artifact-and-log-retention');
      expect(retention?.run).toContain('body?.days');
      expect(retention?.run).toContain('body.days < 90');
      expect(retention?.run).not.toContain('PRODUCTION_DATABASE_URL');
      expect(retention?.run).not.toContain('--apply');
      // Token stays out of curl argv (0600 header config file) and appears in
      // exactly one step of the workflow.
      expect(retention?.run).toContain('--config "$auth_header_file"');
      expect(retention?.run).not.toContain(
        '--header "Authorization: Bearer $SCHEMA_EVIDENCE_RETENTION_READ_TOKEN"'
      );
      const tokenSteps = steps.filter((step) =>
        JSON.stringify(step).includes('SCHEMA_EVIDENCE_RETENTION_READ_TOKEN')
      );
      expect(tokenSteps).toHaveLength(1);
      expect(tokenSteps[0]?.name).toBe('Verify artifact retention before apply');

      const requireReceiptIndex = steps.findIndex(
        (step) => step.name === 'Require schema reconcile receipt after successful apply'
      );
      expect(requireReceiptIndex).toBeGreaterThan(receiptIndex);
      const requireReceipt = steps[requireReceiptIndex];
      expect(requireReceipt?.if).toContain("inputs.mode == 'apply'");
      expect(requireReceipt?.run).toContain('test -s reports/schema-reconcile-receipt.json');

      expect(receiptIndex).toBeGreaterThan(preAuditIndex);
      expect(postCleanIndex).toBeGreaterThan(preAuditIndex);
      expect(receiptIndex).toBeGreaterThan(postCleanIndex);
      expect(receipt?.if).toContain("inputs.mode == 'apply'");
      expect(receipt?.if).toContain("steps.require_post_apply_clean.outcome == 'success'");
      expect(receipt?.run).toContain('APPLY-MISSING-DDL');
      expect(receipt?.run).toContain('build-schema-reconcile-receipt.ts');
      expect(receipt?.env?.GITHUB_RUN_ID).toBe('${{ github.run_id }}');
      expect(receipt?.env?.GITHUB_RUN_ATTEMPT).toBe('${{ github.run_attempt }}');
      expect(receipt?.env?.SCHEMA_RECONCILE_SOURCE_SHA).toBe('${{ inputs.expected_sha }}');

      expect(upload?.if).toBe('always()');
      expect(upload?.with?.name).toBe(
        'prod-schema-reconcile-${{ github.run_id }}-${{ github.run_attempt }}-${{ inputs.mode }}-${{ inputs.expected_sha }}'
      );
      expect(upload?.with?.path).toContain('reports/schema-reconcile-receipt.json');
      expect(upload?.with?.['retention-days']).toBe(90);
      expect(upload?.id).toBe('upload_evidence');
      expect(capture?.if).toContain("steps.apply.outcome == 'success'");
      expect(capture?.if).toContain("steps.post_audit.outcome == 'success'");
      expect(capture?.env?.ARTIFACT_ID).toBe('${{ steps.upload_evidence.outputs.artifact-id }}');
      expect(capture?.env?.ARTIFACT_DIGEST).toBe(
        '${{ steps.upload_evidence.outputs.artifact-digest }}'
      );
      expect(capture?.run).toContain('sha256sum reports/schema-reconcile-receipt.json');
      expect(JSON.stringify(steps)).not.toContain('retention-days: 14');
    }
  );

  it('would fail when smoke commit equality is removed', async () => {
    const smokePath = path.join(process.cwd(), 'tests', 'smoke', 'production-boundaries.spec.ts');
    const smokeSource = await readFile(smokePath, 'utf8');
    const matcher = compileReleaseIdentityMatcher(smokeSource);
    const wrongCommitBody = { version: '1.5.0', commit: 'wrong-commit' };

    const exactInvariant = (candidate: typeof matcher): boolean =>
      candidate(wrongCommitBody, '1.5.0', 'expected-commit') === false;
    expect(exactInvariant(matcher)).toBe(true);

    const mutatedSource = smokeSource.replace(" && body['commit'] === expectedSha", '');
    expect(mutatedSource).not.toBe(smokeSource);
    const mutatedMatcher = compileReleaseIdentityMatcher(mutatedSource);
    // Runtime execution proves mutation bypasses exact SHA equality; this is
    // the regression the smoke contract must reject.
    expect(exactInvariant(mutatedMatcher)).toBe(false);
  });

  it('keeps the PowerShell production helper mechanically blocked', async () => {
    const dispatcher = await readFile(
      path.join(process.cwd(), 'scripts', 'deploy-production.ps1'),
      'utf8'
    );

    expect(dispatcher).not.toContain('gh workflow run');
    expect(dispatcher).toMatch(/production mutation is mechanically blocked/i);
    expect(containsProductionVercelCommand(dispatcher)).toBe(false);
  });

  // --- Retro follow-up: authority-vs-reporting boundary enumeration ----------

  it('pins the CI Gate Status input surface so new feeders are classified', async () => {
    const workflow = await readWorkflow('ci-unified.yml');
    const gateNeeds = normalizeNeeds(workflow.jobs?.gate?.needs);
    expect([...gateNeeds].sort()).toEqual([...GATE_FEEDING_JOBS].sort());
  });

  it('keeps the gate authority step blocking under all circumstances', async () => {
    const workflow = await readWorkflow('ci-unified.yml');
    const determineGateStatus = (workflow.jobs?.gate?.steps ?? []).find(
      (step) => step.name === 'Determine gate status'
    );
    expect(determineGateStatus).toBeDefined();
    // Authority never becomes advisory and never delegates its verdict to a
    // reporting API — it computes the result and exits non-zero on failure.
    expect(determineGateStatus).not.toHaveProperty('continue-on-error', true);
    expect(isReportingPublisher(determineGateStatus)).toBe(false);
    expect(determineGateStatus?.run).toContain('exit 1');
  });

  it('fails the aggregate on missing, malformed, or contradictory change classification', async () => {
    const workflow = await readWorkflow('ci-unified.yml');
    const changes = workflow.jobs?.changes;
    const gateStatus = (workflow.jobs?.gate?.steps ?? []).find(
      (step) => step.name === 'Determine gate status'
    );

    expect(changes?.outputs).toMatchObject({
      change_classification_valid: '${{ steps.classify.outputs.valid }}',
      auto_docs_only: '${{ steps.classify.outputs.auto_docs_only }}',
      heavy_ci_relevant: '${{ steps.classify.outputs.heavy_ci_relevant }}',
    });

    expect(gateStatus?.run).toContain('change_classification_valid=');
    expect(gateStatus?.run).toContain('validate_boolean "change-classification-valid"');
    expect(gateStatus?.run).toContain('validate_boolean "auto-docs-only"');
    expect(gateStatus?.run).toContain('validate_boolean "heavy-ci-relevant"');
    expect(gateStatus?.run).toContain('Change classification is contradictory');
    expect(gateStatus?.run).toContain('Change classification is invalid');
  });

  it('executes the aggregate feeder-result matrix through its checked-in Bash helper', async () => {
    const workflow = await readWorkflow('ci-unified.yml');
    const gateScript = (workflow.jobs?.gate?.steps ?? []).find(
      (step) => step.name === 'Determine gate status'
    )?.run;
    if (!gateScript) throw new Error('CI Gate Status script not found');

    for (const expected of ['true', 'false'] as const) {
      for (const result of [
        'success',
        'skipped',
        'failure',
        'cancelled',
        'pending',
        'missing',
        '',
      ]) {
        const execution = await executeRequireResult(gateScript, result, expected);
        const shouldPass =
          (expected === 'true' && result === 'success') ||
          (expected === 'false' && result === 'skipped');
        expect(execution.passed, `${expected}:${result || '<empty>'}`).toBe(shouldPass);
      }
    }
  });

  it('makes every reporting publisher fail-open with bounded retries', async () => {
    const workflow = await readWorkflow('ci-unified.yml');
    const publishers = Object.entries(workflow.jobs ?? {}).flatMap(([jobName, job]) =>
      reportingPublishers(job).map((step) => ({ jobName, step }))
    );

    // Guard against a vacuous pass if the reporting steps are renamed or removed.
    expect(publishers.length).toBeGreaterThanOrEqual(3);
    expect(new Set(publishers.map(({ step }) => step.name))).toEqual(
      new Set(['Comment guard results', 'Comment PR with metrics', 'Comment PR status'])
    );

    const notFailOpen = publishers
      .filter(({ step }) => !isFailOpen(step))
      .map(({ jobName, step }) => `${jobName} > ${step.name ?? '(unnamed)'}`);
    expect(notFailOpen).toEqual([]);

    const missingRetries = publishers
      .filter(({ step }) => !hasBoundedRetries(step))
      .map(({ jobName, step }) => `${jobName} > ${step.name ?? '(unnamed)'}`);
    expect(missingRetries).toEqual([]);
  });

  it('proves no advisory publisher can fail the required CI Gate Status', async () => {
    const workflow = await readWorkflow('ci-unified.yml');
    const jobs = workflow.jobs ?? {};
    const gateNeeds = normalizeNeeds(jobs.gate?.needs);

    // Every reporting publisher inside a gate-feeding job is fail-open, so an
    // outage on the reporting surface cannot turn the required gate red.
    const blockingReporters = gateNeeds.flatMap((jobName) =>
      reportingPublishers(jobs[jobName])
        .filter((step) => !isFailOpen(step))
        .map((step) => `${jobName} > ${step.name ?? '(unnamed)'}`)
    );
    expect(blockingReporters).toEqual([]);

    // `guards` is the only gate-feeding job that reports; its comment step is
    // advisory while its validation steps stay authoritative (fail-closed).
    const guardsReporters = reportingPublishers(jobs.guards).map((step) => step.name);
    expect(guardsReporters).toContain('Comment guard results');
    const flagsGuard = (jobs.guards?.steps ?? []).find(
      (step) => step.name === 'Feature flags guard'
    );
    expect(flagsGuard).toBeDefined();
    expect(flagsGuard).not.toHaveProperty('continue-on-error', true);
  });

  it('keeps CI telemetry runtime and billable metrics semantically separate', async () => {
    const telemetry = await readFile(
      path.join(process.cwd(), 'scripts/ci-live-telemetry.mjs'),
      'utf8'
    );
    expect(telemetry).toContain('schemaVersion: 2');
    expect(telemetry).toContain('runnerDurationMinutes');
    expect(telemetry).toContain('billableMinutes');
    expect(telemetry).toContain('queueWaitMinutes');
    expect(telemetry).not.toContain('function billedMinutesForRun');
  });
});
