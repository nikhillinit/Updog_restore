import { afterEach, describe, expect, it, vi } from 'vitest';

type JwtRuntimeConfig = {
  JWT_ALG: 'HS256' | 'RS256';
  JWT_SECRET?: string;
  JWT_JWKS_URL?: string;
  JWT_ISSUER: string;
  JWT_AUDIENCE: string;
  NODE_ENV: 'development' | 'test' | 'staging' | 'production';
  REQUIRE_AUTH: boolean;
  DEFAULT_USER_ID: number;
};

type DecodedJwt = {
  header: { kid?: string };
  payload: Record<string, unknown>;
  signature: string;
};

type JwtVerifyOptions = {
  algorithms: string[];
  issuer: string;
  audience: string;
};

type JwtMock = {
  decode: ReturnType<
    typeof vi.fn<(token: string, options: { complete: true }) => DecodedJwt | null>
  >;
  verify: ReturnType<
    typeof vi.fn<(token: string, key: string, options: JwtVerifyOptions) => Record<string, unknown>>
  >;
  sign: ReturnType<typeof vi.fn<(data: string | Buffer | object) => string>>;
};

type SigningKey = {
  getPublicKey: () => string;
};

type JwksClient = {
  getSigningKey: (kid: string) => Promise<SigningKey>;
};

type JwksClientOptions = {
  jwksUri: string;
  cache: boolean;
  cacheMaxAge: number;
  rateLimit: boolean;
  jwksRequestsPerMinute: number;
};

const rs256Config: JwtRuntimeConfig = {
  JWT_ALG: 'RS256',
  JWT_JWKS_URL: 'https://issuer.example/.well-known/jwks.json',
  JWT_ISSUER: 'issuer',
  JWT_AUDIENCE: 'audience',
  NODE_ENV: 'test',
  REQUIRE_AUTH: true,
  DEFAULT_USER_ID: 1,
};

const hs256Config: JwtRuntimeConfig = {
  JWT_ALG: 'HS256',
  JWT_SECRET: 'test-jwt-secret-must-be-at-least-32-characters-long',
  JWT_ISSUER: 'issuer',
  JWT_AUDIENCE: 'audience',
  NODE_ENV: 'test',
  REQUIRE_AUTH: true,
  DEFAULT_USER_ID: 1,
};

function installJwtMocks(config: JwtRuntimeConfig = rs256Config) {
  const getConfigMock = vi.fn<() => JwtRuntimeConfig>(() => config);
  const decodeMock = vi.fn<(token: string, options: { complete: true }) => DecodedJwt | null>(
    () => ({
      header: { kid: 'kid-1' },
      payload: {},
      signature: 'sig',
    })
  );
  const verifyMock = vi.fn<
    (token: string, key: string, options: JwtVerifyOptions) => Record<string, unknown>
  >((token) => ({ sub: token }));
  const signMock = vi.fn<(data: string | Buffer | object) => string>(() => 'signed-token');
  const jwtMock: JwtMock = {
    decode: decodeMock,
    verify: verifyMock,
    sign: signMock,
  };
  const getSigningKeyMock = vi.fn<(kid: string) => Promise<SigningKey>>(async () => ({
    getPublicKey: () => 'public-key',
  }));
  const createJwksClientMock = vi.fn<(options: JwksClientOptions) => JwksClient>(() => ({
    getSigningKey: getSigningKeyMock,
  }));
  let jwksModuleLoadCount = 0;

  vi.doMock('../../../server/config/index.js', () => ({
    getConfig: getConfigMock,
  }));

  vi.doMock('jsonwebtoken', () => ({
    default: jwtMock,
  }));

  vi.doMock('jwks-rsa', () => {
    jwksModuleLoadCount += 1;
    return {
      default: createJwksClientMock,
    };
  });

  return {
    getConfigMock,
    decodeMock,
    verifyMock,
    getSigningKeyMock,
    createJwksClientMock,
    getJwksModuleLoadCount: () => jwksModuleLoadCount,
  };
}

async function importJwtModule() {
  return import('../../../server/lib/auth/jwt.js');
}

describe('jwt JWKS lazy import behavior', () => {
  afterEach(() => {
    vi.doUnmock('../../../server/config/index.js');
    vi.doUnmock('jsonwebtoken');
    vi.doUnmock('jwks-rsa');
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('imports jwt and constructs requireAuth without reading config or loading jwks-rsa', async () => {
    vi.resetModules();
    const mocks = installJwtMocks();

    const mod = await importJwtModule();
    const middleware = mod.requireAuth();

    expect(typeof middleware).toBe('function');
    expect(mocks.getConfigMock).not.toHaveBeenCalled();
    expect(mocks.getJwksModuleLoadCount()).toBe(0);
    expect(mocks.createJwksClientMock).not.toHaveBeenCalled();
  });

  it('does not load jwks-rsa for HS256 verification', async () => {
    vi.resetModules();
    const mocks = installJwtMocks(hs256Config);

    const mod = await importJwtModule();
    await expect(mod.verifyAccessTokenAsync('hs256-token')).resolves.toMatchObject({
      sub: 'hs256-token',
    });

    expect(mocks.getConfigMock).toHaveBeenCalled();
    expect(mocks.verifyMock).toHaveBeenCalledWith('hs256-token', hs256Config.JWT_SECRET, {
      algorithms: ['HS256'],
      issuer: hs256Config.JWT_ISSUER,
      audience: hs256Config.JWT_AUDIENCE,
    });
    expect(mocks.getJwksModuleLoadCount()).toBe(0);
    expect(mocks.createJwksClientMock).not.toHaveBeenCalled();
  });

  it('loads jwks-rsa only when an RS256 token is verified', async () => {
    vi.resetModules();
    const mocks = installJwtMocks();

    const mod = await importJwtModule();
    expect(mocks.getJwksModuleLoadCount()).toBe(0);

    await expect(mod.verifyAccessTokenAsync('rs256-token')).resolves.toMatchObject({
      sub: 'rs256-token',
    });

    expect(mocks.getJwksModuleLoadCount()).toBe(1);
    expect(mocks.createJwksClientMock).toHaveBeenCalledTimes(1);
    expect(mocks.createJwksClientMock).toHaveBeenCalledWith({
      jwksUri: rs256Config.JWT_JWKS_URL,
      cache: true,
      cacheMaxAge: 600000,
      rateLimit: true,
      jwksRequestsPerMinute: 10,
    });
    expect(mocks.getSigningKeyMock).toHaveBeenCalledWith('kid-1');
    expect(mocks.verifyMock).toHaveBeenCalledWith('rs256-token', 'public-key', {
      algorithms: ['RS256'],
      issuer: rs256Config.JWT_ISSUER,
      audience: rs256Config.JWT_AUDIENCE,
    });
  });

  it('shares a single JWKS client init across concurrent RS256 verifications', async () => {
    vi.resetModules();
    const mocks = installJwtMocks();

    const mod = await importJwtModule();
    const [first, second] = await Promise.all([
      mod.verifyAccessTokenAsync('rs256-token-a'),
      mod.verifyAccessTokenAsync('rs256-token-b'),
    ]);

    expect(first).toMatchObject({ sub: 'rs256-token-a' });
    expect(second).toMatchObject({ sub: 'rs256-token-b' });
    expect(mocks.getJwksModuleLoadCount()).toBe(1);
    expect(mocks.createJwksClientMock).toHaveBeenCalledTimes(1);
    expect(mocks.getSigningKeyMock).toHaveBeenCalledTimes(2);
  });

  it('resets failed JWKS client init so later RS256 verification retries', async () => {
    vi.resetModules();
    const mocks = installJwtMocks();
    const initFailure = new Error('jwks init failed');
    mocks.createJwksClientMock
      .mockImplementationOnce(() => {
        throw initFailure;
      })
      .mockImplementationOnce(() => ({
        getSigningKey: mocks.getSigningKeyMock,
      }));

    const mod = await importJwtModule();
    await expect(mod.verifyAccessTokenAsync('first-rs256-token')).rejects.toThrow(initFailure);
    await expect(mod.verifyAccessTokenAsync('second-rs256-token')).resolves.toMatchObject({
      sub: 'second-rs256-token',
    });

    expect(mocks.createJwksClientMock).toHaveBeenCalledTimes(2);
    expect(mocks.getSigningKeyMock).toHaveBeenCalledTimes(1);
  });
});
