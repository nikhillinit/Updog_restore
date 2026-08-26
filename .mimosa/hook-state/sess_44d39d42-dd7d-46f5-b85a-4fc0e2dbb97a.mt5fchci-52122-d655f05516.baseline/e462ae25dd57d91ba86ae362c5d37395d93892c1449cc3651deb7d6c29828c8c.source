import { execFileSync } from 'node:child_process';

export function runDrizzlePush(connectionString: string): void {
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  execFileSync(npmCommand, ['run', 'db:push', '--', '--force'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: connectionString,
    },
    stdio: 'pipe',
  });
}
