import fs from 'node:fs';
import { Buffer } from 'node:buffer';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';

import ts from 'typescript';

import { scanBullmqConstructors } from '../../surface-contract-matrix/matrix-schema.mjs';

const execFileAsync = promisify(execFile);
const scriptPath = fileURLToPath(import.meta.url);
const defaultRepoRoot = path.resolve(path.dirname(scriptPath), '../../..');
const DEFAULT_OUTPUT_RELATIVE_PATH = 'audit/knowledge-graph/out';
const ROUTE_DEFINITION_PATH = 'shared/routes/app-route-definitions.ts';
const ROUTE_GOVERNANCE_PATH = 'shared/routes/route-governance-registry.ts';
const APP_ROUTES_PATH = 'client/src/app/app-routes.tsx';
const APP_ROUTER_PATH = 'client/src/app/app-router.tsx';
const INVENTORY_PATH = 'audit/surface-contract-matrix/source-inventory.json';
const QUEUE_REGISTRY_PATH = 'server/queues/registry.ts';
const INSPECTOR_PATH = 'audit/surface-contract-matrix/scripts/inspect-runtime.mjs';
const INSPECTOR_PROFILES = [
  'default',
  'gate:ENABLE_METRICS:enabled',
  'gate:ENABLE_METRICS:disabled',
  'gate:ENABLE_PORTFOLIO_INTELLIGENCE:enabled',
  'gate:ENABLE_PORTFOLIO_INTELLIGENCE:disabled',
  'gate:ENABLE_MARGINAL_RESERVE_MOIC:enabled',
  'gate:ENABLE_MARGINAL_RESERVE_MOIC:disabled',
  'gate:ENABLE_SCENARIO_SEED_PICKER:enabled',
  'gate:ENABLE_SCENARIO_SEED_PICKER:disabled',
  'gate:ENABLE_STAT_GATING:enabled',
  'gate:ENABLE_STAT_GATING:disabled',
  'gate:ENABLE_SESSIONS:enabled',
  'gate:ENABLE_SESSIONS:disabled',
  'gate:ENABLE_QUEUES:enabled',
  'gate:ENABLE_QUEUES:disabled',
  'gate:ENABLE_RUM_V2:enabled',
  'gate:ENABLE_RUM_V2:disabled',
  'development',
];
const RUNTIME_INSPECTOR_CONCURRENCY = 4;
const runtimeDocumentsCache = new Map();

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const repoPath = (value) => value.split(path.sep).join('/');
const stableValue = (value) => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableValue(entry)]),
    );
  }
  return value;
};
const stableJson = (value) => JSON.stringify(stableValue(value));
const jsonLine = (value) => `${stableJson(value)}\n`;
const lineNumber = (sourceFile, node) => sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
const unwrap = (node) => {
  if (!node) return undefined;
  let current = node;
  while (
    ts.isAsExpression(current)
    || ts.isSatisfiesExpression(current)
    || ts.isParenthesizedExpression(current)
    || ts.isTypeAssertionExpression(current)
  ) {
    current = current.expression;
  }
  return current;
};

function sourceFileFor(relativePath, source) {
  const sourceFile = ts.createSourceFile(
    relativePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    relativePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  if (sourceFile.parseDiagnostics?.length) {
    throw new Error(`AST source inspection failed for ${relativePath}`);
  }
  return sourceFile;
}

function variableDeclaration(sourceFile, name) {
  let result;
  const visit = (node) => {
    if (result || !ts.isVariableDeclaration(node)) {
      ts.forEachChild(node, visit);
      return;
    }
    if (ts.isIdentifier(node.name) && node.name.text === name) result = node;
  };
  visit(sourceFile);
  return result;
}

function propertyName(node) {
  if (!node) return undefined;
  if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)) return node.text;
  return undefined;
}

function literalValue(node, sourceFile) {
  const value = unwrap(node);
  if (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) return value.text;
  if (value.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (value.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (ts.isNumericLiteral(value)) return Number(value.text);
  if (ts.isArrayLiteralExpression(value)) return value.elements.map((entry) => literalValue(entry, sourceFile));
  if (ts.isObjectLiteralExpression(value)) {
    const result = {};
    for (const entry of value.properties) {
      if (!ts.isPropertyAssignment(entry)) continue;
      const key = propertyName(entry.name);
      if (key) result[key] = literalValue(entry.initializer, sourceFile);
    }
    return result;
  }
  return undefined;
}

function findPropertyAssignments(sourceFile, variableName) {
  const declaration = variableDeclaration(sourceFile, variableName);
  const initializer = declaration && unwrap(declaration.initializer);
  if (!initializer || !ts.isObjectLiteralExpression(initializer)) return [];
  return initializer.properties.filter((entry) => ts.isPropertyAssignment(entry));
}

function mapEntries(sourceFile, variableName) {
  const entries = [];
  for (const property of findPropertyAssignments(sourceFile, variableName)) {
    const key = propertyName(property.name);
    if (!key) continue;
    entries.push({
      key,
      value: property.initializer.getText(sourceFile),
      line: lineNumber(sourceFile, property),
    });
  }
  return entries;
}

function parseRouteValues(routeSource, routeFile) {
  const sourceFile = sourceFileFor(routeFile, routeSource);
  const read = (name) => {
    const declaration = variableDeclaration(sourceFile, name);
    if (!declaration?.initializer) throw new Error(`Route source inspection missing ${name}`);
    return literalValue(declaration.initializer, sourceFile);
  };
  const arrays = ['APP_ROUTE_DEFINITIONS', 'ARCHIVED_PLACEHOLDER_ROUTES', 'LP_ROUTE_DEFINITIONS'];
  const result = Object.fromEntries(arrays.map((name) => [name, read(name)]));
  for (const name of [
    'LP_INDEX_REDIRECT_PATH',
    'LP_INDEX_REDIRECT_TARGET',
    'LEGACY_REDIRECT_ROUTES',
    'PUBLIC_ENTRY_ROUTES',
    'ADMIN_GATED_ROUTES',
  ]) result[name] = read(name);
  return result;
}

async function importRouteValues(repoRoot) {
  const routeFile = path.join(repoRoot, ROUTE_DEFINITION_PATH);
  const routeSource = await readFile(routeFile, 'utf8');
  const parsed = parseRouteValues(routeSource, ROUTE_DEFINITION_PATH);
  try {
    const imported = await import(pathToFileURL(routeFile).href);
    return {
      ...parsed,
      ...Object.fromEntries([
        'APP_ROUTE_DEFINITIONS',
        'ARCHIVED_PLACEHOLDER_ROUTES',
        'LP_ROUTE_DEFINITIONS',
        'LP_INDEX_REDIRECT_PATH',
        'LP_INDEX_REDIRECT_TARGET',
        'LEGACY_REDIRECT_ROUTES',
        'PUBLIC_ENTRY_ROUTES',
        'ADMIN_GATED_ROUTES',
      ].map((name) => [name, imported[name]])),
    };
  } catch {
    return parsed;
  }
}

async function importGovernancePaths(repoRoot, routes) {
  const governanceFile = path.join(repoRoot, ROUTE_GOVERNANCE_PATH);
  const governanceSource = await readFile(governanceFile, 'utf8');
  try {
    const imported = await import(pathToFileURL(governanceFile).href);
    return imported.ROUTE_GOVERNANCE_REGISTRY.map((entry) => entry.path);
  } catch {
    const paths = [];
    const addRoutePaths = (name) => {
      if (governanceSource.includes(`...${name}.map`)) {
        for (const entry of routes[name]) paths.push(entry.path);
      }
    };
    addRoutePaths('APP_ROUTE_DEFINITIONS');
    addRoutePaths('ARCHIVED_PLACEHOLDER_ROUTES');
    addRoutePaths('LP_ROUTE_DEFINITIONS');
    const specialNames = [
      ['LEGACY_REDIRECT_ROUTES', routes.LEGACY_REDIRECT_ROUTES],
      ['PUBLIC_ENTRY_ROUTES', routes.PUBLIC_ENTRY_ROUTES],
      ['ADMIN_GATED_ROUTES', routes.ADMIN_GATED_ROUTES],
    ];
    for (const [name, values] of specialNames) {
      for (const value of Object.values(values)) {
        if (governanceSource.includes(`${name}.`)) paths.push(value);
      }
    }
    if (governanceSource.includes('path: \'/\'')) paths.push('/');
    return paths;
  }
}

function jsxAttributes(element) {
  const attributes = ts.isJsxElement(element) ? element.openingElement.attributes : element.attributes;
  return new Map(
    attributes.properties
      .filter((entry) => ts.isJsxAttribute(entry))
      .map((entry) => [entry.name.text, entry.initializer]),
  );
}

function expressionString(expression, sourceFile, routes) {
  const value = unwrap(expression);
  if (!value) return undefined;
  if (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) return value.text;
  if (ts.isIdentifier(value)) {
    if (Object.prototype.hasOwnProperty.call(routes, value.text) && typeof routes[value.text] === 'string') {
      return routes[value.text];
    }
    return undefined;
  }
  if (ts.isPropertyAccessExpression(value)) {
    const objectName = value.expression.getText(sourceFile);
    const object = routes[objectName];
    if (object && typeof object === 'object') return object[value.name.text];
  }
  return undefined;
}

function jsxAttributeExpression(initializer) {
  if (!initializer || !ts.isJsxExpression(initializer) || !initializer.expression) return undefined;
  return initializer.expression;
}

function jsxElements(sourceFile) {
  const elements = [];
  const visit = (node) => {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) elements.push(node);
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return elements;
}

function jsxTagName(element, sourceFile) {
  const tagName = ts.isJsxElement(element) ? element.openingElement.tagName : element.tagName;
  return tagName.getText(sourceFile);
}

function descendants(element) {
  const found = [];
  const visit = (node) => {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) found.push(node);
    ts.forEachChild(node, visit);
  };
  if (ts.isJsxElement(element)) for (const child of element.children) visit(child);
  return found;
}

function routeElements(sourceFile, routes) {
  const result = [];
  for (const element of jsxElements(sourceFile)) {
    if (jsxTagName(element, sourceFile) !== 'Route') continue;
    const attributes = jsxAttributes(element, sourceFile);
    const pathExpression = jsxAttributeExpression(attributes.get('path'), sourceFile);
    const routePath = attributes.get('path') && ts.isStringLiteral(attributes.get('path'))
      ? attributes.get('path').text
      : expressionString(pathExpression, sourceFile, routes);
    if (!routePath) continue;
    const componentExpression = jsxAttributeExpression(attributes.get('component'), sourceFile);
    const component = componentExpression?.getText(sourceFile);
    const redirect = descendants(element)
      .filter((child) => jsxTagName(child, sourceFile) === 'Redirect')
      .map((child) => {
        const to = jsxAttributes(child, sourceFile).get('to');
        return expressionString(jsxAttributeExpression(to, sourceFile), sourceFile, routes)
          ?? (to && ts.isStringLiteral(to) ? to.text : undefined);
      })
      .find(Boolean);
    const nestedComponent = descendants(element)
      .map((child) => jsxTagName(child, sourceFile))
      .find((name) => ['UICatalog', 'SharedDashboard', 'PortalAccessDenied'].includes(name));
    result.push({
      path: routePath,
      component: component ?? nestedComponent,
      ...(redirect ? { redirect } : {}),
      line: lineNumber(sourceFile, element),
      sourcePath: APP_ROUTER_PATH,
    });
  }
  return result;
}

function mapMounts(sourceFile) {
  const mounts = new Map();
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === 'map') {
      const collection = node.expression.expression.getText(sourceFile);
      const key = collection === 'lpRoutes' ? 'LP_ROUTE_DEFINITIONS' : collection;
      if (['APP_ROUTES', 'ARCHIVED_PLACEHOLDER_ROUTES', 'LP_ROUTE_DEFINITIONS'].includes(key)) {
        const current = mounts.get(key) ?? [];
        current.push({ line: lineNumber(sourceFile, node), site: `${APP_ROUTER_PATH}:${lineNumber(sourceFile, node)}` });
        mounts.set(key, current);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return mounts;
}

function routeLineMap(routeSource, routeFile, routeValues) {
  const sourceFile = sourceFileFor(routeFile, routeSource);
  const result = new Map();
  for (const name of ['APP_ROUTE_DEFINITIONS', 'ARCHIVED_PLACEHOLDER_ROUTES', 'LP_ROUTE_DEFINITIONS']) {
    const declaration = variableDeclaration(sourceFile, name);
    const initializer = declaration && unwrap(declaration.initializer);
    if (!initializer || !ts.isArrayLiteralExpression(initializer)) continue;
    const lines = new Map();
    for (const element of initializer.elements) {
      const value = literalValue(element, sourceFile);
      if (value?.path) lines.set(value.path, lineNumber(sourceFile, element));
    }
    for (const entry of routeValues[name]) result.set(entry.path, { line: lines.get(entry.path) ?? lineNumber(sourceFile, declaration), sourcePath: routeFile });
  }
  return result;
}

function assertUnique(values, label) {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) throw new Error(`${label} contains duplicate ID: ${value}`);
    seen.add(value);
  }
}

function assertEqualSets(actual, expected, label) {
  const missing = [...expected].filter((value) => !actual.has(value));
  const extra = [...actual].filter((value) => !expected.has(value));
  if (missing.length || extra.length) {
    throw new Error(`${label} mismatch: missing=${missing.join(',')} extra=${extra.join(',')}`);
  }
}

function sourceSite(sourcePath, line) {
  if (!sourcePath || !Number.isInteger(line) || line < 1) throw new Error(`Missing source location: ${sourcePath}:${line}`);
  return `${sourcePath}:${line}`;
}

export async function extractClientRouteProjection({ repoRoot }) {
  if (!repoRoot) throw new Error('repoRoot is required for client route projection');
  const routes = await importRouteValues(repoRoot);
  const governancePaths = await importGovernancePaths(repoRoot, routes);
  assertUnique(governancePaths, 'Route governance registry');

  const appRoutesSource = await readFile(path.join(repoRoot, APP_ROUTES_PATH), 'utf8');
  const routeDefinitionSource = await readFile(path.join(repoRoot, ROUTE_DEFINITION_PATH), 'utf8');
  const routerSource = await readFile(path.join(repoRoot, APP_ROUTER_PATH), 'utf8');
  const appSourceFile = sourceFileFor(APP_ROUTES_PATH, appRoutesSource);
  const routerSourceFile = sourceFileFor(APP_ROUTER_PATH, routerSource);
  const appComponents = mapEntries(appSourceFile, 'APP_ROUTE_COMPONENTS');
  const lpComponents = mapEntries(appSourceFile, 'LP_ROUTE_COMPONENTS');
  const appDefinitionPaths = routes.APP_ROUTE_DEFINITIONS.map((entry) => entry.path);
  const lpDefinitionPaths = routes.LP_ROUTE_DEFINITIONS.map((entry) => entry.path);
  const archivedPaths = routes.ARCHIVED_PLACEHOLDER_ROUTES.map((entry) => entry.path);
  assertUnique(appDefinitionPaths, 'APP_ROUTE_DEFINITIONS');
  assertUnique(lpDefinitionPaths, 'LP_ROUTE_DEFINITIONS');
  assertUnique(archivedPaths, 'ARCHIVED_PLACEHOLDER_ROUTES');
  assertUnique(appComponents.map((entry) => entry.key), 'APP_ROUTE_COMPONENTS');
  assertUnique(lpComponents.map((entry) => entry.key), 'LP_ROUTE_COMPONENTS');
  assertEqualSets(new Set(appComponents.map((entry) => entry.key)), new Set(appDefinitionPaths), 'APP_ROUTE_COMPONENTS');
  assertEqualSets(new Set(lpComponents.map((entry) => entry.key)), new Set(lpDefinitionPaths), 'LP_ROUTE_COMPONENTS');

  const mounts = mapMounts(routerSourceFile);
  for (const [name, expected] of [
    ['APP_ROUTES', 1],
    ['ARCHIVED_PLACEHOLDER_ROUTES', 1],
    ['LP_ROUTE_DEFINITIONS', 1],
  ]) {
    if ((mounts.get(name) ?? []).length !== expected) throw new Error(`Missing or duplicate ${name}.map mount`);
  }

  const staticRoutes = routeElements(routerSourceFile, {
    ...routes,
    LEGACY_REDIRECT_ROUTES: routes.LEGACY_REDIRECT_ROUTES,
    PUBLIC_ENTRY_ROUTES: routes.PUBLIC_ENTRY_ROUTES,
    ADMIN_GATED_ROUTES: routes.ADMIN_GATED_ROUTES,
  });
  const appComponentByPath = new Map(appComponents.map((entry) => [entry.key, entry]));
  const lpComponentByPath = new Map(lpComponents.map((entry) => [entry.key, entry]));
  const routeLineByPath = routeLineMap(routeDefinitionSource, ROUTE_DEFINITION_PATH, routes);
  const records = [];
  const mountedPaths = new Set();
  const addRecord = ({ routePath, component, redirect, definition, mount }) => {
    if (mountedPaths.has(routePath)) throw new Error(`Client route mounted more than once: ${routePath}`);
    if (!component && !redirect) throw new Error(`Client route has no component or redirect: ${routePath}`);
    mountedPaths.add(routePath);
    const definitionSite = sourceSite(definition.sourcePath, definition.line);
    const mountSite = sourceSite(mount.sourcePath, mount.line);
    records.push({
      record: 'node',
      id: `croute:${routePath}`,
      type: 'ClientRoute',
      path: routePath,
      ...(component ? { component } : { redirect }),
      definition_site: definitionSite,
      mount_site: mountSite,
      source_path: definition.sourcePath,
      line_start: definition.line,
      line_end: definition.line,
    });
  };

  const appMount = mounts.get('APP_ROUTES')[0];
  for (const entry of routes.APP_ROUTE_DEFINITIONS) {
    const component = appComponentByPath.get(entry.path);
    addRecord({
      routePath: entry.path,
      component: component?.value,
      definition: routeLineByPath.get(entry.path),
      mount: { sourcePath: APP_ROUTER_PATH, line: appMount.line },
    });
  }
  const lpMount = mounts.get('LP_ROUTE_DEFINITIONS')[0];
  for (const entry of routes.LP_ROUTE_DEFINITIONS) {
    const component = lpComponentByPath.get(entry.path);
    addRecord({
      routePath: entry.path,
      component: component?.value,
      definition: routeLineByPath.get(entry.path),
      mount: { sourcePath: APP_ROUTER_PATH, line: lpMount.line },
    });
  }
  const archivedMount = mounts.get('ARCHIVED_PLACEHOLDER_ROUTES')[0];
  for (const entry of routes.ARCHIVED_PLACEHOLDER_ROUTES) {
    addRecord({
      routePath: entry.path,
      redirect: entry.redirectTarget,
      definition: routeLineByPath.get(entry.path),
      mount: { sourcePath: APP_ROUTER_PATH, line: archivedMount.line },
    });
  }

  const literalExpected = new Set([
    '/',
    '/login',
    routes.LP_INDEX_REDIRECT_PATH,
    ...Object.values(routes.LEGACY_REDIRECT_ROUTES),
    ...Object.values(routes.PUBLIC_ENTRY_ROUTES),
    ...Object.values(routes.ADMIN_GATED_ROUTES),
  ]);
  const literalByPath = new Map();
  for (const route of staticRoutes) {
    if (!literalExpected.has(route.path)) continue;
    const current = literalByPath.get(route.path) ?? [];
    current.push(route);
    literalByPath.set(route.path, current);
  }
  for (const routePath of literalExpected) {
    const candidates = literalByPath.get(routePath) ?? [];
    if (candidates.length !== 1) throw new Error(`Missing or duplicate literal client route mount: ${routePath}`);
    const route = candidates[0];
    addRecord({
      routePath,
      component: route.component,
      redirect: route.redirect,
      definition: { sourcePath: APP_ROUTER_PATH, line: route.line },
      mount: { sourcePath: APP_ROUTER_PATH, line: route.line },
    });
  }

  const expectedMounted = new Set([
    ...appDefinitionPaths,
    ...archivedPaths,
    ...lpDefinitionPaths,
    ...literalExpected,
  ]);
  assertEqualSets(mountedPaths, expectedMounted, 'Client mounted route set');
  const expectedGovernance = new Set(mountedPaths);
  expectedGovernance.delete('/login');
  expectedGovernance.delete(routes.LP_INDEX_REDIRECT_PATH);
  assertEqualSets(new Set(governancePaths), expectedGovernance, 'Route governance registry');
  assertUnique(records.map((record) => record.id), 'Client route projection');
  return records.sort((left, right) => left.path.localeCompare(right.path));
}

async function currentHead(repoRoot) {
  const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot });
  return stdout.trim();
}

async function commitTimestamp(repoRoot, commitSha) {
  const { stdout } = await execFileAsync('git', ['show', '-s', '--format=%cI', commitSha], { cwd: repoRoot });
  const timestamp = stdout.trim();
  if (!timestamp) throw new Error(`Commit timestamp unavailable for ${commitSha}`);
  return timestamp;
}

async function trackedStatus(repoRoot) {
  const { stdout } = await execFileAsync('git', ['status', '--porcelain=v1', '--untracked-files=no'], { cwd: repoRoot });
  return stdout.split('\n').filter(Boolean).map((line) => line.slice(3).split(' -> ').at(-1));
}

async function assertCleanProjectionInputs(repoRoot) {
  const dirty = (await trackedStatus(repoRoot)).map(repoPath);
  if (dirty.length) throw new Error(`Projection inputs are dirty: ${dirty.join(', ')}`);
}

async function readInventory(repoRoot) {
  const inventoryFile = path.join(repoRoot, INVENTORY_PATH);
  try {
    return JSON.parse(await readFile(inventoryFile, 'utf8'));
  } catch (error) {
    throw new Error(`Source inventory inspection failed: ${error.message}`);
  }
}

async function sourceHashes(repoRoot, inventory) {
  // boot-proofs.json is regenerated by the Step 9 pipeline between this
  // projection build and review initialization; it is matrix OUTPUT, not a
  // projection input, so hashing it here can only record bytes that are
  // stale by the time any rehash audit runs.
  const RUN_MUTABLE_ARTIFACTS = new Set(['audit/surface-contract-matrix/boot-proofs.json']);
  const sourcePaths = new Set([
    INVENTORY_PATH,
    ROUTE_DEFINITION_PATH,
    ROUTE_GOVERNANCE_PATH,
    APP_ROUTES_PATH,
    APP_ROUTER_PATH,
    QUEUE_REGISTRY_PATH,
    ...Object.keys(inventory.source_hashes ?? {})
      .filter((key) => !key.startsWith('snapshot:'))
      .map((key) => key.split('#')[0])
      .filter((key) => !RUN_MUTABLE_ARTIFACTS.has(key)),
  ]);
  const hashes = {};
  for (const relativePath of [...sourcePaths].sort((left, right) => left.localeCompare(right))) {
    const absolutePath = path.join(repoRoot, relativePath);
    let bytes;
    try {
      bytes = await readFile(absolutePath);
    } catch (error) {
      throw new Error(`Source inspection failed for ${relativePath}: ${error.message}`);
    }
    hashes[relativePath] = sha256(bytes);
  }
  return hashes;
}

function loaderPath(repoRoot) {
  const candidate = path.join(repoRoot, 'node_modules/tsx/dist/esm/index.mjs');
  if (fs.existsSync(candidate)) return candidate;
  return undefined;
}

function runInspector(repoRoot, profile) {
  return new Promise((resolve, reject) => {
    const loader = loaderPath(repoRoot);
    if (!loader) {
      reject(new Error(`Runtime inspection failed: tsx loader is missing under ${repoRoot}`));
      return;
    }
    const child = spawn(
      process.execPath,
      ['--import', loader, path.join(repoRoot, INSPECTOR_PATH), '--profile', profile, '--fs-variant', 'static'],
      {
        cwd: repoRoot,
        env: { ...process.env, DOTENVX_KEY: '' },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', (error) => reject(error));
    child.once('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Runtime inspection failed for ${profile}: ${stderr || `exit ${code}`}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(new Error(`Runtime inspection emitted invalid JSON for ${profile}: ${error.message}`));
      }
    });
  });
}

async function mapWithConcurrency(values, concurrency, callback) {
  const results = new Array(values.length);
  let next = 0;
  const worker = async () => {
    while (next < values.length) {
      const index = next;
      next += 1;
      results[index] = await callback(values[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
  return results;
}

async function runtimeApiProjection(repoRoot) {
  const key = path.resolve(repoRoot);
  if (!runtimeDocumentsCache.has(key)) {
    runtimeDocumentsCache.set(key, mapWithConcurrency(
      INSPECTOR_PROFILES,
      RUNTIME_INSPECTOR_CONCURRENCY,
      (profile) => runInspector(key, profile),
    ));
  }
  const documents = await runtimeDocumentsCache.get(key);
  const candidates = new Map();
  for (const document of documents) {
    for (const route of document.routes ?? []) {
      if (!route.id?.startsWith('api:') || route.role === 'shadowed' || !route.path?.startsWith('/')) continue;
      const id = `api:${route.method} ${route.path}`;
      const current = candidates.get(id) ?? [];
      current.push(route);
      candidates.set(id, current);
    }
  }
  const records = [];
  for (const [id, entries] of [...candidates.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const selected = [...entries].sort((left, right) => {
      const roleRank = { guard: 0, handler: 1, shadowed: 2 };
      return (roleRank[left.role] ?? 3) - (roleRank[right.role] ?? 3)
        || String(left.site).localeCompare(String(right.site))
        || String(left.surface).localeCompare(String(right.surface));
    })[0];
    const [sourcePath, rawLine] = String(selected.site ?? '').split(':');
    const line = Number(rawLine);
    records.push({
      record: 'node',
      id,
      type: 'APIEndpoint',
      method: selected.method,
      path: selected.path,
      source_path: sourcePath,
      line_start: line,
      line_end: line,
      role: selected.role,
      surface: selected.surface,
    });
  }
  return records;
}

async function workerProjection(repoRoot) {
  const findings = scanBullmqConstructors({ rootDir: repoRoot });
  const queueModule = await import(pathToFileURL(path.join(repoRoot, QUEUE_REGISTRY_PATH)).href);
  const catalog = new Map(queueModule.QUEUE_CATALOG.map((entry) => [entry.queueName, entry]));
  const grouped = new Map();
  for (const finding of findings) {
    if (!catalog.has(finding.queue_name)) throw new Error(`Discovered queue is absent from QUEUE_CATALOG: ${finding.queue_name}`);
    const current = grouped.get(finding.queue_name) ?? [];
    current.push(finding);
    grouped.set(finding.queue_name, current);
  }
  return [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([queue, entries]) => {
    const sites = entries
      .map((entry) => ({ constructor: entry.constructor, kind: entry.kind, source: entry.source, path: entry.path, line: entry.line }))
      .sort((left, right) => left.path.localeCompare(right.path) || left.line - right.line || left.constructor.localeCompare(right.constructor));
    const first = sites[0];
    const last = sites[sites.length - 1];
    return {
      record: 'node',
      id: `worker:${queue}`,
      type: 'WorkerJob',
      name: queue,
      queue,
      source_path: first.path,
      line_start: first.line,
      line_end: last.line,
      constructor_sites: sites,
      source_sites: sites.map((site) => `${site.path}:${site.line}`),
    };
  });
}

function addEdge(edges, type, from, to, sourcePath, line) {
  edges.push({
    record: 'edge',
    id: `edge:${type}:${from}:${to}:${sourcePath}:${line}`,
    type,
    from,
    to,
    source_path: sourcePath,
    line_start: line,
  });
}

function structuralEdges(nodes, clientRecords) {
  const edges = [];
  for (const node of nodes) {
    addEdge(edges, 'DEFINES', `source:${node.source_path}:${node.line_start}`, node.id, node.source_path, node.line_start);
    if (node.type === 'APIEndpoint') addEdge(edges, 'EXPOSES', `surface:${node.surface}`, node.id, node.source_path, node.line_start);
  }
  for (const record of clientRecords) {
    const [mountPath, mountLine] = record.mount_site.split(':');
    addEdge(edges, 'MOUNTS', `mount:${record.mount_site}`, record.id, mountPath, Number(mountLine));
  }
  return edges.sort((left, right) => left.id.localeCompare(right.id));
}

function validateRecords(nodes, edges) {
  assertUnique(nodes.map((record) => record.id), 'Route knowledge-graph nodes');
  assertUnique(edges.map((record) => record.id), 'Route knowledge-graph edges');
  for (const record of [...nodes, ...edges]) {
    if (record.record !== 'node' && record.record !== 'edge') throw new Error(`Invalid route record type: ${record.record}`);
    if (!record.commit_sha || !record.observed_at) throw new Error(`Record lacks commit binding: ${record.id}`);
    if (!record.source_path || !Number.isInteger(record.line_start) || record.line_start < 1) {
      throw new Error(`Record lacks source location: ${record.id}`);
    }
  }
}

function addCommitBinding(records, commitSha, timestamp) {
  return records.map((record) => ({ ...record, commit_sha: commitSha, observed_at: timestamp }));
}

function parseMode(value) {
  if (value !== 'seed' && value !== 'release') throw new Error(`Unsupported projection mode: ${value}`);
  return value;
}

export async function buildRouteKnowledgeGraph({ repoRoot, outputDir, expectedSha, mode = 'seed' }) {
  const root = path.resolve(repoRoot ?? defaultRepoRoot);
  const resolvedOutputDir = path.resolve(outputDir ?? path.join(root, DEFAULT_OUTPUT_RELATIVE_PATH));
  const projectionMode = parseMode(mode);
  const head = await currentHead(root);
  if (expectedSha !== undefined && expectedSha !== head) {
    throw new Error(`Expected SHA ${expectedSha} does not match HEAD ${head}`);
  }
  if (projectionMode === 'release') await assertCleanProjectionInputs(root);
  const timestamp = await commitTimestamp(root, head);
  const inventory = await readInventory(root);
  const hashes = await sourceHashes(root, inventory);
  const [apiNodes, clientNodes, workerNodes] = await Promise.all([
    runtimeApiProjection(root),
    extractClientRouteProjection({ repoRoot: root }),
    workerProjection(root),
  ]);
  const rawNodes = [...apiNodes, ...clientNodes, ...workerNodes];
  const nodes = addCommitBinding(rawNodes, head, timestamp).sort((left, right) => left.id.localeCompare(right.id));
  const edges = addCommitBinding(structuralEdges(nodes, addCommitBinding(clientNodes, head, timestamp)), head, timestamp);
  validateRecords(nodes, edges);
  const nodeTypeCounts = {
    APIEndpoint: nodes.filter((record) => record.type === 'APIEndpoint').length,
    ClientRoute: nodes.filter((record) => record.type === 'ClientRoute').length,
    WorkerJob: nodes.filter((record) => record.type === 'WorkerJob').length,
  };
  if (projectionMode === 'release') {
    for (const type of Object.keys(nodeTypeCounts)) {
      if (nodeTypeCounts[type] !== inventory.kg_counts?.[type]) {
        throw new Error(`Knowledge graph ${type} count mismatch: ${nodeTypeCounts[type]} vs ${inventory.kg_counts?.[type]}`);
      }
    }
  }
  const snapshotId = `snapshot:${sha256(stableJson({ commit_sha: head, commit_timestamp: timestamp, source_hashes: hashes, node_type_counts: nodeTypeCounts }))}`;
  const nodesBytes = Buffer.from(nodes.map((record) => jsonLine({ ...record, snapshot_id: snapshotId })).join(''));
  const edgesBytes = Buffer.from(edges.map((record) => jsonLine({ ...record, snapshot_id: snapshotId })).join(''));
  const artifact = (bytes) => ({ snapshot_id: snapshotId, sha256: sha256(bytes), byte_length: bytes.byteLength });
  const manifest = {
    schema: 'surface-route-projection-v1',
    snapshot_id: snapshotId,
    repo_head: head,
    commit_timestamp: timestamp,
    fresh_for_checkout: true,
    valid_for_release_proof: projectionMode === 'release',
    node_type_counts: nodeTypeCounts,
    source_hashes: hashes,
    artifacts: {
      'nodes-routes.jsonl': artifact(nodesBytes),
      'edges-routes.jsonl': artifact(edgesBytes),
    },
  };
  const manifestBytes = Buffer.from(`${stableJson(manifest)}\n`);
  await mkdir(resolvedOutputDir, { recursive: true });
  await writeFile(path.join(resolvedOutputDir, 'manifest.json'), manifestBytes);
  await writeFile(path.join(resolvedOutputDir, 'nodes-routes.jsonl'), nodesBytes);
  await writeFile(path.join(resolvedOutputDir, 'edges-routes.jsonl'), edgesBytes);
  return manifest;
}

function parseArgs(argv) {
  const args = { mode: 'seed', outputDir: undefined, expectedSha: undefined };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--mode') args.mode = argv[++index];
    else if (argument === '--expected-sha') args.expectedSha = argv[++index];
    else if (argument === '--output-dir') args.outputDir = argv[++index];
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return args;
}

const isEntrypoint = process.argv[1] && path.resolve(process.argv[1]) === scriptPath;
if (isEntrypoint) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const manifest = await buildRouteKnowledgeGraph({
      repoRoot: defaultRepoRoot,
      outputDir: args.outputDir ? path.resolve(args.outputDir) : path.join(defaultRepoRoot, DEFAULT_OUTPUT_RELATIVE_PATH),
      expectedSha: args.expectedSha,
      mode: args.mode,
    });
    process.stdout.write(`${JSON.stringify({ snapshot_id: manifest.snapshot_id, repo_head: manifest.repo_head })}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
