#!/usr/bin/env node
// scripts/verify-backup-integrity.cjs
const fs = require('fs'), path = require('path'), crypto = require('crypto');

const dir = process.argv[2] || './backups';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql'));
if (!files.length) { console.error('no backups'); process.exit(1); }
const latest = files.sort().pop();
const sqlPath = path.join(dir, latest);
const shaPath = sqlPath + '.sha256';
const exp = fs.readFileSync(shaPath, 'utf8').trim();

const hash = crypto.createHash('sha256');
const stream = fs.createReadStream(sqlPath);
stream.on('data', c => hash.update(c));
stream.on('end', () => {
  const act = hash.digest('hex');
  if (act !== exp) { console.error('❌ checksum mismatch'); process.exit(1); }
  console.log('✅ checksum OK:', path.basename(sqlPath));
});
