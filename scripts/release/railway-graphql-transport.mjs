export const RAILWAY_GRAPHQL_URL = 'https://backboard.railway.com/graphql/v2';

export function safeErrorMessage(error, token = '') {
  const message = error instanceof Error ? error.message : String(error);
  return token ? message.replaceAll(token, '[REDACTED]') : message;
}

// Returns the raw GraphQL payload; callers own `payload.errors` handling.
// The RAILWAY_TOKEN secret is a Railway project token, which authenticates
// via the Project-Access-Token header — never Authorization: Bearer
// (project-token queries like `projectToken { ... }` reject bearer auth).
export async function postRailwayGraphql({
  token,
  query,
  variables = {},
  fetchImpl = globalThis.fetch,
  operation = 'Railway GraphQL request',
  deadlineAt,
  now = Date.now,
} = {}) {
  if (typeof token !== 'string' || token.trim() === '') {
    throw new Error('Railway GraphQL token is required');
  }
  if (typeof query !== 'string' || query.trim() === '') {
    throw new Error(`${operation} query is required`);
  }
  if (typeof fetchImpl !== 'function') {
    throw new Error('fetch is unavailable');
  }

  let signal;
  if (deadlineAt !== undefined) {
    if (!Number.isFinite(deadlineAt)) {
      throw new Error(`${operation} deadline must be finite`);
    }
    const remainingMs = Math.ceil(deadlineAt - now());
    if (remainingMs <= 0) {
      throw new Error(`${operation} deadline exceeded before network request`);
    }
    signal = AbortSignal.timeout(remainingMs);
  }

  let response;
  try {
    response = await fetchImpl(RAILWAY_GRAPHQL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Project-Access-Token': token,
      },
      body: JSON.stringify({ query, variables }),
      ...(signal ? { signal } : {}),
    });
  } catch (error) {
    if (signal?.aborted) {
      throw new Error(`${operation} deadline exceeded during network request`, { cause: error });
    }
    throw new Error(`${operation} network request failed: ${safeErrorMessage(error, token)}`, {
      cause: error,
    });
  }

  if (!response?.ok) {
    const status = Number.isInteger(response?.status) ? response.status : 'unknown';
    const statusText = typeof response?.statusText === 'string' ? ` ${response.statusText}` : '';
    throw new Error(`${operation} HTTP request failed: ${status}${statusText}`);
  }

  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    if (signal?.aborted) {
      throw new Error(`${operation} deadline exceeded during network request`, { cause: error });
    }
    throw new Error(`${operation} response was not valid JSON`, { cause: error });
  }

  return payload;
}
