import fs from 'fs';
import zlib from 'zlib';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assetsDir = path.resolve(__dirname, '..', 'dist', 'public', 'assets');
const distRoot = path.resolve(__dirname, '..', 'dist', 'public');
const manifestPath = path.join(distRoot, '.vite', 'manifest.json');
const budgetsPath = path.resolve(__dirname, '..', '.size-limit.json');

// Check if dist exists
if (!fs.existsSync(assetsDir)) {
  console.error('Error: Build artifacts not found. Run "npm run build" first.');
  process.exit(1);
}

let total = 0;
const entries = [];

// Analyze all JS and CSS files
for (const file of fs.readdirSync(assetsDir)) {
  if (!/\.(js|css)$/.test(file)) continue;
  
  const filePath = path.join(assetsDir, file);
  const content = fs.readFileSync(filePath);
  const gzipped = zlib.gzipSync(content);
  
  entries.push({
    name: file,
    size: content.length,
    gzipSize: gzipped.length
  });
  
  total += gzipped.length;
}

// Sort by gzipped size descending
entries.sort((a, b) => b.gzipSize - a.gzipSize);

function parseLimitToBytes(limit) {
  const match = limit.trim().match(/^([\d.]+)\s*(B|KB|MB)$/i);
  if (!match) {
    throw new Error(`Invalid limit format: ${limit}`);
  }

  const value = Number.parseFloat(match[1]);
  const unit = match[2].toUpperCase();

  if (unit === 'B') return value;
  if (unit === 'KB') return value * 1024;
  return value * 1024 * 1024;
}

function collectCriticalPathFiles() {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const visited = new Set();
  const files = new Set();

  function visit(key) {
    if (visited.has(key)) return;
    const entry = manifest[key];
    if (!entry) {
      throw new Error(`Manifest entry not found: ${key}`);
    }

    visited.add(key);
    if (entry.file) files.add(entry.file);
    for (const css of entry.css || []) files.add(css);
    for (const importedKey of entry.imports || []) visit(importedKey);
  }

  visit('index.html');
  return [...files];
}

const criticalBudgetConfig = JSON.parse(fs.readFileSync(budgetsPath, 'utf8')).find(
  (budget) => budget.name === 'Initial Load (Critical Path)'
);

if (!criticalBudgetConfig) {
  console.error('Error: Initial Load (Critical Path) budget not found in .size-limit.json');
  process.exit(1);
}

const criticalFiles = collectCriticalPathFiles().map((file) => {
  const filePath = path.join(distRoot, file);
  const content = fs.readFileSync(filePath);
  return {
    name: file,
    size: content.length,
    gzipSize: zlib.gzipSync(content).length,
  };
});

const criticalRawTotal = criticalFiles.reduce((sum, file) => sum + file.size, 0);
const criticalGzipTotal = criticalFiles.reduce((sum, file) => sum + file.gzipSize, 0);
const criticalBudgetBytes = parseLimitToBytes(criticalBudgetConfig.limit);
const isWithinCriticalBudget = criticalGzipTotal <= criticalBudgetBytes;

// Display results
console.log('\nBundle Size Report\n');
console.log('Top 10 Assets (by gzipped size):');
console.log('-'.repeat(60));

for (const entry of entries.slice(0, 10)) {
  const name = entry.name.length > 30 ? entry.name.slice(0, 27) + '...' : entry.name;
  const size = `${(entry.size / 1024).toFixed(1)} KB`;
  const gzipSize = `${(entry.gzipSize / 1024).toFixed(1)} KB gz`;
  console.log(`${name.padEnd(32)} ${size.padStart(10)} → ${gzipSize.padStart(10)}`);
}

console.log('-'.repeat(60));
console.log(`${'TOTAL'.padEnd(32)} ${' '.repeat(10)}   ${`${(total / 1024).toFixed(1)} KB gz`.padStart(10)}`);

console.log('\nCritical Path (manifest entry closure):');
for (const entry of criticalFiles.sort((a, b) => b.gzipSize - a.gzipSize)) {
  const name = entry.name.length > 40 ? entry.name.slice(0, 37) + '...' : entry.name;
  const size = `${(entry.size / 1024).toFixed(1)} KB`;
  const gzipSize = `${(entry.gzipSize / 1024).toFixed(1)} KB gz`;
  console.log(`${name.padEnd(42)} ${size.padStart(10)} → ${gzipSize.padStart(10)}`);
}

console.log(
  `\n${isWithinCriticalBudget ? 'PASS' : 'FAIL'} Critical Path: ${(criticalRawTotal / 1024).toFixed(1)} KB raw / ${(
    criticalGzipTotal / 1024
  ).toFixed(1)} KB gz`
);
console.log(
  `Budget: <${(criticalBudgetBytes / 1024).toFixed(0)} KB gz (${isWithinCriticalBudget ? 'PASS' : 'FAIL'})\n`
);

// Exit with error if the critical path exceeds budget
process.exit(isWithinCriticalBudget ? 0 : 1);
