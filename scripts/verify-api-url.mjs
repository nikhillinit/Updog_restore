import fs from 'node:fs';
import path from 'node:path';

const expectUrl = process.env.VITE_API_BASE_URL;
if (!expectUrl) {
  console.error('ERROR: VITE_API_BASE_URL not set at build time. This is a required environment variable for production builds.');
  process.exit(1);
}

const distDir = path.resolve('dist', 'public', 'assets');
if (!fs.existsSync(distDir)) {
  console.error(`ERROR: Build directory not found at ${distDir}. Did 'vite build' run successfully?`);
  process.exit(1);
}

const jsFilesContent = fs.readdirSync(distDir)
  .filter(f => f.endsWith('.js'))
  .map(f => fs.readFileSync(path.join(distDir, f), 'utf8'))
  .join('\n');

const urlWithoutTrailingSlash = expectUrl.replace(/\/+$/, '');

if (!jsFilesContent.includes(urlWithoutTrailingSlash)) {
  console.error(`ERROR: API URL was not found baked into the built frontend assets.`);
  console.error(`       Expected to find: ${urlWithoutTrailingSlash}`);
  process.exit(1);
}

console.log(`✅ OK: API URL successfully baked into production assets -> ${urlWithoutTrailingSlash}`);