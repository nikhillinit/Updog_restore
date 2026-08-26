import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

describe('task evidence append-only boundary', () => {
  it('exposes create and list only: no update or delete route/service', async () => {
    const [routeSource, serviceSource] = await Promise.all([
      readFile('server/routes/operating-object-tasks.ts', 'utf8'),
      readFile('server/services/operating-objects/task-evidence-link-service.ts', 'utf8'),
    ]);

    expect(routeSource).toContain(
      "router['post'](\n  '/api/funds/:fundId/tasks/:taskId/evidence-links'"
    );
    expect(routeSource).toContain(
      "router['get'](\n  '/api/funds/:fundId/tasks/:taskId/evidence-links'"
    );
    expect(routeSource).not.toMatch(/router\[['"](?:put|patch|delete)['"]\]\([^)]*evidence-links/i);
    expect(serviceSource).not.toMatch(
      /export\s+(?:async\s+)?function\s+(?:update|delete)TaskEvidenceLink/
    );
  });
});
