// Skip in CI
if (process.env.CI) {
  console.log('📋 Skipping browser open in CI');
  process.exit(0);
}

const open = require('open');

const base = process.env.QA_BASE || 'http://localhost:5173';
const checks = [
  { url: '/reserves-demo', note: 'Ratio updates with scenarios' },
  { url: '/allocation-manager', note: 'Shows computed (not 67%) reserves' },
];

(async () => {
  for (const { url, note } of checks) {
    console.log(`🧪 ${note}: ${base}${url}`);
    await open(`${base}${url}`);
  }
})();
