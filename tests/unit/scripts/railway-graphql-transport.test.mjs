import { describe, expect, it, vi } from 'vitest';

import {
  postRailwayGraphql,
  RAILWAY_GRAPHQL_URL,
} from '../../../scripts/release/railway-graphql-transport.mjs';

const TOKEN = 'railway-token-secret';
const QUERY = 'query Example($projectId: String!) { project(id: $projectId) { id } }';
const VARIABLES = { projectId: 'project-1' };

describe('railway-graphql-transport', () => {
  it('sends authenticated GraphQL requests through injected fetch without network access', async () => {
    const globalFetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      new Error('network must not be used')
    );
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { project: { id: 'project-1' } } }),
    });

    try {
      await expect(
        postRailwayGraphql({
          token: TOKEN,
          query: QUERY,
          variables: VARIABLES,
          fetchImpl,
        })
      ).resolves.toEqual({ data: { project: { id: 'project-1' } } });
    } finally {
      globalFetch.mockRestore();
    }

    expect(globalFetch).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(RAILWAY_GRAPHQL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Project-Access-Token': TOKEN,
      },
      body: JSON.stringify({ query: QUERY, variables: VARIABLES }),
    });
  });

  it('propagates HTTP errors with status context', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    });

    await expect(
      postRailwayGraphql({
        token: TOKEN,
        query: QUERY,
        variables: VARIABLES,
        fetchImpl,
        operation: 'Railway scope',
      })
    ).rejects.toThrow('Railway scope HTTP request failed: 401 Unauthorized');
  });

  it('returns GraphQL-error payloads untouched so callers own errors handling', async () => {
    const payload = {
      errors: [
        { message: 'Project not found', extensions: { code: 'NOT_FOUND' } },
        { message: 'Request rejected' },
      ],
    };
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => payload,
    });

    await expect(
      postRailwayGraphql({
        token: TOKEN,
        query: QUERY,
        variables: VARIABLES,
        fetchImpl,
        operation: 'Railway topology',
      })
    ).resolves.toEqual(payload);
  });

  it('aborts unresolved network requests at the absolute deadline', async () => {
    const fetchImpl = vi.fn(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener('abort', () => reject(options.signal.reason), {
            once: true,
          });
        })
    );

    await expect(
      postRailwayGraphql({
        token: TOKEN,
        query: QUERY,
        variables: VARIABLES,
        fetchImpl,
        operation: 'Railway reconciliation',
        deadlineAt: Date.now() + 10,
      })
    ).rejects.toThrow('Railway reconciliation deadline exceeded during network request');
    expect(fetchImpl.mock.calls[0][1].signal).toBeInstanceOf(globalThis.AbortSignal);
  });

  it('aborts unresolved response bodies at the absolute deadline', async () => {
    const fetchImpl = vi.fn(async (_url, options) => ({
      ok: true,
      json: () =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener('abort', () => reject(options.signal.reason), {
            once: true,
          });
        }),
    }));

    await expect(
      postRailwayGraphql({
        token: TOKEN,
        query: QUERY,
        fetchImpl,
        operation: 'Railway reconciliation',
        deadlineAt: Date.now() + 10,
      })
    ).rejects.toThrow('Railway reconciliation deadline exceeded during network request');
  });

  it('rejects expired deadlines before network mutation', async () => {
    const fetchImpl = vi.fn();

    await expect(
      postRailwayGraphql({
        token: TOKEN,
        query: QUERY,
        fetchImpl,
        deadlineAt: 99,
        now: () => 100,
      })
    ).rejects.toThrow('deadline exceeded before network request');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
