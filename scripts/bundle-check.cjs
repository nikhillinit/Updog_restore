#!/usr/bin/env node
/* Simple gzipped size guard for dist assets (JS/CSS).
   Usage: node scripts/bundle-check.cjs --dir=dist --maxKB=350
*/
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const argv = Object.fromEntries(process.argv.slice(2).map(a => a.split('=')));
const dist = argv['--dir'] || 'dist';
const limitKB = Number(argv['--maxKB'] || 350);

const gzipSize = (buf) => zlib.gzipSync(buf, { level: 9 }).length;

const walk = (p) => {
  const s = fs.statSync(p);
  if (s.isDirectory()) return fs.readdirSync(p).flatMap(f => walk(path.join(p, f)));
  return [p];
};

const files = walk(dist).filter(f => /\.(js|css)$/.test(f) && !/\.map$/.test(f));
if (files.length === 0) {
  console.error(`No JS/CSS assets found in ${dist}`);
  process.exit(2);
}

let fail = false;
console.log(`\n📦 Bundle check (gzipped) — limit: ${limitKB} KB per asset\n`);

files.forEach(f => {
  const gz = gzipSize(fs.readFileSync(f));
  const kb = (gz / 1024).toFixed(1);
  const mark = gz / 1024 > limitKB ? '❌' : '✅';
  console.log(`${mark} ${kb} KB  ${path.relative(process.cwd(), f)}`);
  if (gz / 1024 > limitKB) fail = true;
});

console.log('');
if (fail) {
  console.error(`Bundle check failed: at least one asset exceeds ${limitKB} KB gzipped.`);
  process.exit(1);
} else {
  console.log('✅ Bundle check passed.\n');
}