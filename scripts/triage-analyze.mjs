import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const OUT = 'triage-output';
const harPath = join(OUT, 'network.har');
const consolePath = join(OUT, 'console.txt');

function printHeader(title) {
  console.log('\n=== ' + title + ' ===');
}

if (existsSync(consolePath)) {
  const consoleTxt = readFileSync(consolePath, 'utf8');
  printHeader('WIZARD events (first 30)');
  console.log(consoleTxt.split(/\r?\n/).filter(l => l.includes('WIZARD')).slice(0, 30).join('\n') || '(none)');

  printHeader('Store publish lines (first 20)');
  console.log(consoleTxt.split(/\r?\n/).filter(l => l.toLowerCase().includes('fund-store publish')).slice(0, 20).join('\n') || '(none)');

  printHeader('Error lines (first 20)');
  const errs = ['maximum update depth', 'failed to fetch dynamically imported module', 'getSnapshot'];
  console.log(consoleTxt.split(/\r?\n/).filter(l => errs.some(e => l.toLowerCase().includes(e))).slice(0, 20).join('\n') || '(none)');
}

if (existsSync(harPath)) {
  const har = JSON.parse(readFileSync(harPath, 'utf8'));
  const entries = (har.log?.entries ?? []);
  const bad = entries.filter(e => e.response?.status >= 400);
  printHeader(`HAR 4xx/5xx (${bad.length})`);
  for (const e of bad.slice(0, 30)) {
    const u = e.request?.url ?? '';
    const s = e.response?.status;
    const t = e._resourceType || e.request?.headers?.find(h => h.name.toLowerCase() === 'content-type')?.value || '';
    console.log(`${s} ${u}`);
    if (/src\/pages\/fund-setup\.tsx/.test(u)) {
      console.log('  ↳ fund-setup dynamic import failed (check dev overlay / Response in Network)');
    }
  }
} else {
  printHeader('HAR');
  console.log('(missing triage-output/network.har)');
}