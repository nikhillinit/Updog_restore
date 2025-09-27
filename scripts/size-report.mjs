import fs from 'fs';
import zlib from 'zlib';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assetsDir = path.resolve(__dirname, '..', 'dist', 'public', 'assets');

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

// Display results
console.log('\n📊 Bundle Size Report\n');
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

// Check against target
const TARGET_KB = 400;
const isUnderTarget = total <= TARGET_KB * 1024;

console.log('\n' + (isUnderTarget ? '✅' : '❌') + ` Target: <${TARGET_KB} KB gz (${isUnderTarget ? 'PASS' : 'FAIL'})\n`);

// Exit with error if over target
process.exit(isUnderTarget ? 0 : 1);