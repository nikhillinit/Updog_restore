import { readFileSync } from 'fs';

const lockFile = JSON.parse(readFileSync('package-lock.json', 'utf8'));
const packages = lockFile.packages || {};

const problematic = [];
const gplLike = ['GPL', 'LGPL', 'AGPL'];

for (const [name, info] of Object.entries(packages)) {
  if (name === '' || typeof info.license !== 'string') continue;
  const lic = info.license.toUpperCase();

  if (gplLike.some(g => lic.includes(g))) {
    problematic.push({ name: name.replace('node_modules/', ''), license: info.license });
  }
}

if (problematic.length > 0) {
  console.log('GPL-family Licenses Found:');
  problematic.forEach(p => console.log(`  - ${p.name}: ${p.license}`));
} else {
  console.log('No GPL/LGPL/AGPL licenses found - all licenses compatible with MIT.');
}
