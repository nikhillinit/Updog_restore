import { describe, expect, it } from 'vitest';
import { vi } from 'vitest';

async function readRepoFile(relativePath: string): Promise<string> {
  const actualFs = await vi.importActual<typeof import('fs')>('fs');
  const { resolve } = await import('node:path');
  return actualFs.readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

describe('dual forecast route registration', () => {
  it('keeps dual forecast mounted on both server startup surfaces', async () => {
    // Post common-manifest convergence (#1090) both entrypoints mount shared routers
    // through server/routes/mount-common-routes.ts: prove the delegation chain instead
    // of direct per-entrypoint imports. Group membership/order completeness is owned by
    // tests/unit/server/common-route-manifest.test.ts.
    const commonMapSource = await readRepoFile('server/routes/mount-common-routes.ts');
    expect(commonMapSource).toContain("import dualForecastRouter from './dual-forecast.js'");
    expect(commonMapSource).toMatch(
      /'dual-forecast':\s*at\(\s*'\/api'\s*,\s*dualForecastRouter\s*\)/
    );

    const appSource = await readRepoFile('server/app.ts');
    const routesSource = await readRepoFile('server/routes.ts');
    expect(appSource).toContain("mountCommonRoutes(app, { surface: 'make_app'");
    expect(routesSource).toContain("mountCommonRoutes(app, { surface: 'register_routes'");
  });
});
