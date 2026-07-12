/**
 * Bundle budget checker for local use and CI.
 *
 * Supports two measurement strategies:
 * - manifest-entry-closure: sums the actual initial-load closure for a Vite entry
 * - glob-sum: sums all files matching a glob
 *
 * Output is compatible with the JSON shape expected by scripts/compare-bundle-size.js.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = process.cwd();
const DIST_ROOT = path.join(ROOT, 'dist', 'public');
const MANIFEST_PATH = path.join(DIST_ROOT, '.vite', 'manifest.json');
const CONFIG_PATH = path.join(ROOT, '.size-limit.json');
const JSON_MODE = process.argv.includes('--json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function parseLimitToBytes(limit) {
  if (typeof limit !== 'string') {
    throw new Error(`Invalid limit: ${String(limit)}`);
  }

  const match = limit.trim().match(/^([\d.]+)\s*(B|KB|MB)$/i);
  if (!match) {
    throw new Error(`Invalid limit format: ${limit}`);
  }

  const value = Number.parseFloat(match[1]);
  const unit = match[2].toUpperCase();

  if (unit === 'B') return value;
  if (unit === 'KB') return value * 1024;
  if (unit === 'MB') return value * 1024 * 1024;

  throw new Error(`Unsupported unit in limit: ${limit}`);
}

function getFileSize(filePath, gzip) {
  const content = fs.readFileSync(filePath);
  return gzip ? zlib.gzipSync(content).length : content.length;
}

function toReportPath(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join('/');
}

function collectManifestEntryClosure(manifest, entryKey) {
  const visited = new Set();
  const files = new Set();

  function visit(key) {
    if (visited.has(key)) {
      return;
    }

    const entry = manifest[key];
    if (!entry) {
      throw new Error(`Manifest entry not found: ${key}`);
    }

    visited.add(key);

    if (entry.file) {
      files.add(entry.file);
    }

    for (const css of entry.css || []) {
      files.add(css);
    }

    for (const importedKey of entry.imports || []) {
      visit(importedKey);
    }
  }

  visit(entryKey);
  return [...files];
}

function measureManifestEntryClosure(budget, manifest) {
  const files = collectManifestEntryClosure(manifest, budget.entry || 'index.html');
  const size = files.reduce((sum, relativeFile) => {
    return sum + getFileSize(path.join(DIST_ROOT, relativeFile), Boolean(budget.gzip));
  }, 0);

  return {
    size,
    files,
  };
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function expandGlob(pattern) {
  if (typeof pattern !== 'string' || pattern.length === 0) {
    return [];
  }

  const normalizedPattern = pattern.split(/[\\/]+/).join(path.sep);
  const directory = path.resolve(ROOT, path.dirname(normalizedPattern));
  const filePattern = path.basename(normalizedPattern);

  if (!fs.existsSync(directory)) {
    return [];
  }

  if (!filePattern.includes('*')) {
    const filePath = path.join(directory, filePattern);
    return fs.existsSync(filePath) ? [filePath] : [];
  }

  const matcher = new RegExp(`^${escapeRegex(filePattern).replace(/\\\*/g, '.*')}$`);

  return fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && matcher.test(entry.name))
    .map((entry) => path.join(directory, entry.name));
}

function measureGlobSum(budget) {
  if (typeof budget.path !== 'string' || budget.path.length === 0) {
    throw new Error(`Budget "${budget.name}" requires a path`);
  }

  const files = expandGlob(budget.path);
  if (files.length === 0) {
    throw new Error(`Budget "${budget.name}" matched no files: ${budget.path}`);
  }

  const size = files.reduce((sum, filePath) => {
    return sum + getFileSize(filePath, Boolean(budget.gzip));
  }, 0);

  return {
    size,
    files: files.map(toReportPath),
  };
}

function measureGlobMax(budget) {
  if (typeof budget.path !== 'string' || budget.path.length === 0) {
    throw new Error(`Budget "${budget.name}" requires a path`);
  }

  const files = expandGlob(budget.path);
  if (files.length === 0) {
    throw new Error(`Budget "${budget.name}" matched no files: ${budget.path}`);
  }

  const measurements = files.map((filePath) => ({
    filePath,
    size: getFileSize(filePath, Boolean(budget.gzip)),
  }));
  const largest = measurements.reduce((current, candidate) =>
    candidate.size > current.size ? candidate : current
  );

  return {
    size: largest.size,
    files: [toReportPath(largest.filePath)],
  };
}

function measureBudget(budget, manifest) {
  const strategy =
    budget.strategy ||
    (budget.name === 'Initial Load (Critical Path)' ? 'manifest-entry-closure' : 'glob-sum');

  if (strategy === 'manifest-entry-closure') {
    return measureManifestEntryClosure(budget, manifest);
  }

  if (strategy === 'glob-sum') {
    return measureGlobSum(budget);
  }

  if (strategy === 'glob-max') {
    return measureGlobMax(budget);
  }

  throw new Error(`Unsupported strategy "${strategy}" for budget "${budget.name}"`);
}

function formatBytes(bytes) {
  if (bytes < 1024) {
    return `${bytes.toFixed(0)} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(2)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function printTable(results) {
  console.log('\nBundle Size Report\n');
  console.log('Name'.padEnd(34) + 'Current'.padEnd(16) + 'Limit'.padEnd(14) + 'Status');
  console.log('-'.repeat(74));

  for (const result of results) {
    console.log(
      result.name.padEnd(34) +
        formatBytes(result.size).padEnd(16) +
        formatBytes(result.sizeLimit).padEnd(14) +
        (result.passed ? 'PASS' : 'FAIL')
    );
  }

  console.log('');
}

function main() {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(`Budget config not found: ${CONFIG_PATH}`);
  }

  if (!fs.existsSync(MANIFEST_PATH)) {
    throw new Error(`Manifest not found: ${MANIFEST_PATH}. Run "npm run build" first.`);
  }

  const budgets = readJson(CONFIG_PATH);
  const manifest = readJson(MANIFEST_PATH);

  const results = budgets.map((budget) => {
    const measurement = measureBudget(budget, manifest);
    const sizeLimit = parseLimitToBytes(budget.limit);

    return {
      name: budget.name,
      size: measurement.size,
      sizeLimit,
      passed: measurement.size <= sizeLimit,
      files: measurement.files,
    };
  });

  if (JSON_MODE) {
    process.stdout.write(JSON.stringify(results, null, 2));
    process.exit(results.every((result) => result.passed) ? 0 : 1);
  }

  printTable(results);

  const failures = results.filter((result) => !result.passed);
  if (failures.length > 0) {
    console.error('Bundle budget violations detected.\n');
    for (const failure of failures) {
      console.error(
        `- ${failure.name}: ${formatBytes(failure.size)} exceeds ${formatBytes(failure.sizeLimit)}`
      );
    }
    process.exit(1);
  }

  console.log('All bundle budgets are within limits.\n');
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
