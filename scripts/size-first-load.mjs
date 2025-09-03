import fs from 'node:fs';
import path from 'node:path';

const dist = 'dist/public';

// Check if dist exists
if (!fs.existsSync(dist)) {
  console.error('No dist/public directory found. Did you run `npm run build`?');
  process.exit(1);
}

// Read index.html to find entry point
const indexPath = path.join(dist, 'index.html');
if (!fs.existsSync(indexPath)) {
  console.error('No index.html found in dist/public');
  process.exit(1);
}

const html = fs.readFileSync(indexPath, 'utf8');

// Extract all script tags with type="module"
const scriptMatches = html.matchAll(/<script[^>]+type="module"[^>]+src="([^"]+)"/g);
const scripts = [];

for (const match of scriptMatches) {
  const src = match[1].replace(/^\//, '');
  scripts.push(src);
}

// Extract all link tags with rel="modulepreload"
const preloadMatches = html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+)"/g);
for (const match of preloadMatches) {
  const href = match[1].replace(/^\//, '');
  scripts.push(href);
}

// Calculate total size
let totalSize = 0;
const files = [];

for (const script of scripts) {
  const filePath = path.join(dist, script);
  if (fs.existsSync(filePath)) {
    const size = fs.statSync(filePath).size;
    totalSize += size;
    files.push({ file: script, size: Math.round(size / 1024) });
  }
}

// For debugging, we can output detailed info to stderr
if (process.env.VERBOSE) {
  console.error('First-load JS files:');
  files.forEach(f => console.error(`  ${f.file}: ${f.size} KB`));
  console.error('---');
}

// Output just the total in KB
console.log(Math.round(totalSize / 1024));