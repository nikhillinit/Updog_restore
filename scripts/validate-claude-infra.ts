#!/usr/bin/env node
/**
 * validate-claude-infra.ts (v4 optimal)
 *
 * Validates .claude/ consistency:
 * - Agent frontmatter: filename matches name; referenced skills exist; allowed tools match settings policy
 * - Commands index: referenced command names exist
 * - CAPABILITIES.md references all agents/commands
 * - Docs link integrity
 *
 * Output emoji can be disabled with USE_EMOJI=false (CI-friendly).
 */

import * as fs from 'fs';
import * as path from 'path';

type MaybeArray<T> = T | T[];

interface AgentFrontmatter {
  name: string;
  description?: string;
  tools?: MaybeArray<string>;
  skills?: MaybeArray<string>;
  permissionMode?: string;
}

interface ValidationResult {
  errors: string[];
  warnings: string[];
}

const USE_EMOJI = (process.env.USE_EMOJI ?? 'true').toLowerCase() !== 'false';

const ICONS = USE_EMOJI
  ? { ok: '[OK]', warn: '[WARN]', err: '[ERROR]', info: '[INFO]' }
  : { ok: 'OK', warn: 'WARN', err: 'ERROR', info: 'INFO' };

function logError(message: string) { console.error(`${ICONS.err} ${message}`); }
function logWarning(message: string) { console.warn(`${ICONS.warn} ${message}`); }
function logSuccess(message: string) { console.log(`${ICONS.ok} ${message}`); }
function logInfo(message: string) { console.log(`${ICONS.info} ${message}`); }

function normalizeFrontmatterText(input: string): string {
  // Remove BOM and normalize Windows line endings.
  return input.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
}

function parseYamlFrontmatter(filePath: string): AgentFrontmatter | null {
  const raw = fs.readFileSync(filePath, 'utf8');
  const content = normalizeFrontmatterText(raw);

  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/);
  if (!match) return null;

  try {
    // Simple YAML parsing for frontmatter (handles basic key: value pairs)
    const lines = match[1].split('\n');
    const parsed: Record<string, any> = {};

    for (const line of lines) {
      const colonIndex = line.indexOf(':');
      if (colonIndex === -1) continue;

      const key = line.slice(0, colonIndex).trim();
      let value = line.slice(colonIndex + 1).trim();

      // Handle arrays in format [item1, item2] or item1, item2
      if (value.startsWith('[') && value.endsWith(']')) {
        value = value.slice(1, -1);
      }

      // Check if it's a comma-separated list
      if (value.includes(',')) {
        parsed[key] = value.split(',').map(v => v.trim()).filter(Boolean);
      } else {
        parsed[key] = value;
      }
    }

    if (!parsed.name || typeof parsed.name !== 'string' || parsed.name.trim().length === 0) {
      return null;
    }
    return parsed as AgentFrontmatter;
  } catch (error) {
    logError(`Failed to parse frontmatter in ${filePath}: ${error}`);
    return null;
  }
}

function parseList(value: MaybeArray<string> | undefined): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map(v => (typeof v === 'string' ? v.trim() : ''))
      .filter(Boolean);
  }
  if (typeof value === 'string') {
    // Accept comma-separated and/or whitespace separated lists
    return value
      .split(',')
      .map(v => v.trim())
      .filter(Boolean);
  }
  return [];
}

function getAgentFiles(): string[] {
  const agentsDir = '.claude/agents';
  if (!fs.existsSync(agentsDir)) return [];
  return fs.readdirSync(agentsDir, { withFileTypes: true })
    .flatMap(entry => {
      const fullPath = path.join(agentsDir, entry.name);
      if (entry.isDirectory()) {
        // Warn about nested directories (flat structure recommended)
        logWarning(`Found nested directory ${fullPath}. Flat structure in .claude/agents/ is recommended.`);
        return fs.readdirSync(fullPath, { withFileTypes: true })
          .filter(subEntry => subEntry.isFile() && subEntry.name.endsWith('.md'))
          .map(subEntry => path.join(fullPath, subEntry.name));
      }
      if (entry.isFile() && entry.name.endsWith('.md')) return [fullPath];
      return [];
    });
}

function getSkillFolders(): string[] {
  const skillsDir = '.claude/skills';
  if (!fs.existsSync(skillsDir)) return [];
  return fs.readdirSync(skillsDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name);
}

function getAllowedToolsFromSettings(): string[] {
  const settingsPath = '.claude/settings.json';
  if (!fs.existsSync(settingsPath)) return [];

  try {
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));

    // Support both schemas:
    // 1) { allowedTools: ["Read","Write"] }
    // 2) { permissions: { allow: ["Read","Write"] } }
    if (Array.isArray(settings.allowedTools)) return settings.allowedTools;

    if (settings.permissions && Array.isArray(settings.permissions.allow)) return settings.permissions.allow;

    return [];
  } catch (error) {
    logWarning(`Could not parse ${settingsPath}: ${error}`);
    return [];
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function fileStem(filePath: string): string {
  return path.basename(filePath, '.md');
}

function checkAgentNameMatchesFilename(result: ValidationResult) {
  const agentFiles = getAgentFiles();

  for (const agentFile of agentFiles) {
    // Skip non-agent files like PHOENIX-AGENTS.md (registry files)
    const filename = path.basename(agentFile);
    if (filename.toUpperCase() === filename) continue; // Skip ALL-CAPS files

    const frontmatter = parseYamlFrontmatter(agentFile);
    if (!frontmatter) {
      result.warnings.push(`Missing or invalid frontmatter in ${agentFile}`);
      continue;
    }

    const expectedName = fileStem(agentFile);
    if (frontmatter.name !== expectedName) {
      result.errors.push(`Agent name mismatch: file ${expectedName}.md but frontmatter name is "${frontmatter.name}" in ${agentFile}`);
    }
  }
}

function checkReferencedSkillsExist(result: ValidationResult) {
  const agentFiles = getAgentFiles();
  const skills = new Set(getSkillFolders());

  for (const agentFile of agentFiles) {
    const frontmatter = parseYamlFrontmatter(agentFile);
    if (!frontmatter) continue;

    for (const skill of parseList(frontmatter.skills)) {
      if (!skills.has(skill)) {
        result.warnings.push(`Agent ${frontmatter.name} references skill not found as folder: ${skill}`);
      }
    }
  }
}

function checkSettingsPermissions(result: ValidationResult) {
  const agentFiles = getAgentFiles();
  const allowed = new Set(getAllowedToolsFromSettings());
  if (allowed.size === 0) {
    // No explicit allowlist configured - skip validation
    return;
  }

  for (const agentFile of agentFiles) {
    const frontmatter = parseYamlFrontmatter(agentFile);
    if (!frontmatter) continue;

    for (const tool of parseList(frontmatter.tools)) {
      if (!allowed.has(tool)) {
        result.warnings.push(`Agent ${frontmatter.name} uses tool "${tool}" which may not be in settings allowlist`);
      }
    }
  }
}

function checkCapabilitiesCompleteness(result: ValidationResult) {
  const capabilitiesPath = 'CAPABILITIES.md';
  if (!fs.existsSync(capabilitiesPath)) {
    result.warnings.push('CAPABILITIES.md not found. Skipping completeness check.');
    return;
  }

  const text = fs.readFileSync(capabilitiesPath, 'utf8');

  // Agents
  for (const agentFile of getAgentFiles()) {
    const frontmatter = parseYamlFrontmatter(agentFile);
    if (!frontmatter) continue;

    const name = frontmatter.name;
    const re = new RegExp(`(^|[^a-z0-9-])${escapeRegex(name)}([^a-z0-9-]|$)`, 'i');
    if (!re.test(text)) {
      result.warnings.push(`Agent "${name}" is not referenced in CAPABILITIES.md`);
    }
  }

  // Commands
  const commandsDir = '.claude/commands';
  if (!fs.existsSync(commandsDir)) return;

  for (const entry of fs.readdirSync(commandsDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const command = fileStem(entry.name);
    const re = new RegExp(`(^|[^a-z0-9-\\/])\\/${escapeRegex(command)}([^a-z0-9-]|$)`, 'i');
    if (!re.test(text)) {
      result.warnings.push(`Command "/${command}" is not referenced in CAPABILITIES.md`);
    }
  }
}

function checkDocumentationLinks(result: ValidationResult) {
  const docsDir = 'docs';
  if (!fs.existsSync(docsDir)) return;

  const files: string[] = [];

  function findMarkdownFiles(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) findMarkdownFiles(fullPath);
      else if (entry.isFile() && entry.name.endsWith('.md')) files.push(fullPath);
    }
  }
  findMarkdownFiles(docsDir);

  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    let match: RegExpExecArray | null;

    while ((match = linkRegex.exec(content)) !== null) {
      const linkPath = match[2];
      if (linkPath.startsWith('http')) continue;
      if (linkPath.startsWith('#')) continue;

      const withoutAnchor = linkPath.split('#')[0];
      if (!withoutAnchor) continue;

      const resolved = path.resolve(path.dirname(file), withoutAnchor);
      if (!fs.existsSync(resolved)) {
        result.warnings.push(`Broken link in ${file}: ${linkPath}`);
      }
    }
  }
}

function checkOrphanedSkills(result: ValidationResult) {
  const skillsDir = '.claude/skills';
  if (!fs.existsSync(skillsDir)) return;

  const referenced = new Set<string>();
  for (const agentFile of getAgentFiles()) {
    const frontmatter = parseYamlFrontmatter(agentFile);
    if (!frontmatter) continue;
    for (const skill of parseList(frontmatter.skills)) referenced.add(skill);
  }

  for (const skill of getSkillFolders()) {
    if (!referenced.has(skill)) {
      // This is just informational, not an error
      logInfo(`Skill "${skill}" is not referenced by any agent (may be used by commands or external)`);
    }
  }
}

function emitFailureBlock(errorCount: number) {
  console.log(`
===============================================================================
VALIDATION FAILED: Claude Infrastructure
===============================================================================
SUMMARY: ${errorCount} configuration error(s) found in .claude/ directory
PROBABLE_CAUSE: Agent/skill references, naming conventions, or settings are inconsistent
NEXT_STEP: Review errors above and fix configuration files
===============================================================================
`);
}

function main() {
  const result: ValidationResult = { errors: [], warnings: [] };

  logInfo('Validating .claude/ infrastructure...');

  checkAgentNameMatchesFilename(result);
  checkReferencedSkillsExist(result);
  checkSettingsPermissions(result);
  checkCapabilitiesCompleteness(result);
  checkDocumentationLinks(result);
  checkOrphanedSkills(result);

  if (result.errors.length > 0) {
    logError(`Found ${result.errors.length} error(s):`);
    for (const err of result.errors) logError(`  - ${err}`);
  } else {
    logSuccess('No errors found.');
  }

  if (result.warnings.length > 0) {
    logWarning(`Found ${result.warnings.length} warning(s):`);
    for (const warn of result.warnings) logWarning(`  - ${warn}`);
  }

  if (result.errors.length > 0) {
    emitFailureBlock(result.errors.length);
    process.exit(1);
  }

  logSuccess('Claude infrastructure validation passed.');
  process.exit(0);
}

main();
