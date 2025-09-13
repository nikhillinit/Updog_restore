import os from 'os';

console.log(JSON.stringify({
  cpus: os.cpus()?.length,
  totalMemGB: Math.round(os.totalmem() / 1e9),
  freeMemGB: Math.round(os.freemem() / 1e9),
  node: process.version,
  platform: process.platform,
  arch: process.arch,
  loadAvg: os.loadavg(),
  uptime: os.uptime()
}, null, 2));