#!/usr/bin/env tsx
/**
 * Feature Flag Usage Validator
 *
 * Validates that all flag usage in the codebase references valid flags
 * from the registry. Fails in strict mode (CI), warns in lenient mode (dev).
 *
 * Run: npm run flags:validate
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, dirname, extname } from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');
const REGISTRY_PATH = join(PROJECT_ROOT, 'flags', 'registry.yaml');

const STRICT_MODE = process.argv.includes('--strict');
const VERBOSE = process.argv.includes('--verbose');

interface FlagRegistry {
  flags: Record<string, unknown>;
  deprecated: Array<{ key: string; reason: string; removeBy: string }>;
}

interface ValidationResult {
  file: string;
  line: number;
  flag: string;
  issue: 'unknown' | 'deprecated';
  message: string;
}

// Patterns to match flag usage
const FLAG_PATTERNS = [
  // useFlag('flag_name')
  /useFlag\s*\(\s*['"]([a-z_]+)['"]/g,
  // getFlag('flag_name')
  /getFlag\s*\(\s*['"]([a-z_]+)['"]/g,
  // FLAGS.FLAG_NAME
  /FLAGS\.([A-Z_]+)/g,
  // isEnabled('flag_name')
  /isEnabled\s*\(\s*['"]([a-z_]+)['"]/g,
  // 'enable_*' in object keys
  /['"]?(enable_[a-z_]+)['"]?\s*:/g,
  // ff_flag_name query params
  /ff_([a-z_]+)/g,
];

// Directories to scan
const SCAN_DIRS = ['client/src', 'server', 'shared'];

// File extensions to scan
const SCAN_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

// Files/directories to skip
const SKIP_PATTERNS = [
  /node_modules/,
  /\.d\.ts$/,
  /generated/,
  /\.test\./,
  /\.spec\./,
  /__tests__/,
  /\/test\//,
];

function shouldSkip(path: string): boolean {
  return SKIP_PATTERNS.some((pattern) => pattern.test(path));
}

function getAllFiles(dir: string): string[] {
  const files: string[] = [];

  function walk(currentDir: string) {
    if (shouldSkip(currentDir)) return;

    const entries = readdirSync(currentDir);
    for (const entry of entries) {
      const fullPath = join(currentDir, entry);
      if (shouldSkip(fullPath)) continue;

      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (SCAN_EXTENSIONS.includes(extname(fullPath))) {
        files.push(fullPath);
      }
    }
  }

  walk(dir);
  return files;
}

function normalizeFlag(flag: string): string {
  // Convert UPPER_SNAKE_CASE to lower_snake_case
  return flag.toLowerCase();
}

function extractFlags(content: string, filePath: string): Array<{ flag: string; line: number }> {
  const results: Array<{ flag: string; line: number }> = [];
  const lines = content.split('\n');

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];
    if (!line) continue;

    for (const pattern of FLAG_PATTERNS) {
      // Reset regex state
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(line)) !== null) {
        const flag = normalizeFlag(match[1] ?? '');
        if (flag && flag.length > 2) {
          results.push({ flag, line: lineNum + 1 });
        }
      }
    }
  }

  return results;
}

function main() {
  console.log('Loading flag registry...');
  const registryContent = readFileSync(REGISTRY_PATH, 'utf-8');
  const registry = parse(registryContent) as FlagRegistry;

  const validFlags = new Set(Object.keys(registry.flags));
  const deprecatedFlags = new Map(
    registry.deprecated.map((d) => [d.key.toLowerCase(), d.reason])
  );

  // Also add aliases as valid
  for (const [key, def] of Object.entries(registry.flags)) {
    const flagDef = def as { aliases?: string[] };
    if (flagDef.aliases) {
      for (const alias of flagDef.aliases) {
        validFlags.add(alias.toLowerCase());
      }
    }
  }

  console.log(`Found ${validFlags.size} valid flags`);
  console.log(`Found ${deprecatedFlags.size} deprecated flags`);

  const results: ValidationResult[] = [];
  let filesScanned = 0;

  for (const scanDir of SCAN_DIRS) {
    const fullDir = join(PROJECT_ROOT, scanDir);
    const files = getAllFiles(fullDir);

    for (const file of files) {
      filesScanned++;
      const content = readFileSync(file, 'utf-8');
      const flagUsages = extractFlags(content, file);

      for (const { flag, line } of flagUsages) {
        // Skip very short flags (likely false positives)
        if (flag.length < 3) continue;

        // Skip flags that don't look like flag names
        if (!flag.includes('_') && !flag.startsWith('enable')) continue;

        if (deprecatedFlags.has(flag)) {
          results.push({
            file: file.replace(PROJECT_ROOT, '').replace(/\\/g, '/'),
            line,
            flag,
            issue: 'deprecated',
            message: deprecatedFlags.get(flag) ?? 'Deprecated',
          });
        } else if (!validFlags.has(flag)) {
          results.push({
            file: file.replace(PROJECT_ROOT, '').replace(/\\/g, '/'),
            line,
            flag,
            issue: 'unknown',
            message: 'Flag not found in registry',
          });
        }
      }
    }
  }

  console.log(`\nScanned ${filesScanned} files`);

  // Filter out likely false positives
  const filteredResults = results.filter((r) => {
    // Keep all deprecated
    if (r.issue === 'deprecated') return true;
    // For unknown, filter out common false positives
    const knownPrefixes = ['enable_', 'ts_', 'wasm_', 'demo_', 'require_', 'ui_', 'onboarding_', 'reserves_', 'stage_', 'export_', 'metrics_', 'remain_', 'shadow_'];
    return knownPrefixes.some((p) => r.flag.startsWith(p));
  });

  if (filteredResults.length === 0) {
    console.log('\n[PASS] All flag usages are valid');
    process.exit(0);
  }

  // Group by issue type
  const unknown = filteredResults.filter((r) => r.issue === 'unknown');
  const deprecated = filteredResults.filter((r) => r.issue === 'deprecated');

  if (unknown.length > 0) {
    console.log(`\n[WARN] Found ${unknown.length} unknown flag references:`);
    for (const r of unknown) {
      console.log(`  ${r.file}:${r.line} - '${r.flag}' (${r.message})`);
    }
  }

  if (deprecated.length > 0) {
    console.log(`\n[WARN] Found ${deprecated.length} deprecated flag references:`);
    for (const r of deprecated) {
      console.log(`  ${r.file}:${r.line} - '${r.flag}' (${r.message})`);
    }
  }

  if (STRICT_MODE) {
    console.log('\n[FAIL] Strict mode enabled - failing due to validation issues');
    process.exit(1);
  } else {
    console.log('\n[WARN] Non-strict mode - validation issues found but not failing');
    console.log('Run with --strict to fail on validation issues');
    process.exit(0);
  }
}

main();
