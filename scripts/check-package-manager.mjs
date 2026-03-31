const userAgent = process.env.npm_config_user_agent ?? '';
const execPath = process.env.npm_execpath ?? '';

const isNpmUserAgent = userAgent.startsWith('npm/');
const isNpmExecPath = /(^|[\\/])npm(?:-cli)?(?:\.js)?$/i.test(execPath) || execPath.includes('npm-cli.js');

if (isNpmUserAgent || isNpmExecPath) {
  process.exit(0);
}

// When the script is invoked outside npm lifecycle context, skip enforcement.
if (!userAgent && !execPath) {
  process.exit(0);
}

const detected = userAgent || execPath;

console.error('This repository uses npm for dependency management.');
console.error(`Detected package manager: ${detected}`);
console.error('Use `npm install` or `npm ci` instead of pnpm, yarn, or bun.');
process.exit(1);
