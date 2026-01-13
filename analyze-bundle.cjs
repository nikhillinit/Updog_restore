const fs = require('fs');

const data = JSON.parse(fs.readFileSync('./dist/stats.json', 'utf8'));

// Group by npm package
const pkgSizes = {};

// Traverse nodeParts and group by package
Object.entries(data.nodeParts).forEach(([uid, part]) => {
  const metaUid = part.metaUid;
  const meta = data.nodeMetas[metaUid];
  if (!meta || !meta.id) return;

  const path = meta.id;
  const match = path.match(/node_modules\/(@?[^\/]+(?:\/[^\/]+)?)\//);

  if (match) {
    const pkg = match[1];
    if (!pkgSizes[pkg]) {
      pkgSizes[pkg] = { raw: 0, gzip: 0 };
    }
    pkgSizes[pkg].raw += part.renderedLength || 0;
    pkgSizes[pkg].gzip += part.gzipLength || 0;
  }
});

// Sort by gzip size
const sorted = Object.entries(pkgSizes)
  .sort(([,a], [,b]) => b.gzip - a.gzip)
  .slice(0, 25);

console.log('Top 25 npm packages by gzipped bundle contribution:\n');
console.log('   Gzipped      Raw       Package');
console.log('----------  ---------  ----------');
sorted.forEach(([pkg, sizes]) => {
  const gzipKb = (sizes.gzip / 1024).toFixed(1);
  const rawKb = (sizes.raw / 1024).toFixed(1);
  console.log(`${gzipKb.padStart(8)} KB  ${rawKb.padStart(7)} KB  ${pkg}`);
});

const totalGzip = sorted.reduce((sum, [,sizes]) => sum + sizes.gzip, 0);
const totalRaw = sorted.reduce((sum, [,sizes]) => sum + sizes.raw, 0);
console.log('\n' + '='.repeat(60));
console.log(`Total:      ${(totalGzip / 1024).toFixed(1)} KB  ${(totalRaw / 1024).toFixed(1)} KB  (top 25)`);
