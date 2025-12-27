#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import { GeminiProAgent } from './GeminiProAgent';
import { GeminiBrowserAgent } from './GeminiBrowserAgent';
import { ChatGPTProAgent } from './ChatGPTProAgent';
import { ConsensusOrchestrator } from './ConsensusOrchestrator';
import { FileQuotaManager } from './FileQuotaManager';
import type { ReviewModel, ReviewContext, ConsensusResult } from './types';

/**
 * Gemini mode determines how Gemini provider is accessed
 * - api: Use official API (requires GEMINI_API_KEY)
 * - browser: Use browser automation (works with Gemini Advanced subscription)
 * - auto: Use API if key available, otherwise browser
 */
type GeminiMode = 'api' | 'browser' | 'auto';

/**
 * CLI configuration loaded from environment
 */
interface CLIConfig {
  geminiApiKey?: string | undefined;
  openaiApiKey?: string | undefined;
  sessionDir: string;
  providers: ('gemini' | 'chatgpt')[];
  geminiMode: GeminiMode;
  enableDeepThink: boolean;
  output: 'json' | 'text';
  minAgreement: number;
  severityResolution: 'max' | 'min' | 'average';
  debugSnapshots: boolean;
}

/**
 * Parse command line arguments
 */
function parseArgs(args: string[]): {
  files: string[];
  options: Partial<CLIConfig>;
  help: boolean;
} {
  const files: string[] = [];
  const options: Partial<CLIConfig> = {};
  let help = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg) continue;

    if (arg === '--help' || arg === '-h') {
      help = true;
    } else if (arg === '--output' || arg === '-o') {
      const val = args[++i];
      if (val) options.output = val as 'json' | 'text';
    } else if (arg === '--providers' || arg === '-p') {
      const val = args[++i];
      if (val) options.providers = val.split(',') as ('gemini' | 'chatgpt')[];
    } else if (arg === '--gemini-mode') {
      const val = args[++i];
      if (val) options.geminiMode = val as GeminiMode;
    } else if (arg === '--deep-think') {
      options.enableDeepThink = true;
    } else if (arg === '--debug-snapshots') {
      options.debugSnapshots = true;
    } else if (arg === '--min-agreement') {
      const val = args[++i];
      if (val) options.minAgreement = parseFloat(val);
    } else if (arg === '--severity-resolution') {
      const val = args[++i];
      if (val) options.severityResolution = val as 'max' | 'min' | 'average';
    } else if (arg === '--session-dir') {
      const val = args[++i];
      if (val) options.sessionDir = val;
    } else if (!arg.startsWith('-')) {
      files.push(arg);
    }
  }

  return { files, options, help };
}

/**
 * Load configuration from environment and CLI options
 */
function loadConfig(options: Partial<CLIConfig>): CLIConfig {
  const env = process.env;
  const geminiMode = options.geminiMode ??
    (env['GEMINI_MODE'] as GeminiMode | undefined) ?? 'auto';

  return {
    geminiApiKey: env['GEMINI_API_KEY'],
    openaiApiKey: env['OPENAI_API_KEY'],
    sessionDir: options.sessionDir ?? env['PRO_BRIDGE_SESSION_DIR'] ?? './data/sessions',
    providers: options.providers ?? ['gemini', 'chatgpt'],
    geminiMode,
    enableDeepThink: options.enableDeepThink ?? env['GEMINI_DEEP_THINK'] === 'true',
    output: options.output ?? 'text',
    minAgreement: options.minAgreement ?? parseFloat(env['CONSENSUS_MIN_AGREEMENT'] ?? '0.5'),
    severityResolution: options.severityResolution ??
      (env['CONSENSUS_SEVERITY_RESOLUTION'] as 'max' | 'min' | 'average' | undefined) ?? 'max',
    debugSnapshots: options.debugSnapshots ?? env['PRO_BRIDGE_DEBUG_SNAPSHOTS'] === 'true',
  };
}

/**
 * Create review providers based on configuration
 */
function createProviders(config: CLIConfig): ReviewModel[] {
  const providers: ReviewModel[] = [];

  if (config.providers.includes('gemini')) {
    // Determine Gemini mode
    let useApi = false;
    let useBrowser = false;

    if (config.geminiMode === 'api') {
      useApi = true;
    } else if (config.geminiMode === 'browser') {
      useBrowser = true;
    } else {
      // auto: prefer API if key available
      useApi = !!config.geminiApiKey;
      useBrowser = !useApi;
    }

    if (useApi) {
      if (!config.geminiApiKey) {
        console.error('Error: GEMINI_API_KEY required for Gemini API mode');
        console.error('Hint: Use --gemini-mode browser to use Gemini Advanced subscription instead');
        process.exit(1);
      }
      providers.push(new GeminiProAgent({
        apiKey: config.geminiApiKey,
      }));
      console.log('Using Gemini API mode');
    } else if (useBrowser) {
      if (!config.openaiApiKey) {
        console.error('Error: OPENAI_API_KEY required for browser automation (Stagehand)');
        process.exit(1);
      }
      providers.push(new GeminiBrowserAgent({
        sessionDir: config.sessionDir,
        openaiApiKey: config.openaiApiKey,
        enableDeepThink: config.enableDeepThink,
        debugSnapshots: config.debugSnapshots,
      }));
      console.log('Using Gemini browser mode (Gemini Advanced subscription)');
    }
  }

  if (config.providers.includes('chatgpt')) {
    if (!config.openaiApiKey) {
      console.error('Error: OPENAI_API_KEY environment variable required for ChatGPT provider');
      process.exit(1);
    }
    providers.push(new ChatGPTProAgent({
      sessionDir: config.sessionDir,
      openaiApiKey: config.openaiApiKey,
    }));
    console.log('Using ChatGPT browser mode (ChatGPT Pro subscription)');
  }

  if (providers.length === 0) {
    console.error('Error: No providers configured. Use --providers gemini,chatgpt');
    process.exit(1);
  }

  return providers;
}

/**
 * Detect language from file extension
 */
function detectLanguage(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const langMap: Record<string, string> = {
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.py': 'python',
    '.rb': 'ruby',
    '.go': 'go',
    '.rs': 'rust',
    '.java': 'java',
    '.c': 'c',
    '.cpp': 'cpp',
    '.h': 'c',
    '.hpp': 'cpp',
    '.cs': 'csharp',
    '.php': 'php',
    '.swift': 'swift',
    '.kt': 'kotlin',
    '.scala': 'scala',
    '.sql': 'sql',
    '.sh': 'bash',
    '.bash': 'bash',
    '.zsh': 'zsh',
    '.ps1': 'powershell',
  };
  return langMap[ext] ?? 'unknown';
}

/**
 * Format result as JSON
 */
function formatJson(result: ConsensusResult): string {
  return JSON.stringify(result, null, 2);
}

/**
 * Format result as human-readable text
 */
function formatText(result: ConsensusResult): string {
  const lines: string[] = [];

  lines.push('='.repeat(60));
  lines.push('CODE REVIEW CONSENSUS');
  lines.push('='.repeat(60));
  lines.push('');

  // Summary
  lines.push(result.summary);
  lines.push('');

  // Statistics
  lines.push(`Providers: ${result.stats.totalProviders}`);
  lines.push(`Agreement Rate: ${Math.round(result.stats.agreementRate * 100)}%`);
  lines.push('');

  // Issues
  if (result.mergedIssues.length === 0) {
    lines.push('No issues found.');
  } else {
    lines.push('ISSUES:');
    lines.push('-'.repeat(40));

    for (const issue of result.mergedIssues) {
      const severityBadge = `[${issue.severity.toUpperCase()}]`;
      const confidence = `(${Math.round(issue.confidence * 100)}% confidence)`;
      lines.push(`${severityBadge} ${issue.description} ${confidence}`);

      if (issue.line) {
        lines.push(`   Line: ${issue.line}`);
      }
      if (issue.file) {
        lines.push(`   File: ${issue.file}`);
      }
      if (issue.suggestion) {
        lines.push(`   Suggestion: ${issue.suggestion}`);
      }
      lines.push(`   Reported by: ${issue.reportedBy.join(', ')}`);
      lines.push('');
    }
  }

  // Provider details
  lines.push('-'.repeat(40));
  lines.push('PROVIDER RESULTS:');
  for (const providerResult of result.results) {
    lines.push(`  ${providerResult.provider} (${providerResult.model}): ${providerResult.issues.length} issues`);
  }

  return lines.join('\n');
}

/**
 * Print help message
 */
function printHelp(): void {
  console.log(`
Pro Bridge CLI - Multi-LLM Code Review Consensus

USAGE:
  pro-bridge [options] <file1> [file2] ...

OPTIONS:
  -h, --help                Show this help message
  -o, --output <format>     Output format: json or text (default: text)
  -p, --providers <list>    Comma-separated providers: gemini,chatgpt (default: both)
  --gemini-mode <mode>      How to access Gemini: api, browser, auto (default: auto)
  --deep-think              Enable Gemini Deep Think mode (browser mode only)
  --debug-snapshots         Save debug snapshots on failure
  --min-agreement <n>       Minimum agreement rate 0-1 (default: 0.5)
  --severity-resolution <s> How to resolve severity: max, min, average (default: max)
  --session-dir <path>      Session directory for browser data

GEMINI MODES:
  api      Use Gemini API (requires GEMINI_API_KEY, has API costs)
  browser  Use browser automation with Gemini Advanced subscription (no API costs)
  auto     Use API if GEMINI_API_KEY set, otherwise use browser (default)

ENVIRONMENT VARIABLES:
  GEMINI_API_KEY            API key for Gemini API mode
  GEMINI_MODE               Default Gemini mode: api, browser, auto
  GEMINI_DEEP_THINK         Enable Deep Think by default: true/false
  OPENAI_API_KEY            Required for ChatGPT and browser automation (Stagehand)
  PRO_BRIDGE_SESSION_DIR    Default session directory
  PRO_BRIDGE_DEBUG_SNAPSHOTS Enable debug snapshots: true/false

SUBSCRIPTION-ONLY MODE (NO API COSTS):
  # Use both subscriptions without API keys (except OPENAI_API_KEY for Stagehand)
  export GEMINI_MODE=browser
  export OPENAI_API_KEY=sk-...  # Still needed for Stagehand selectors
  pro-bridge --deep-think src/critical.ts

EXAMPLES:
  # Review with API mode (needs GEMINI_API_KEY)
  pro-bridge src/api/users.ts

  # Review with browser mode (uses subscriptions)
  pro-bridge --gemini-mode browser src/api/users.ts

  # Use Deep Think for thorough analysis
  pro-bridge --gemini-mode browser --deep-think src/security.ts

  # Only ChatGPT (subscription via browser)
  pro-bridge -p chatgpt src/index.ts

  # High consensus threshold with JSON output
  pro-bridge --min-agreement 0.75 -o json src/critical.ts
`);
}

/**
 * Main CLI entry point
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const { files, options, help } = parseArgs(args);

  if (help || files.length === 0) {
    printHelp();
    process.exit(help ? 0 : 1);
  }

  const config = loadConfig(options);
  const providers = createProviders(config);

  const orchestrator = new ConsensusOrchestrator(providers, {
    minAgreement: config.minAgreement,
    severityResolution: config.severityResolution,
    timeoutMs: 120000,
  });

  try {
    await orchestrator.initialize();

    for (const file of files) {
      const filePath = path.resolve(file);

      if (!fs.existsSync(filePath)) {
        console.error(`Error: File not found: ${file}`);
        continue;
      }

      const code = fs.readFileSync(filePath, 'utf-8');
      const context: ReviewContext = {
        filePath: file,
        language: detectLanguage(file),
      };

      if (config.output === 'text') {
        console.log(`\nReviewing: ${file}...\n`);
      }

      const result = await orchestrator.review(code, context);

      if (config.output === 'json') {
        console.log(formatJson(result));
      } else {
        console.log(formatText(result));
      }
    }
  } finally {
    await orchestrator.dispose();
  }
}

// Export for testing
export { parseArgs, loadConfig, detectLanguage, formatJson, formatText };

// Run CLI only when executed directly (not when imported)
const isMainModule = require.main === module || process.argv[1]?.endsWith('cli.ts');
if (isMainModule) {
  main().catch(error => {
    console.error('Fatal error:', error.message);
    process.exit(1);
  });
}
