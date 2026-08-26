import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseDocument } from 'yaml';

import { swaggerOptions, swaggerSpec } from '../../../server/config/swagger';

type OpenApiDocument = {
  components?: { securitySchemes?: Record<string, Record<string, unknown>> };
  paths?: Record<string, Record<string, { security?: unknown }>>;
};

function normalizedSecurityRequirements(value: unknown): string[][] {
  if (!Array.isArray(value)) return [];
  return value.map((requirement) =>
    Object.keys(requirement as Record<string, unknown>)
      .map((key) => key.toLowerCase())
      .sort()
  );
}

function expectCompositeSecurityOnUnsafeOperations(specification: OpenApiDocument): void {
  const unsafeMethods = new Set(['post', 'put', 'patch', 'delete']);
  const unsafeOperations = Object.entries(specification.paths ?? {}).flatMap(([path, pathItem]) =>
    Object.entries(pathItem)
      .filter(([method]) => unsafeMethods.has(method.toLowerCase()))
      .map(([method, operation]) => ({ method, path, security: operation.security }))
  );

  expect(unsafeOperations.length).toBeGreaterThan(0);
  for (const operation of unsafeOperations) {
    expect(
      normalizedSecurityRequirements(operation.security),
      `${operation.method.toUpperCase()} ${operation.path}`
    ).toEqual(expect.arrayContaining([['cookieauth', 'csrftoken'], ['bearerauth']]));
  }
}

describe('D4 authentication transport contract', () => {
  it('documents browser cookie and machine Bearer as distinct alternatives', () => {
    const definition = swaggerOptions.definition as {
      components?: { securitySchemes?: Record<string, unknown> };
      security?: Array<Record<string, unknown>>;
      paths?: Record<string, { post?: { security?: unknown } }>;
    };

    expect(definition.components?.securitySchemes).toMatchObject({
      cookieAuth: {
        type: 'apiKey',
        in: 'cookie',
        name: 'updog.session',
        description: expect.stringMatching(/unsafe requests.*X-CSRF-Token/i),
      },
      csrfToken: {
        type: 'apiKey',
        in: 'header',
        name: 'X-CSRF-Token',
        description: expect.stringMatching(/cookie-authenticated unsafe requests/i),
      },
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    });
    expect(definition.security).toEqual([{ cookieAuth: [] }, { bearerAuth: [] }]);
    expect(
      normalizedSecurityRequirements(definition.paths?.['/api/auth/logout']?.post?.security)
    ).toEqual(expect.arrayContaining([['cookieauth', 'csrftoken'], ['bearerauth']]));
    expectCompositeSecurityOnUnsafeOperations(swaggerSpec as OpenApiDocument);
  });

  it.each([
    'server/openapi/api-spec.yaml',
    'server/openapi/parallel-contracts.yaml',
    'docs/openapi.yaml',
  ])('%s parses uniquely and carries the semantic cookie/CSRF contract', (relativePath) => {
    const source = fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');
    const document = parseDocument(source, { uniqueKeys: false });
    const bearerBlock = source.match(
      /^ {4}(?:bearerAuth|BearerAuth):\s*$([\s\S]*?)(?=^(?: {2}\S|\S)|$(?![\s\S]))/m
    )?.[1];
    expect(bearerBlock).toBeDefined();
    expect(bearerBlock?.match(/^ {6}description:/gm)).toHaveLength(1);

    const specification = document.toJS() as OpenApiDocument;
    const schemes = Object.values(specification.components?.securitySchemes ?? {});
    expect(schemes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ in: 'cookie', name: 'updog.session' }),
        expect.objectContaining({
          in: 'header',
          name: 'X-CSRF-Token',
          description: expect.stringMatching(/cookie-authenticated unsafe requests/i),
        }),
        expect.objectContaining({ type: 'http', scheme: 'bearer' }),
      ])
    );
    expect(
      normalizedSecurityRequirements(specification.paths?.['/auth/logout']?.post?.security)
    ).toEqual(expect.arrayContaining([['cookieauth', 'csrftoken'], ['bearerauth']]));
    expectCompositeSecurityOnUnsafeOperations(specification);
  });

  it('mounts CSRF after authentication on both runtime surfaces', () => {
    const makeApp = fs.readFileSync(path.resolve(process.cwd(), 'server/app.ts'), 'utf8');
    const createServer = fs.readFileSync(path.resolve(process.cwd(), 'server/server.ts'), 'utf8');

    expect(makeApp.indexOf('const requireApiAuth = requireAuth();')).toBeLessThan(
      makeApp.indexOf("app.use('/api', requireCsrf)")
    );
    expect(createServer.indexOf('requireSecureContext(req, res, next)')).toBeLessThan(
      createServer.indexOf("app.use('/api', requireCsrf)")
    );
    expect(makeApp.toLowerCase()).toContain('x-csrf-token');
    expect(createServer).toContain("'X-CSRF-Token'");
  });
});
