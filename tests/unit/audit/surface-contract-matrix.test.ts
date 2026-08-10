import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';
import YAML from 'yaml';

import { COMMON_API_ROUTE_MANIFEST } from '../../../shared/routes/api-route-manifest.ts';
import { API_RUNTIME_SPECIFIC_MANIFEST } from '../../../shared/routes/api-runtime-specific-manifest.ts';
import { buildReleaseCheckSteps } from '../../../scripts/release-check.mjs';

import {
  AUTH_IDENTITY_PERSONA_MAPPING,
  EnvironmentSchema,
  ListenerDispositionsSchema,
  RuntimeExclusionsSchema,
  SourceInventorySchema,
  SurfaceMatrixDocumentSchema,
  canonicalRowId,
  contractFingerprint,
  discoverDormantCandidates,
  discoverHttpListenerCandidates,
  scanBullmqConstructors,
} from '../../../audit/surface-contract-matrix/matrix-schema.mjs';
import {
  closureReport,
  matchRequirementFamilies,
  validateClosedPhaseInvariants,
  validateOffRowFingerprints,
  validateRowIntegrity,
} from '../../../audit/surface-contract-matrix/scripts/validate-matrix.mjs';
import { renderMatrix } from '../../../audit/surface-contract-matrix/scripts/render-matrix.mjs';

const root = path.resolve(process.cwd());
const matrixDir = path.join(root, 'audit/surface-contract-matrix');
const readJson = (file: string) =>
  JSON.parse(fs.readFileSync(path.join(matrixDir, file), 'utf8')) as Record<string, unknown>;
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const stableValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableValue(entry)])
    );
  return value;
};
const stableJson = (value: unknown) => JSON.stringify(stableValue(value));
const VALID_SRI =
  'sha512-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==';
const DEPENDENCY_MANIFEST_KEYS = new Set([
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
  'peerDependenciesMeta',
  'bundleDependencies',
  'bundledDependencies',
]);
const nonDependencyPackageManifest = (manifest: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(manifest).filter(([key]) => !DEPENDENCY_MANIFEST_KEYS.has(key))
  );
const packageManifestChangesAreDependencyOnly = (
  prior: Record<string, unknown>,
  current: Record<string, unknown>
) =>
  stableJson(nonDependencyPackageManifest(prior)) ===
  stableJson(nonDependencyPackageManifest(current));
const writeJson = (directory: string, file: string, value: Record<string, unknown>) =>
  fs.writeFileSync(path.join(directory, file), `${JSON.stringify(value, null, 2)}\n`);
const withGitJsonFixture = (
  prior: Record<string, Record<string, unknown>>,
  current: Record<string, Record<string, unknown>>,
  run: (directory: string) => void,
  textFiles: { prior?: Record<string, string>; current?: Record<string, string> } = {}
) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'surface-contract-matrix-'));
  try {
    execFileSync('git', ['init', '--quiet', '--initial-branch=main'], { cwd: directory });
    execFileSync('git', ['config', 'user.email', 'surface-matrix@example.test'], { cwd: directory });
    execFileSync('git', ['config', 'user.name', 'Surface Matrix Test'], { cwd: directory });
    for (const [file, value] of Object.entries(prior)) writeJson(directory, file, value);
    for (const [file, value] of Object.entries(textFiles.prior ?? {}))
      fs.writeFileSync(path.join(directory, file), value);
    execFileSync('git', ['add', '.'], { cwd: directory });
    execFileSync('git', ['commit', '--quiet', '--message', 'baseline'], { cwd: directory });
    execFileSync('git', ['branch', 'surface-matrix-prior'], { cwd: directory });
    for (const [file, value] of Object.entries(current)) writeJson(directory, file, value);
    for (const [file, value] of Object.entries(textFiles.current ?? {}))
      fs.writeFileSync(path.join(directory, file), value);
    run(directory);
  } finally {
    fs.rmSync(directory, { force: true, recursive: true });
  }
};
const withPriorRef = (ref: string, run: () => void) => {
  const priorRef = process.env.SURFACE_MATRIX_PRIOR_REF;
  try {
    process.env.SURFACE_MATRIX_PRIOR_REF = ref;
    run();
  } finally {
    if (priorRef === undefined) delete process.env.SURFACE_MATRIX_PRIOR_REF;
    else process.env.SURFACE_MATRIX_PRIOR_REF = priorRef;
  }
};
const withEnvironment = (updates: Record<string, string | undefined>, run: () => void) => {
  const previous = new Map(Object.keys(updates).map((key) => [key, process.env[key]]));
  try {
    for (const [key, value] of Object.entries(updates)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
};
const commitCurrentAsPrior = (directory: string) => {
  const packageFiles = ['package.json', 'package-lock.json'].filter((file) =>
    fs.existsSync(path.join(directory, file))
  );
  execFileSync('git', ['add', ...packageFiles], { cwd: directory });
  execFileSync('git', ['commit', '--quiet', '--message', 'accepted dependency update'], {
    cwd: directory,
  });
  execFileSync('git', ['branch', '--force', 'surface-matrix-prior', 'HEAD'], { cwd: directory });
};
const lockFixture = (
  packages: Record<string, unknown>,
  metadata: Record<string, unknown> = {},
  rootPackage: Record<string, unknown> = { name: 'updog' }
) => ({ lockfileVersion: 3, ...metadata, packages: { '': rootPackage, ...packages } });
const registryPackage = (
  name: string,
  version: string,
  overrides: Record<string, unknown> = {}
) => {
  const tarballName = name.split('/').at(-1);
  return {
    version,
    resolved: `https://registry.npmjs.org/${name}/-/${tarballName}-${version}.tgz`,
    integrity: VALID_SRI,
    ...overrides,
  };
};
const staleLockNormalizationFixture = () => {
  const manifest = {
    name: 'updog',
    version: '1.5.0',
    license: 'MIT',
    engines: { node: '22.x' },
    dependencies: { widget: '1.1.0' },
  };
  return {
    manifest,
    prior: lockFixture(
      { 'node_modules/widget': registryPackage('widget', '1.0.0') },
      { name: 'updog', version: '1.4.1', requires: true },
      {
        name: 'updog',
        version: '1.4.1',
        license: 'MIT',
        engines: { node: '>=20.19.0 <23' },
        dependencies: { widget: '1.0.0' },
        hasInstallScript: false,
      }
    ),
    current: lockFixture(
      { 'node_modules/widget': registryPackage('widget', '1.1.0') },
      { name: 'updog', version: '1.5.0', requires: true },
      { ...manifest, hasInstallScript: false }
    ),
  };
};
const expectPackageLockValidation = (
  prior: Record<string, unknown>,
  current: Record<string, unknown>,
  expected: string[],
  ref = 'surface-matrix-prior',
  manifests = { prior: { name: 'updog' }, current: { name: 'updog' } }
) =>
  withPriorRef(ref, () =>
    withGitJsonFixture(
      { 'package-lock.json': prior, 'package.json': manifests.prior },
      { 'package-lock.json': current, 'package.json': manifests.current },
      (directory) =>
        expect(
          validatePackageLockSourceHash({ directory })
        ).toEqual(expected)
    )
  );
const expectPackageManifestValidation = (
  prior: Record<string, unknown>,
  current: Record<string, unknown>,
  expected: string[],
  ref = 'surface-matrix-prior'
) =>
  withPriorRef(ref, () =>
    withGitJsonFixture({ 'package.json': prior }, { 'package.json': current }, (directory) =>
      expect(
        validatePackageManifestSourceHash({ directory })
      ).toEqual(expected)
    )
  );
const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isStringRecord = (value: unknown) =>
  isRecord(value) && Object.values(value).every((entry) => typeof entry === 'string');
const isStringArray = (value: unknown) =>
  Array.isArray(value) && value.every((entry) => typeof entry === 'string');
const isPackageName = (value: string) => {
  const segment = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/;
  if (value.startsWith('@')) {
    const [scope, name, ...remaining] = value.slice(1).split('/');
    return (
      remaining.length === 0 &&
      typeof scope === 'string' &&
      typeof name === 'string' &&
      segment.test(scope) &&
      segment.test(name)
    );
  }
  return segment.test(value);
};
const isPeerDependenciesMeta = (value: unknown) =>
  isRecord(value) &&
  Object.entries(value).every(
    ([name, metadata]) =>
      isPackageName(name) &&
      isRecord(metadata) &&
      Object.keys(metadata).length === 1 &&
      typeof metadata.optional === 'boolean'
  );
const isFunding = (value: unknown): boolean =>
  typeof value === 'string' ||
  (isRecord(value) && Object.values(value).every((entry) => typeof entry === 'string')) ||
  (Array.isArray(value) && value.every(isFunding));
const isValidDescriptorShape = (descriptor: Record<string, unknown>) =>
  Object.entries(descriptor).every(([field, value]) => {
    if (['name', 'version', 'resolved', 'integrity', 'license', 'deprecated'].includes(field))
      return typeof value === 'string';
    if (['bin'].includes(field)) return typeof value === 'string' || isStringRecord(value);
    if (
      ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'].includes(
        field
      )
    )
      return isStringRecord(value);
    if (field === 'engines') return isStringRecord(value) || isStringArray(value);
    if (field === 'peerDependenciesMeta') return isPeerDependenciesMeta(value);
    if (['bundleDependencies', 'cpu', 'os', 'workspaces'].includes(field)) return isStringArray(value);
    if (field === 'funding') return isFunding(value);
    return ['dev', 'devOptional', 'hasInstallScript', 'inBundle', 'link', 'optional', 'peer'].includes(
      field
    ) && typeof value === 'boolean';
  });
const trustedPriorRef = () =>
  process.env.SURFACE_MATRIX_PRIOR_REF ?? (process.env.CI ? undefined : 'origin/main');
const readPriorFile = (file: string, directory = root): Buffer | null | undefined => {
  const ref = trustedPriorRef();
  if (!ref) return undefined;
  try {
    execFileSync('git', ['rev-parse', '--verify', `${ref}^{commit}`], {
      cwd: directory,
      stdio: 'pipe',
    });
  } catch {
    return undefined;
  }
  try {
    return execFileSync('git', ['show', `${ref}:${file}`], {
      cwd: directory,
      maxBuffer: 5 * 1024 * 1024,
      stdio: 'pipe',
    });
  } catch {
    return null;
  }
};
const readPriorJson = (file: string, directory = root) => {
  const priorFile = readPriorFile(file, directory);
  if (!priorFile) return undefined;
  try {
    const parsed = JSON.parse(priorFile.toString());
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
};
const npmrcMatchesPrior = (directory: string) => {
  const priorNpmrc = readPriorFile('.npmrc', directory);
  if (priorNpmrc === undefined) return false;
  const currentPath = path.join(directory, '.npmrc');
  if (!fs.existsSync(currentPath)) return priorNpmrc === null;
  if (priorNpmrc === null) return false;
  try {
    return priorNpmrc.equals(fs.readFileSync(currentPath));
  } catch {
    return false;
  }
};
const packageNameFromPath = (packagePath: string) => {
  const marker = 'node_modules/';
  const offset = packagePath.lastIndexOf(marker);
  const name = offset === -1 ? undefined : packagePath.slice(offset + marker.length);
  if (!name || name.includes('/node_modules/')) return undefined;
  if (name.startsWith('@')) {
    const [scope, packageName, ...remaining] = name.split('/');
    return scope && packageName && remaining.length === 0 ? `${scope}/${packageName}` : undefined;
  }
  return name.includes('/') ? undefined : name;
};
const logicalPackageName = (packagePath: string, descriptor: Record<string, unknown>) => {
  const pathName = packageNameFromPath(packagePath);
  if (!pathName) return undefined;
  if (!Object.hasOwn(descriptor, 'name')) return pathName;
  return typeof descriptor.name === 'string' && descriptor.name.length > 0
    ? descriptor.name
    : undefined;
};
const packageAliasKey = (packagePath: string, descriptor: Record<string, unknown>) => {
  const pathName = packageNameFromPath(packagePath);
  const logicalName = logicalPackageName(packagePath, descriptor);
  return pathName && logicalName && pathName !== logicalName ? `${pathName}\u0000${logicalName}` : undefined;
};
const isExactLinkDescriptor = (descriptor: Record<string, unknown>) =>
  stableJson(descriptor) === stableJson({ link: true });
const isValidSRI = (integrity: unknown) => {
  if (typeof integrity !== 'string') return false;
  const match = integrity.match(/^(sha512|sha1)-([A-Za-z0-9+/]+={0,2})$/);
  if (!match) return false;
  const digest = Buffer.from(match[2], 'base64');
  return digest.length === (match[1] === 'sha512' ? 64 : 20);
};
const isValidRegistryDescriptor = (descriptor: Record<string, unknown>, logicalName: string) => {
  if (typeof descriptor.version !== 'string' || descriptor.version.length === 0) return false;
  if (typeof descriptor.resolved !== 'string' || !isValidSRI(descriptor.integrity)) return false;
  try {
    const url = new URL(descriptor.resolved);
    const tarballName = logicalName.slice(logicalName.lastIndexOf('/') + 1);
    return (
      url.protocol === 'https:' &&
      url.hostname === 'registry.npmjs.org' &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      decodeURIComponent(url.pathname) ===
        `/${logicalName}/-/${tarballName}-${descriptor.version}.tgz`
    );
  } catch {
    return false;
  }
};
const isPermittedBundledDescriptor = (
  packagePath: string,
  descriptor: Record<string, unknown>,
  priorPackages: Record<string, unknown>,
  currentPackages: Record<string, unknown>
) => {
  if (
    descriptor.inBundle !== true ||
    Object.hasOwn(descriptor, 'resolved') ||
    Object.hasOwn(descriptor, 'integrity')
  )
    return false;
  const parentPath = packagePath.slice(0, packagePath.lastIndexOf('/node_modules/'));
  const parent = currentPackages[parentPath];
  const priorParent = priorPackages[parentPath];
  return (
    Boolean(parentPath) &&
    isRecord(parent) &&
    (!isRecord(priorParent) || priorParent.version !== parent.version)
  );
};
const fieldsMatch = (left: Record<string, unknown>, right: Record<string, unknown>, field: string) =>
  Object.hasOwn(left, field) === Object.hasOwn(right, field) &&
  (!Object.hasOwn(left, field) || stableJson(left[field]) === stableJson(right[field]));
const lockTopChangesAreAllowed = (
  prior: Record<string, unknown>,
  current: Record<string, unknown>,
  priorManifest: Record<string, unknown>,
  currentManifest: Record<string, unknown>
) =>
  [...new Set([...Object.keys(prior), ...Object.keys(current)])]
    .filter((field) => field !== 'packages')
    .every(
      (field) =>
        fieldsMatch(prior, current, field) ||
        (['name', 'version'].includes(field) &&
          typeof current[field] === 'string' &&
          fieldsMatch(priorManifest, currentManifest, field) &&
          fieldsMatch(current, currentManifest, field))
    );
const lockRootChangesAreAllowed = (
  priorRoot: Record<string, unknown>,
  currentRoot: Record<string, unknown>,
  priorManifest: Record<string, unknown>,
  currentManifest: Record<string, unknown>
) =>
  [...DEPENDENCY_MANIFEST_KEYS].every((field) => fieldsMatch(currentRoot, currentManifest, field)) &&
  [...new Set([...Object.keys(priorRoot), ...Object.keys(currentRoot)])].every(
    (field) =>
      fieldsMatch(priorRoot, currentRoot, field) ||
      (DEPENDENCY_MANIFEST_KEYS.has(field) ||
        (Object.hasOwn(currentManifest, field) &&
          fieldsMatch(currentRoot, currentManifest, field) &&
          fieldsMatch(priorManifest, currentManifest, field)))
  );
const packageLockChangesAreAllowed = (
  prior: Record<string, unknown>,
  current: Record<string, unknown>,
  priorManifest: Record<string, unknown>,
  currentManifest: Record<string, unknown>
) => {
  if (
    prior.lockfileVersion !== 3 ||
    current.lockfileVersion !== 3 ||
    !packageManifestChangesAreDependencyOnly(priorManifest, currentManifest) ||
    !isRecord(prior.packages) ||
    !isRecord(current.packages) ||
    !isRecord(prior.packages['']) ||
    !isRecord(current.packages['']) ||
    !isValidDescriptorShape(prior.packages['']) ||
    !isValidDescriptorShape(current.packages[''])
  )
    return false;
  if (
    !lockTopChangesAreAllowed(prior, current, priorManifest, currentManifest) ||
    !lockRootChangesAreAllowed(
      prior.packages[''],
      current.packages[''],
      priorManifest,
      currentManifest
    )
  )
    return false;

  const priorAliases = new Set<string>();
  const priorByIdentity = new Map<string, Record<string, unknown>[]>();
  for (const [packagePath, descriptor] of Object.entries(prior.packages)) {
    if (packagePath === '') continue;
    if (!isRecord(descriptor) || !isValidDescriptorShape(descriptor)) return false;
    const logicalName = logicalPackageName(packagePath, descriptor);
    const alias = packageAliasKey(packagePath, descriptor);
    if (!logicalName) return false;
    if (alias) priorAliases.add(alias);
    if (typeof descriptor.version === 'string' && descriptor.version.length > 0) {
      const identity = `${logicalName}\u0000${descriptor.version}`;
      priorByIdentity.set(identity, [...(priorByIdentity.get(identity) ?? []), descriptor]);
    }
  }

  for (const [packagePath, descriptor] of Object.entries(current.packages)) {
    if (packagePath === '') continue;
    if (!isRecord(descriptor) || !isValidDescriptorShape(descriptor)) return false;
    const priorDescriptor = prior.packages[packagePath];
    if (descriptor.link === true || (isRecord(priorDescriptor) && priorDescriptor.link === true)) {
      if (!isRecord(priorDescriptor) || !isExactLinkDescriptor(descriptor)) return false;
      if (stableJson(priorDescriptor) !== stableJson(descriptor)) return false;
      continue;
    }
    if (Object.hasOwn(descriptor, 'link')) return false;
    const logicalName = logicalPackageName(packagePath, descriptor);
    const alias = packageAliasKey(packagePath, descriptor);
    if (!logicalName || typeof descriptor.version !== 'string' || descriptor.version.length === 0)
      return false;
    if (alias && !priorAliases.has(alias)) return false;
    if (priorDescriptor !== undefined) {
      if (!isRecord(priorDescriptor) || typeof priorDescriptor.version !== 'string') return false;
      if (priorDescriptor.version === descriptor.version) {
        if (stableJson(priorDescriptor) !== stableJson(descriptor)) return false;
        continue;
      }
    }
    if (
      descriptor.inBundle === true
        ? !isPermittedBundledDescriptor(packagePath, descriptor, prior.packages, current.packages)
        : !isValidRegistryDescriptor(descriptor, logicalName)
    )
      return false;
    for (const priorMatch of priorByIdentity.get(`${logicalName}\u0000${descriptor.version}`) ?? [])
      if (stableJson(priorMatch) !== stableJson(descriptor)) return false;
  }
  return true;
};
const validatePackageManifestSourceHash = ({ directory }: { directory: string }) => {
  const packagePath = path.join(directory, 'package.json');
  const priorPackageBytes = readPriorFile('package.json', directory);
  if (!priorPackageBytes) return ['source hash mismatch: package.json'];
  const packageBytes = fs.readFileSync(packagePath);
  if (packageBytes.equals(priorPackageBytes)) return [];
  const priorPackageData = readPriorJson('package.json', directory);
  let packageData: unknown;
  try {
    packageData = JSON.parse(packageBytes.toString());
  } catch {
    return ['source hash mismatch: package.json'];
  }
  return isRecord(packageData) &&
    priorPackageData &&
    packageManifestChangesAreDependencyOnly(priorPackageData, packageData)
    ? []
    : ['source hash mismatch: package.json'];
};
const validatePackageLockSourceHash = ({ directory }: { directory: string }) => {
  const lockPath = path.join(directory, 'package-lock.json');
  const priorLockBytes = readPriorFile('package-lock.json', directory);
  const priorPackageBytes = readPriorFile('package.json', directory);
  if (!priorLockBytes || !priorPackageBytes) return ['source hash mismatch: package-lock.json'];
  const lockBytes = fs.readFileSync(lockPath);
  if (lockBytes.equals(priorLockBytes)) return [];
  let lockData: unknown;
  let packageData: unknown;
  try {
    lockData = JSON.parse(lockBytes.toString());
    packageData = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'));
  } catch {
    return ['source hash mismatch: package-lock.json'];
  }
  const priorLockData = readPriorJson('package-lock.json', directory);
  const priorPackageData = readPriorJson('package.json', directory);
  return (
    priorLockData &&
    priorPackageData &&
    isRecord(lockData) &&
    isRecord(packageData) &&
    npmrcMatchesPrior(directory) &&
    packageLockChangesAreAllowed(priorLockData, lockData, priorPackageData, packageData)
  )
    ? []
    : ['source hash mismatch: package-lock.json'];
};
const trackedFiles = () =>
  execFileSync('git', ['ls-files', '-z'], { cwd: root })
    .toString()
    .split('\0')
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));
const excludedSource = (file: string) =>
  /(?:^|\/)(?:__tests__|tests?|specs?|fixtures?)(?:\/|$)/i.test(file) ||
  /\.(?:test|spec|stories)\.[^.]+$/i.test(file);
const fileMatches = (file: string, pattern: string) =>
  pattern === 'server/routes/**/*.ts'
    ? file.startsWith('server/routes/') && file.endsWith('.ts')
    : pattern === 'api/**/*.ts'
      ? file.startsWith('api/') && file.endsWith('.ts')
      : pattern === 'workers/**'
        ? file.startsWith('workers/')
        : pattern === 'server/workers/**'
          ? file.startsWith('server/workers/')
        : pattern === 'ml-service/**' && file.startsWith('ml-service/');
type WorkflowStep = {
  name?: string;
  run?: string;
  uses?: string;
  with?: Record<string, unknown>;
};
type WorkflowJob = { steps?: WorkflowStep[] };
const readCiWorkflow = () =>
  YAML.parse(fs.readFileSync(path.join(root, '.github/workflows/ci-unified.yml'), 'utf8')) as {
    jobs?: Record<string, WorkflowJob>;
  };

describe('surface contract matrix CI gate', () => {
  it('allows package manifest drift limited to dependency declarations', () => {
    const prior = {
      name: 'updog',
      scripts: { test: 'vitest run' },
      engines: { node: '>=20.19.0' },
      dependencies: { express: '4.0.0' },
      devDependencies: { vitest: '4.1.9' },
    };
    const current = {
      ...prior,
      dependencies: { express: '5.0.0' },
      devDependencies: { vitest: '4.1.10' },
    };

    expect(packageManifestChangesAreDependencyOnly(prior, current)).toBe(true);
  });

  it('rejects package manifest drift outside dependency declarations', () => {
    const prior = {
      name: 'updog',
      scripts: { test: 'vitest run' },
      engines: { node: '>=20.19.0' },
      overrides: { semver: '7.7.2' },
      devDependencies: { vitest: '4.1.9' },
    };

    expect(
      packageManifestChangesAreDependencyOnly(prior, {
        ...prior,
        engines: { node: '>=22.0.0' },
      })
    ).toBe(false);
    expect(
      packageManifestChangesAreDependencyOnly(prior, {
        ...prior,
        overrides: { semver: '7.7.3' },
      })
    ).toBe(false);
    expect(
      packageManifestChangesAreDependencyOnly(prior, {
        ...prior,
        scripts: { test: 'vitest run --changed' },
      })
    ).toBe(false);
    expect(
      packageManifestChangesAreDependencyOnly(prior, {
        ...prior,
        packageManager: 'npm@10.9.2',
      })
    ).toBe(false);
  });

  it('allows dependency-only package drift against SURFACE_MATRIX_PRIOR_REF', () => {
    const prior = {
      name: 'updog',
      scripts: { test: 'vitest run' },
      engines: { node: '>=20.19.0' },
      dependencies: { express: '4.0.0' },
    };
    const current = { ...prior, dependencies: { express: '5.0.0' } };

    expectPackageManifestValidation(prior, current, []);
  });

  it('fails closed when package manifest drift has no readable baseline ref', () => {
    const prior = {
      name: 'updog',
      scripts: { test: 'vitest run' },
      engines: { node: '>=20.19.0' },
      dependencies: { express: '4.0.0' },
    };
    const current = { ...prior, scripts: { test: 'vitest run --changed' } };

    expectPackageManifestValidation(
      prior,
      current,
      ['source hash mismatch: package.json'],
      'unreadable-surface-matrix-ref'
    );
  });

  it('keeps CI semantic package-lock waiver separate from authoring validation and release proof', () => {
    const prior = lockFixture({
      'node_modules/widget': registryPackage('widget', '1.0.0'),
      'node_modules/removed': registryPackage('removed', '1.0.0'),
    });
    const current = lockFixture({
      'node_modules/widget': registryPackage('widget', '1.1.0'),
      'node_modules/added': registryPackage('added', '1.0.0', {
        engines: ['node >= 6'],
        peerDependenciesMeta: { '@scope/peer': { optional: true } },
      }),
    });
    const inventory = SourceInventorySchema.parse(readJson('source-inventory.json'));

    expect(inventory.source_membership?.['runtime-composition-and-deployment']).toContain(
      'package-lock.json'
    );
    expect(sha256(`${JSON.stringify(current, null, 2)}\n`)).not.toBe(
      sha256(`${JSON.stringify(prior, null, 2)}\n`)
    );
    expectPackageLockValidation(prior, current, []);
    const releaseCommands = buildReleaseCheckSteps({ skipDbProof: false, reuseCiGates: false })
      .flatMap((step) => (step.command ? [step.command] : []))
      .join('\n');
    expect(releaseCommands).not.toContain('validate-matrix');
    expect(fs.readFileSync(path.join(root, '.github/workflows/release-proof.yml'), 'utf8')).toContain(
      'run: npm run release:check'
    );
    expect(fs.readFileSync(path.join(matrixDir, 'README.md'), 'utf8')).toContain(
      'does not invoke `validate-matrix.mjs`'
    );
  });

  it('does not trust regenerated package manifest hashes outside dependency declarations', () => {
    const prior = {
      name: 'updog',
      scripts: { test: 'vitest run' },
      dependencies: { express: '4.0.0' },
    };
    const current = { ...prior, scripts: { test: 'vitest run --changed' } };

    expectPackageManifestValidation(prior, current, ['source hash mismatch: package.json']);
  });

  it('accepts unchanged package manifest bytes after an earlier semantic waiver', () => {
    const prior = { name: 'updog', dependencies: { widget: '1.0.0' } };
    const accepted = { name: 'updog', dependencies: { widget: '1.1.0' } };
    withPriorRef('surface-matrix-prior', () =>
      withGitJsonFixture({ 'package.json': prior }, { 'package.json': accepted }, (directory) => {
        expect(validatePackageManifestSourceHash({ directory })).toEqual([]);
        commitCurrentAsPrior(directory);
        expect(validatePackageManifestSourceHash({ directory })).toEqual([]);
      })
    );
  });

  it('does not trust regenerated package-lock hashes for semantic tampering', () => {
    const prior = lockFixture({
      'node_modules/widget': registryPackage('widget', '1.0.0', { hasInstallScript: false }),
    });
    const current = lockFixture({
      'node_modules/widget': registryPackage('widget', '1.0.0', { hasInstallScript: true }),
    });

    expectPackageLockValidation(prior, current, ['source hash mismatch: package-lock.json']);
  });

  it('accepts unchanged package-lock bytes after an earlier semantic waiver', () => {
    const priorManifest = { name: 'updog', dependencies: { widget: '1.0.0' } };
    const acceptedManifest = { name: 'updog', dependencies: { widget: '1.1.0' } };
    const prior = lockFixture(
      { 'node_modules/widget': registryPackage('widget', '1.0.0') },
      {},
      priorManifest
    );
    const accepted = lockFixture(
      { 'node_modules/widget': registryPackage('widget', '1.1.0') },
      {},
      acceptedManifest
    );
    withPriorRef('surface-matrix-prior', () =>
      withGitJsonFixture(
        { 'package.json': priorManifest, 'package-lock.json': prior },
        { 'package.json': acceptedManifest, 'package-lock.json': accepted },
        (directory) => {
          expect(validatePackageLockSourceHash({ directory })).toEqual([]);
          commitCurrentAsPrior(directory);
          expect(validatePackageLockSourceHash({ directory })).toEqual([]);
        }
      )
    );
  });

  it('rejects same-version package-lock resolution and integrity tampering', () => {
    const prior = lockFixture({ 'node_modules/widget': registryPackage('widget', '1.0.0') });
    const tamperedEntries = [
      registryPackage('widget', '1.0.0', {
        resolved: 'https://mirror.example.test/widget/-/widget-1.0.0.tgz',
      }),
      registryPackage('widget', '1.0.0', { integrity: 'sha512-tampered' }),
    ];

    for (const entry of tamperedEntries)
      expectPackageLockValidation(
        prior,
        lockFixture({ 'node_modules/widget': entry }),
        ['source hash mismatch: package-lock.json']
      );
  });

  it('fails closed when package-lock drift has no readable baseline ref', () => {
    expectPackageLockValidation(
      lockFixture({ 'node_modules/widget': registryPackage('widget', '1.0.0') }),
      lockFixture({ 'node_modules/widget': registryPackage('widget', '1.1.0') }),
      ['source hash mismatch: package-lock.json'],
      'unreadable-surface-matrix-ref'
    );
  });

  it('does not trust regenerated package-lock hashes when .npmrc redirects the registry', () => {
    const prior = lockFixture({ 'node_modules/widget': registryPackage('widget', '1.0.0') });
    const current = lockFixture({ 'node_modules/widget': registryPackage('widget', '1.1.0') });

    withPriorRef('surface-matrix-prior', () =>
      withGitJsonFixture(
        { 'package-lock.json': prior, 'package.json': { name: 'updog' } },
        { 'package-lock.json': current, 'package.json': { name: 'updog' } },
        (directory) =>
          expect(
            validatePackageLockSourceHash({ directory })
          ).toEqual(['source hash mismatch: package-lock.json']),
        {
          prior: { '.npmrc': 'registry=https://registry.npmjs.org/\n' },
          current: { '.npmrc': 'registry=https://evil.example/\n' },
        }
      )
    );
  });

  it('fails closed when an explicit package-lock ref is unreadable despite origin/main', () => {
    const prior = lockFixture({ 'node_modules/widget': registryPackage('widget', '1.0.0') });
    const current = lockFixture({ 'node_modules/widget': registryPackage('widget', '1.1.0') });

    withGitJsonFixture(
      { 'package-lock.json': prior, 'package.json': { name: 'updog' } },
      { 'package-lock.json': current, 'package.json': { name: 'updog' } },
      (directory) => {
        execFileSync('git', ['update-ref', 'refs/remotes/origin/main', 'main'], { cwd: directory });
        withPriorRef('unreadable-surface-matrix-ref', () =>
          expect(
            validatePackageLockSourceHash({ directory })
          ).toEqual(['source hash mismatch: package-lock.json'])
        );
      }
    );
  });

  it('requires an explicit prior ref for package-lock waivers in CI', () => {
    const prior = lockFixture({ 'node_modules/widget': registryPackage('widget', '1.0.0') });
    const current = lockFixture({ 'node_modules/widget': registryPackage('widget', '1.1.0') });

    withGitJsonFixture(
      { 'package-lock.json': prior, 'package.json': { name: 'updog' } },
      { 'package-lock.json': current, 'package.json': { name: 'updog' } },
      (directory) => {
        execFileSync('git', ['update-ref', 'refs/remotes/origin/main', 'main'], { cwd: directory });
        withEnvironment({ CI: 'true', SURFACE_MATRIX_PRIOR_REF: undefined }, () =>
          expect(
            validatePackageLockSourceHash({ directory })
          ).toEqual(['source hash mismatch: package-lock.json'])
        );
      }
    );
  });

  it('supplies an immutable prior ref to every full-unit CI runner', () => {
    const jobs = readCiWorkflow().jobs ?? {};
    const runners = Object.entries(jobs).filter(([, job]) =>
      job.steps?.some(
        (step) => step.run?.includes('npm run test:unit') || step.run?.includes('npm run test:memory')
      )
    );

    expect(runners.map(([name]) => name)).toEqual(['check', 'memory-mode']);
    for (const [, job] of runners) {
      const checkout = job.steps?.find((step) => step.uses?.startsWith('actions/checkout@'));
      const priorRef = job.steps?.find((step) => step.name === 'Export surface-matrix prior ref');

      expect(checkout?.with?.['fetch-depth']).toBe(0);
      expect(priorRef?.run).toContain('github.event.pull_request.base.sha');
      expect(priorRef?.run).toContain('github.event.before');
      expect(priorRef?.run).toContain('== "workflow_dispatch"');
      expect(priorRef?.run).toContain('git rev-parse "${GITHUB_SHA}^"');
    }
  });

  it('reads a large package-lock baseline from SURFACE_MATRIX_PRIOR_REF', () => {
    const prior = { payload: 'x'.repeat(1_100_000) };

    withPriorRef('surface-matrix-prior', () =>
      withGitJsonFixture(
        { 'package-lock.json': prior },
        { 'package-lock.json': prior },
        (directory) => expect(readPriorJson('package-lock.json', directory)).toEqual(prior)
      )
    );
  });

  it('rejects package-lock lockfileVersion and top-level metadata drift', () => {
    const prior = lockFixture({ 'node_modules/widget': registryPackage('widget', '1.0.0') }, { requires: true });
    const variants = [{ ...prior, lockfileVersion: 2 }, { ...prior, requires: false }];

    for (const current of variants)
      expectPackageLockValidation(prior, current, ['source hash mismatch: package-lock.json']);
  });

  it('allows stale package-lock metadata normalization only from an unchanged manifest', () => {
    const { manifest, prior, current } = staleLockNormalizationFixture();

    expectPackageLockValidation(prior, current, [], 'surface-matrix-prior', {
      prior: manifest,
      current: manifest,
    });
  });

  it('rejects arbitrary package-lock top and root metadata drift', () => {
    const { manifest, prior, current: normalized } = staleLockNormalizationFixture();
    const variants = [
      { ...normalized, version: '1.5.1' },
      {
        ...normalized,
        packages: { ...normalized.packages, '': { ...manifest, license: 'tampered' } },
      },
      {
        ...normalized,
        packages: { ...normalized.packages, '': { ...manifest, hasInstallScript: true } },
      },
      {
        ...normalized,
        packages: { ...normalized.packages, '': manifest },
      },
      {
        ...normalized,
        packages: {
          ...normalized.packages,
          '': { ...manifest, dependencies: { widget: '9.9.9' }, hasInstallScript: false },
        },
      },
    ];

    for (const current of variants)
      expectPackageLockValidation(prior, current, ['source hash mismatch: package-lock.json'], 'surface-matrix-prior', {
        prior: manifest,
        current: manifest,
      });
  });

  it('rejects same-version package-lock install metadata drift', () => {
    const prior = lockFixture({
      'node_modules/widget': registryPackage('widget', '1.0.0', {
        hasInstallScript: false,
        dependencies: { transitive: '^1.0.0' },
      }),
    });
    const current = lockFixture({
      'node_modules/widget': registryPackage('widget', '1.0.0', {
        hasInstallScript: true,
        dependencies: { transitive: '^2.0.0' },
      }),
    });

    expectPackageLockValidation(prior, current, ['source hash mismatch: package-lock.json']);
  });

  it('rejects package-lock path moves with changed provenance or install semantics', () => {
    const prior = lockFixture({ 'node_modules/widget': registryPackage('widget', '1.0.0') });
    const variants = [
      registryPackage('widget', '1.0.0', { integrity: 'sha512-tampered' }),
      registryPackage('widget', '1.0.0', { hasInstallScript: true }),
      registryPackage('widget', '1.0.0', { dependencies: { transitive: '^2.0.0' } }),
      registryPackage('widget', '1.0.0', { bin: 'tampered.js' }),
    ];

    for (const descriptor of variants)
      expectPackageLockValidation(
        prior,
        lockFixture({ 'node_modules/parent/node_modules/widget': descriptor }),
        ['source hash mismatch: package-lock.json']
      );
  });

  it('rejects malformed package-lock descriptors and new package provenance', () => {
    const prior = lockFixture({});
    const variants = [
      lockFixture({ 'node_modules/malformed': 'not-a-descriptor' }),
      lockFixture({
        'node_modules/missing-version': {
          resolved: 'https://registry.npmjs.org/missing-version/-/missing-version-1.0.0.tgz',
          integrity: VALID_SRI,
        },
      }),
      lockFixture({
        'node_modules/widget': registryPackage('widget', '1.0.0', {
          resolved: 'https://mirror.example.test/widget/-/widget-1.0.0.tgz',
        }),
      }),
      lockFixture({
        'node_modules/widget': registryPackage('widget', '1.0.0', { integrity: 'sha512-malformed' }),
      }),
      lockFixture({
        'node_modules/widget': registryPackage('widget', '1.0.0', {
          peerDependenciesMeta: { peer: { optional: 'true' } },
        }),
      }),
      lockFixture({
        'node_modules/widget': registryPackage('widget', '1.0.0', {
          peerDependenciesMeta: { peer: { optional: true, injected: true } },
        }),
      }),
      lockFixture({
        'node_modules/widget': registryPackage('widget', '1.0.0', {
          peerDependenciesMeta: { 'not valid': { optional: true } },
        }),
      }),
      lockFixture({
        'node_modules/widget': registryPackage('widget', '1.0.0', {
          peerDependenciesMeta: { '@scope': { optional: true } },
        }),
      }),
      lockFixture({
        'node_modules/widget': registryPackage('widget', '1.0.0', { unexpected: true }),
      }),
    ];

    for (const current of variants)
      expectPackageLockValidation(prior, current, ['source hash mismatch: package-lock.json']);
  });

  it('rejects novel package-lock aliases and link descriptors', () => {
    const prior = lockFixture({ 'node_modules/widget': registryPackage('widget', '1.0.0') });
    const variants = [
      lockFixture({
        'node_modules/widget': registryPackage('widget', '1.0.0'),
        'node_modules/alias': registryPackage('widget', '1.0.0', { name: 'widget' }),
      }),
      lockFixture({
        'node_modules/widget': registryPackage('widget', '1.0.0'),
        'node_modules/novel-link': { link: true },
      }),
    ];

    for (const current of variants)
      expectPackageLockValidation(prior, current, ['source hash mismatch: package-lock.json']);
  });

  it('keeps the seeded development-only classification valid', () => {
    const seedScript = fs.readFileSync(path.join(matrixDir, 'scripts/seed-matrix.mjs'), 'utf8');

    expect(seedScript).toContain("environment: 'development-only'");
    expect(EnvironmentSchema.parse('development-only')).toBe('development-only');
  });

  it('validates tracked artifacts, discovery sets, hashes, requirements, and render determinism', async () => {
    const matrix = SurfaceMatrixDocumentSchema.parse(readJson('matrix.json'));
    const inventory = SourceInventorySchema.parse(readJson('source-inventory.json'));
    const requirements = readJson('requirements.json') as {
      families: Array<Record<string, unknown>>;
    };
    const listeners = ListenerDispositionsSchema.parse(readJson('listener-dispositions.json'));
    const candidates = readJson('dormant-candidates.json') as Array<Record<string, unknown>>;
    const exclusions = RuntimeExclusionsSchema.parse(readJson('runtime-exclusions.json'));
    const orphans = readJson('orphans.json') as Array<Record<string, unknown>>;
    const errors: string[] = [];
    const policyRegistry = (
      await import(path.join(root, 'server/route-policy/api-route-policy-registry.ts'))
    ).API_ROUTE_POLICY_REGISTRY as Array<{ id: string; method?: string; path: string }>;
    const governanceRegistry = (
      await import(path.join(root, 'shared/routes/route-governance-registry.ts'))
    ).ROUTE_GOVERNANCE_REGISTRY as Array<{ path: string }>;
    const rowIds = matrix.rows.map((row) => canonicalRowId(row.id));
    expect(new Set(rowIds).size, 'canonical row ids must be unique').toBe(rowIds.length);
    expect(
      (matrix as Record<string, unknown>).orphans,
      'orphans.json is sole authoritative source'
    ).toBeUndefined();
    expect([...rowIds].sort((left, right) => left.localeCompare(right))).toEqual(
      [...inventory.row_ids].sort((left, right) => left.localeCompare(right))
    );

    const reverse: Record<string, string[]> = {};
    for (const [source, ids] of Object.entries(inventory.source_to_rows))
      for (const id of ids) reverse[id] = [...(reverse[id] ?? []), source];
    for (const [id, sources] of Object.entries(inventory.row_to_sources))
      expect([...new Set(sources)].sort()).toEqual([...new Set(reverse[id] ?? [])].sort());
    for (const entry of policyRegistry) {
      const id = entry.id.startsWith('client:')
        ? canonicalRowId(entry.id)
        : canonicalRowId(`api:${entry.method}:${entry.path}`);
      expect(inventory.source_to_rows[`policy:${entry.id}`]).toEqual([id]);
      expect(rowIds).toContain(id);
    }
    for (const entry of governanceRegistry) {
      const id = canonicalRowId(`client:${entry.path}`);
      expect(inventory.source_to_rows[`governance:${entry.path}`]).toEqual([id]);
      expect(rowIds).toContain(id);
    }
    for (const entry of COMMON_API_ROUTE_MANIFEST) {
      const mapped = inventory.source_to_rows[`manifest:${entry.id}`] ?? [];
      expect(mapped.length, `common manifest mapping: ${entry.id}`).toBeGreaterThan(0);
      for (const id of mapped) expect(rowIds).toContain(id);
    }
    for (const entry of API_RUNTIME_SPECIFIC_MANIFEST) {
      const mapped = inventory.source_to_rows[`runtime-manifest:${entry.id}`] ?? [];
      expect(mapped.length, `runtime manifest mapping: ${entry.id}`).toBeGreaterThan(0);
      for (const id of mapped) expect(rowIds).toContain(id);
    }
    for (const entry of (await import(path.join(root, 'server/queues/registry.ts')))
      .QUEUE_CATALOG as Array<{ key: string; queueName: string }>) {
      const mapped = inventory.source_to_rows[`QUEUE_CATALOG:${entry.key}`] ?? [];
      expect(mapped).toEqual([canonicalRowId(`worker:${entry.queueName}`)]);
    }

    const packageData = JSON.parse(
      fs.readFileSync(path.join(root, 'package.json'), 'utf8')
    ) as Record<string, unknown> & { scripts?: Record<string, string> };
    const registryExports: Record<string, [string, string]> = {
      'shared/routes/api-route-manifest.ts#normalized-runtime-export': [
        'shared/routes/api-route-manifest.ts',
        'COMMON_API_ROUTE_MANIFEST',
      ],
      'shared/routes/api-runtime-specific-manifest.ts#normalized-runtime-export': [
        'shared/routes/api-runtime-specific-manifest.ts',
        'API_RUNTIME_SPECIFIC_MANIFEST',
      ],
      'server/route-policy/api-route-policy-registry.ts#normalized-runtime-export': [
        'server/route-policy/api-route-policy-registry.ts',
        'API_ROUTE_POLICY_REGISTRY',
      ],
      'shared/routes/route-governance-registry.ts#normalized-runtime-export': [
        'shared/routes/route-governance-registry.ts',
        'ROUTE_GOVERNANCE_REGISTRY',
      ],
    };
    for (const [key, expected] of Object.entries(inventory.source_hashes)) {
      let actual: string;
      if (key.startsWith('snapshot:')) actual = key;
      else if (key === 'package.json') {
        errors.push(...validatePackageManifestSourceHash({ directory: root }));
        continue;
      } else if (key === 'package-lock.json') {
        errors.push(...validatePackageLockSourceHash({ directory: root }));
        continue;
      } else if (key === 'package.json#scripts')
        actual = sha256(
          stableJson(
            Object.fromEntries(
              Object.entries(packageData.scripts ?? {}).sort(([left], [right]) =>
                left.localeCompare(right)
              )
            )
          )
        );
      else if (registryExports[key]) {
        const [file, exportName] = registryExports[key];
        const imported = await import(path.join(root, file));
        actual = sha256(stableJson(imported[exportName]));
      } else {
        const source = key.split('#', 1)[0];
        actual = sha256(fs.readFileSync(path.join(root, source)));
      }
      if (actual !== expected) errors.push(`source hash mismatch: ${key}`);
    }
    const tracked = trackedFiles();
    for (const [category, files] of Object.entries(inventory.source_membership ?? {})) {
      for (const file of files) {
        if (file.startsWith('snapshot:')) continue;
        const source = file.split('#', 1)[0];
        expect(
          fs.existsSync(path.join(root, source)),
          `${category} membership file exists: ${source}`
        ).toBe(true);
        expect(
          inventory.source_hashes[file],
          `${category} membership is hashed: ${file}`
        ).toBeTruthy();
      }
      if (category.startsWith('universe:'))
        expect(files).toEqual(
          tracked.filter(
            (file) => fileMatches(file, category.slice('universe:'.length)) && !excludedSource(file)
          )
        );
    }
    expect(inventory.source_membership?.['client-pages-v2']).toEqual(
      tracked.filter((file) => file.startsWith('client/src/pages/v2/'))
    );

    const discoveredDormant = discoverDormantCandidates({ rootDir: root }).map(
      (candidate) => candidate.path
    );
    expect(discoveredDormant).toEqual(
      candidates.map((candidate) => candidate.path).sort((left, right) => left.localeCompare(right))
    );
    const discoveredListeners = discoverHttpListenerCandidates({ rootDir: root })
      .map((candidate) => candidate.path)
      .sort((left, right) => left.localeCompare(right));
    expect(discoveredListeners).toEqual(
      listeners
        .map((listener) => listener.candidate_path)
        .sort((left, right) => left.localeCompare(right))
    );
    const queueNames = [
      ...new Set(scanBullmqConstructors({ rootDir: root }).map((finding) => finding.queue_name)),
    ].sort((left, right) => left.localeCompare(right));
    expect(queueNames).toContain('capital-call-status');
    expect(queueNames).toContain('lp-view-refresh');
    for (const queueName of queueNames)
      expect(rowIds).toContain(canonicalRowId(`worker:${queueName}`));
    expect(matrix.rows.find((row) => row.id === 'worker:capital-call-status')?.reachability).toBe(
      'railway'
    );

    for (const row of matrix.rows)
      if (row.decision_status === 'approved')
        expect(row.contract_fingerprint).toBe(contractFingerprint(row));
    for (const [key, review] of Object.entries(matrix.coverage_review ?? {})) {
      const row = matrix.rows.find((entry) => entry.id === key.split('|', 1)[0]);
      expect(row, `coverage review row exists: ${key}`).toBeDefined();
      expect(review.contract_fingerprint).toBe(contractFingerprint(row!));
    }
    for (const row of matrix.rows) {
      const items = [...(row.test_evidence.derived ?? []), ...(row.test_evidence.manual ?? [])];
      for (const evidence of items) {
        if (!evidence.assertion_confirmed || !evidence.test_file_sha256) continue;
        const evidencePath = String(evidence.assertion_evidence ?? '').split(':', 1)[0];
        expect(evidencePath, `confirmed evidence needs a file path on row ${row.id}`).toBeTruthy();
        expect(
          sha256(fs.readFileSync(path.join(root, evidencePath))),
          `confirmed test evidence hash stale on row ${row.id}: ${evidencePath}`
        ).toBe(evidence.test_file_sha256);
      }
    }
    const derivedEvidenceCount = matrix.rows.reduce(
      (total, row) => total + row.test_evidence.derived.length,
      0
    );
    expect(
      derivedEvidenceCount,
      'seed must ingest KG TESTS edges into derived evidence'
    ).toBeGreaterThan(0);
    const backtesting = matrix.rows.find((row) => row.id === 'worker:backtesting-jobs');
    expect(
      backtesting?.exposures.map((exposure) => `${exposure.deployment}|${exposure.runtime}`)
    ).toEqual(['railway-api|create_server']);

    const families = matchRequirementFamilies(requirements, matrix.rows);
    for (const family of families) {
      if (family.matched_ids.length === 0)
        expect(
          family.optional_when_absent && family.absence_evidence,
          `${family.id} requires approved absence evidence once closed`
        ).toBeTruthy();
    }
    const closure = closureReport({
      document: matrix,
      requirements,
      listeners,
      candidates,
      orphans,
      discoveredRoles: Object.keys(AUTH_IDENTITY_PERSONA_MAPPING),
    });
    expect(
      validateOffRowFingerprints({
        listeners,
        candidates,
        exclusions,
        orphans,
        requirements,
        discoveredListeners: discoverHttpListenerCandidates({ rootDir: root }),
      })
    ).toEqual([]);
    if (matrix.phase === 'authoring')
      process.stderr.write(
        `surface matrix authoring closure report: ${JSON.stringify(Object.fromEntries(Object.entries(closure.issues).map(([key, values]) => [key, values.length])))}\n`
      );
    else expect(closure.passed, JSON.stringify(closure.issues)).toBe(true);
    if (matrix.phase === 'closed') {
      expect(validateClosedPhaseInvariants({ document: matrix, requirements, families })).toEqual(
        []
      );
      expect(
        matrix.rows.every(
          (row) => row.decision_status === 'approved' && row.classification === 'classified'
        )
      ).toBe(true);
      expect(listeners.every((listener) => listener.decision_status === 'approved')).toBe(true);
      expect(
        candidates.every(
          (candidate) =>
            ['not-surface', 'promote'].includes(candidate.disposition) &&
            candidate.decision_status === 'approved'
        )
      ).toBe(true);
      expect(
        orphans.every(
          (orphan) =>
            ['pruned', 'retained'].includes(orphan.resolution) &&
            orphan.decision_status === 'approved'
        )
      ).toBe(true);
      expect(
        families.every((family) =>
          family.matched_ids.length > 0
            ? family.matched_ids.every(
                (id) => matrix.rows.find((row) => row.id === id)?.decision_status === 'approved'
              )
            : family.absence_evidence?.status === 'approved'
        )
      ).toBe(true);
    }

    const priorRef = process.env.SURFACE_MATRIX_PRIOR_REF;
    if (priorRef) {
      let prior: { phase: string } | undefined;
      try {
        prior = JSON.parse(
          execFileSync('git', ['show', `${priorRef}:audit/surface-contract-matrix/matrix.json`], {
            cwd: root,
          }).toString()
        ) as { phase: string };
      } catch (error) {
        if (matrix.phase === 'closed' && !closure.passed) throw error;
      }
      if (prior?.phase === 'closed') expect(matrix.phase).toBe('closed');
    }

    const rendered = renderMatrix({
      matrix,
      requirements,
      listeners,
      candidates,
      exclusions,
      orphans,
    });
    expect(errors, errors.join('\n')).toEqual([]);

    const renderedAgain = renderMatrix({
      matrix,
      requirements,
      listeners,
      candidates,
      exclusions,
      orphans,
    });
    expect(renderedAgain).toBe(rendered);
    expect(fs.readFileSync(path.join(matrixDir, 'MATRIX.md'), 'utf8')).toBe(rendered);
  });

  it('fails closed tamper invariants for off-row fingerprints, requirements, and coverage', () => {
    const candidate = { path: 'client/src/pages/synthetic.tsx', importer_evidence: [] };
    const listener = {
      candidate_path: 'server/synthetic.ts',
      listener_id: 'synthetic-listener',
      disposition: 'non-product-tooling',
      rationale: 'fixture tooling listener',
      evidence: ['fixture evidence'],
      fingerprint: '0'.repeat(64),
    };
    const orphan = {
      id: 'api:GET:/synthetic',
      resolution: 'pruned',
      last_contract_fingerprint: 'source-fingerprint',
      resolution_evidence: 'fixture evidence',
      resolution_fingerprint: '0'.repeat(64),
    };
    const exclusion = {
      id: 'synthetic-exclusion',
      matched_layer: 'layer',
      rule: 'fixture rule',
      evidence: 'fixture evidence',
      fingerprint: '0'.repeat(64),
    };
    const requirements = {
      families: [
        {
          id: 'optional',
          selector: { kind: 'explicit', ids: [] },
          absence_evidence: {
            status: 'approved',
            search_selector: 'fixture',
            result: 'absent',
            fingerprint: '0'.repeat(64),
          },
        },
      ],
    };
    const errors = validateOffRowFingerprints({
      listeners: [listener],
      candidates: [{ ...candidate, contract_fingerprint: '0'.repeat(64) }],
      exclusions: [exclusion],
      orphans: [orphan],
      requirements,
      discoveredListeners: [{ path: listener.candidate_path, patterns: [] }],
    });
    expect(errors).toEqual(
      expect.arrayContaining([
        'listener disposition fingerprint mismatch: synthetic-listener',
        'dormant candidate fingerprint mismatch: client/src/pages/synthetic.tsx',
        'orphan resolution fingerprint mismatch: api:GET:/synthetic',
        'runtime exclusion fingerprint mismatch: synthetic-exclusion',
        'absence evidence fingerprint mismatch: optional',
      ])
    );

    const missingFingerprintErrors = validateOffRowFingerprints({
      listeners: [{ ...listener, fingerprint: undefined }],
      candidates: [{ ...candidate, decision_status: 'approved' }],
      exclusions: [{ ...exclusion, decision_status: 'approved', fingerprint: undefined }],
      orphans: [{ ...orphan, decision_status: 'approved', resolution_fingerprint: undefined }],
      requirements: {
        families: [
          {
            ...requirements.families[0],
            absence_evidence: {
              ...requirements.families[0].absence_evidence,
              fingerprint: undefined,
            },
          },
        ],
      },
      discoveredListeners: [{ path: listener.candidate_path, patterns: [] }],
    });
    expect(missingFingerprintErrors).toEqual(
      expect.arrayContaining([
        'listener disposition fingerprint missing: synthetic-listener',
        'dormant candidate fingerprint missing: client/src/pages/synthetic.tsx',
        'runtime exclusion fingerprint missing: synthetic-exclusion',
        'orphan resolution fingerprint missing: api:GET:/synthetic',
        'absence evidence fingerprint missing: optional',
      ])
    );

    const closedDocument = {
      phase: 'closed',
      g1_closure: { requirements_sha256: 'wrong', families: { optional: ['api:GET:/wrong'] } },
      coverage_review: { 'api:GET:/synthetic': { test_coverage: 'none-reviewed' } },
      rows: [
        {
          id: 'api:GET:/synthetic',
          exposures: [{ deployment: 'vercel-api', runtime: 'make_app' }],
          test_evidence: {
            derived: [
              {
                layer: 'unit',
                assertion_confirmed: true,
                assertion_evidence: 'tests/unit/synthetic.test.ts',
              },
            ],
            manual: [],
          },
        },
      ],
    };
    const closedErrors = validateClosedPhaseInvariants({
      document: closedDocument,
      requirements,
      families: [{ id: 'optional', matched_ids: [] }],
    });
    expect(closedErrors).toEqual(
      expect.arrayContaining([
        'closed matrix requirements content hash mismatch',
        'closed matrix requirement match set mismatch: optional',
        'closed exposure lacks confirmed test evidence or none-reviewed attestation: api:GET:/synthetic/vercel-api/make_app',
      ])
    );
    expect(
      closureReport({
        document: closedDocument,
        requirements,
        exclusions: [exclusion],
      }).issues.unresolved_exclusions
    ).toEqual(['synthetic-exclusion']);

    const closeFixture = {
      matrix: {
        phase: 'authoring',
        rows: [
          {
            id: 'api:GET:/close-fixture',
            decision_status: 'approved',
            classification: 'classified',
            personas: ['gp'],
            persistence: 'reads-only',
            destructive: 'none',
            environment: 'prod-safe',
            owner: 'gp-team',
            decision: 'in-contract',
            exposures: [{ deployment: 'vercel-api', runtime: 'make_app', boot_status: 'proven' }],
          },
        ],
        coverage_review: {},
      },
      requirements: {
        families: [
          {
            id: 'close-family',
            selector: { kind: 'explicit', ids: ['api:GET:/close-fixture'] },
            matched_ids: ['api:GET:/close-fixture'],
          },
        ],
      },
      listeners: [],
      candidates: [],
      exclusions: [],
      orphans: [],
      listenerCandidates: [],
      discoveredRoles: ['admin', 'partner', 'analyst', 'lp', 'service', 'public'],
    };
    const closeErrors = validateClosedPhaseInvariants({
      document: { ...closeFixture.matrix, phase: 'closed' },
      requirements: closeFixture.requirements,
      families: [{ id: 'close-family', matched_ids: ['api:GET:/close-fixture'] }],
    });
    expect(closeErrors).toContain(
      'closed exposure lacks confirmed test evidence or none-reviewed attestation: api:GET:/close-fixture/vercel-api/make_app'
    );
    expect(closeErrors.length).toBeGreaterThan(0);

    const staleRow = {
      ...closeFixture.matrix.rows[0],
      contract_fingerprint: '0'.repeat(64),
    };
    const staleFixture = {
      ...closeFixture,
      matrix: {
        phase: 'authoring',
        rows: [staleRow],
        coverage_review: {
          'api:GET:/close-fixture|vercel-api|make_app': {
            test_coverage: 'none-reviewed',
            contract_fingerprint: contractFingerprint(staleRow),
          },
        },
      },
    };
    expect(
      validateClosedPhaseInvariants({
        document: { ...staleFixture.matrix, phase: 'closed' },
        requirements: staleFixture.requirements,
        families: [{ id: 'close-family', matched_ids: ['api:GET:/close-fixture'] }],
      })
    ).toEqual(
      expect.arrayContaining([
        'closed matrix requirements content hash mismatch',
        'closed matrix requirement match set mismatch: close-family',
        'closed exposure lacks confirmed test evidence or none-reviewed attestation: api:GET:/close-fixture/vercel-api/make_app',
      ])
    );
    expect(validateRowIntegrity({ document: staleFixture.matrix, inventory: undefined })).toContain(
      'approved fingerprint mismatch: api:GET:/close-fixture'
    );
  });
});
