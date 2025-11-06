#!/usr/bin/env node
/**
 * Automated CAPABILITIES.md synchronization script
 *
 * Scans the project for:
 * - Project-level agents (.claude/agents)
 * - Slash commands (.claude/commands)
 * - Agent packages (packages directory)
 * - NPM scripts (package.json)
 *
 * Updates CAPABILITIES.md with current state
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { glob } from 'glob';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const CAPABILITIES_PATH = path.join(ROOT, 'CAPABILITIES.md');

/**
 * Scan for project-level agents
 */
async function scanAgents() {
  const agentFiles = await glob('.claude/agents/*.md', { cwd: ROOT });
  const agents = [];

  for (const file of agentFiles) {
    const content = await fs.readFile(path.join(ROOT, file), 'utf-8');
    const name = path.basename(file, '.md');

    // Extract model from frontmatter or content
    const modelMatch = content.match(/model:\s*(\w+)/i);
    const model = modelMatch ? modelMatch[1] : 'inherit';

    // Extract description from first paragraph or heading
    const descMatch = content.match(/(?:Purpose|Description):\s*(.+?)(?:\n|$)/i);
    const description = descMatch ? descMatch[1].trim() : 'Agent';

    agents.push({ name, model, description, file });
  }

  return agents.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Scan for slash commands
 */
async function scanCommands() {
  const commandFiles = await glob('.claude/commands/*.md', { cwd: ROOT });
  const commands = [];

  for (const file of commandFiles) {
    const content = await fs.readFile(path.join(ROOT, file), 'utf-8');
    const name = path.basename(file, '.md');

    // Extract first heading or first line as description
    const descMatch = content.match(/^#\s+(.+?)$/m) || content.match(/^(.+?)$/m);
    const description = descMatch ? descMatch[1].trim() : 'Command';

    commands.push({ name, description, file });
  }

  return commands.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Scan for agent packages
 */
async function scanAgentPackages() {
  const packageFiles = await glob('packages/*/package.json', { cwd: ROOT });
  const packages = [];

  for (const file of packageFiles) {
    const content = await fs.readFile(path.join(ROOT, file), 'utf-8');
    const pkg = JSON.parse(content);

    // Only include packages that seem to be agents
    if (pkg.name && (pkg.name.includes('agent') || pkg.description?.includes('agent'))) {
      packages.push({
        name: pkg.name,
        version: pkg.version,
        description: pkg.description || 'Agent package',
        file: file,
      });
    }
  }

  return packages.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Count NPM scripts by category
 */
async function countNPMScripts() {
  const pkgPath = path.join(ROOT, 'package.json');
  const content = await fs.readFile(pkgPath, 'utf-8');
  const pkg = JSON.parse(content);

  const scripts = pkg.scripts || {};
  const categories = {
    ai: 0,
    dev: 0,
    test: 0,
    build: 0,
    db: 0,
    security: 0,
    perf: 0,
    other: 0,
  };

  for (const name of Object.keys(scripts)) {
    if (name.startsWith('ai')) categories.ai++;
    else if (name.startsWith('dev')) categories.dev++;
    else if (name.startsWith('test')) categories.test++;
    else if (name.startsWith('build')) categories.build++;
    else if (name.startsWith('db')) categories.db++;
    else if (name.startsWith('security')) categories.security++;
    else if (name.startsWith('perf') || name.startsWith('bench')) categories.perf++;
    else categories.other++;
  }

  return { total: Object.keys(scripts).length, categories };
}

/**
 * Generate summary statistics
 */
async function generateSummary() {
  const agents = await scanAgents();
  const commands = await scanCommands();
  const packages = await scanAgentPackages();
  const scripts = await countNPMScripts();

  return {
    timestamp: new Date().toISOString().split('T')[0],
    projectAgents: agents.length,
    slashCommands: commands.length,
    agentPackages: packages.length,
    npmScripts: scripts.total,
    agents,
    commands,
    packages,
    scripts,
  };
}

/**
 * Update CAPABILITIES.md with current state
 */
async function updateCapabilities(dryRun = false) {
  console.log('🔍 Scanning project for capabilities...\n');

  const summary = await generateSummary();

  console.log('📊 Summary:');
  console.log(`  Project Agents: ${summary.projectAgents}`);
  console.log(`  Slash Commands: ${summary.slashCommands}`);
  console.log(`  Agent Packages: ${summary.agentPackages}`);
  console.log(`  NPM Scripts: ${summary.npmScripts}`);
  console.log();

  if (dryRun) {
    console.log('🔍 DRY RUN - Changes that would be made:\n');
    console.log('Project Agents:');
    summary.agents.forEach(a => console.log(`  - ${a.name} (${a.model}): ${a.description}`));
    console.log('\nSlash Commands:');
    summary.commands.forEach(c => console.log(`  - /${c.name}: ${c.description}`));
    console.log('\nAgent Packages:');
    summary.packages.forEach(p => console.log(`  - ${p.name}@${p.version}`));
    console.log('\n✅ Dry run complete. Use --apply to make changes.');
    return;
  }

  // Read current CAPABILITIES.md
  let content = await fs.readFile(CAPABILITIES_PATH, 'utf-8');

  // Update last updated date
  const datePattern = /_Last Updated: \d{4}-\d{2}-\d{2}_/;
  content = content.replace(datePattern, `_Last Updated: ${summary.timestamp}_`);

  // Update agent count (if we knew user-level count, we'd add it)
  const agentCountPattern = /## 📋 Available Agents \(\d+\+\)/;
  const totalAgents = summary.projectAgents + 14 + 4; // project + user-level + built-in (hardcoded for now)
  content = content.replace(agentCountPattern, `## 📋 Available Agents (${totalAgents}+)`);

  console.log('✅ Updated CAPABILITIES.md');
  console.log(`  - Last updated: ${summary.timestamp}`);
  console.log(`  - Total agents: ${totalAgents}+`);

  await fs.writeFile(CAPABILITIES_PATH, content, 'utf-8');

  console.log('\n💡 Tip: CAPABILITIES.md lists user-level agents and MCP servers');
  console.log('   These are maintained manually as they come from system config.');
  console.log('\n🎯 Run `/catalog-tooling` for complete real-time inventory.');
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const apply = args.includes('--apply');

  if (args.includes('--help')) {
    console.log(`
Sync CAPABILITIES.md with actual project state

Usage:
  npm run capabilities:sync           # Dry run (show what would change)
  npm run capabilities:sync -- --apply    # Apply changes
  npm run capabilities:sync -- --dry-run  # Explicit dry run

Options:
  --apply     Apply changes to CAPABILITIES.md
  --dry-run   Show what would change without modifying files
  --help      Show this help message
`);
    return;
  }

  await updateCapabilities(dryRun && !apply);
}

main().catch(console.error);
