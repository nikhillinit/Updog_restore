import process from 'node:process';

const secrets = 'parent-secret|parent-session-secret|parent-vercel-token-secret|must-not-reach-child';

export default function secretLeakingVercelHandler() {
  process.stdout.write(`${secrets}\n`);
  process.stderr.write(`${secrets}\n`);
  throw new Error(secrets);
}
