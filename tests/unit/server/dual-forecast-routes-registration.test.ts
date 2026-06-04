import { describe, expect, it } from 'vitest';
import { vi } from 'vitest';

async function readRepoFile(relativePath: string): Promise<string> {
  const actualFs = await vi.importActual<typeof import('fs')>('fs');
  const { resolve } = await import('node:path');
  return actualFs.readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

describe('dual forecast route registration', () => {
  it('keeps dual forecast mounted on both server startup surfaces', async () => {
    const appSource = await readRepoFile('server/app.ts');
    const routesSource = await readRepoFile('server/routes.ts');

    expect(appSource).toContain("import dualForecastRouter from './routes/dual-forecast.js'");
    expect(appSource).toContain("app.use('/api', dualForecastRouter)");
    expect(routesSource).toContain("await import('./routes/dual-forecast.js')");
    expect(routesSource).toContain("app.use('/api', dualForecastRoutes.default)");
  });
});
