import { describe, expect, it } from 'vitest';

import {
  analyzeRoutePersistenceImports,
  findRoutePersistenceImports,
} from '../../../scripts/guardrails/route-persistence-imports.mjs';

describe('route-persistence-imports', () => {
  it('allows grandfathered route files while rejecting new direct persistence imports', () => {
    const routeFiles = [
      {
        filePath: 'server/routes/funds.ts',
        source: "import { db } from '../db';\n",
      },
      {
        filePath: 'server/routes/new-report.ts',
        source: "import { storage } from '../storage';\n",
      },
      {
        filePath: 'server/routes/service-backed.ts',
        source: "import { reportService } from '../services/report-service';\n",
      },
    ];

    const result = analyzeRoutePersistenceImports({
      routeFiles,
      allowedRouteFiles: ['server/routes/funds.ts'],
    });

    expect(result.currentRouteFiles).toEqual([
      'server/routes/funds.ts',
      'server/routes/new-report.ts',
    ]);
    expect(result.unexpectedRouteFiles).toEqual(['server/routes/new-report.ts']);
    expect(result.retiredAllowedRouteFiles).toEqual([]);
    expect(result.unexpectedImports).toEqual([
      expect.objectContaining({
        filePath: 'server/routes/new-report.ts',
        specifier: '../storage',
      }),
    ]);
  });

  it('normalizes Windows paths before comparing against the allowlist', () => {
    const result = analyzeRoutePersistenceImports({
      routeFiles: [
        {
          filePath: 'server\\routes\\v1\\reserve-approvals.ts',
          source: "import { db } from '../../db';\n",
        },
      ],
      allowedRouteFiles: ['server/routes/v1/reserve-approvals.ts'],
    });

    expect(result.unexpectedRouteFiles).toEqual([]);
  });

  it('detects route imports from db and storage persistence modules', () => {
    const imports = findRoutePersistenceImports({
      filePath: 'server/routes/reports.ts',
      source: [
        "import { pool } from '../db/pool.js';",
        "import { transaction } from '../db/pg-circuit';",
        "import { storage } from '../storage';",
        "import { db } from '@server/db';",
        "import { reportService } from '../services/report-service';",
      ].join('\n'),
    });

    expect(imports).toEqual([
      expect.objectContaining({ specifier: '../db/pool.js', line: 1 }),
      expect.objectContaining({ specifier: '../db/pg-circuit', line: 2 }),
      expect.objectContaining({ specifier: '../storage', line: 3 }),
      expect.objectContaining({ specifier: '@server/db', line: 4 }),
    ]);
  });
});
