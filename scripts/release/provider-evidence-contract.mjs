import { URL } from 'node:url';

const SHA = /^[a-f0-9]{40}$/;
const HOST = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.vercel\.app$/;
const WORKER_NAMES = Object.freeze(['fund-scenario-calc', 'capital-call-status']);
const VERSION_KEYS = Object.freeze([
  'arch',
  'commit',
  'environment',
  'nodeVersion',
  'platform',
  'timestamp',
  'version',
]);

function fail(message) {
  throw new Error(`Provider evidence contract failed: ${message}`);
}

function requiredText(value, message) {
  if (typeof value !== 'string' || value.trim() === '') fail(message);
  return value;
}

function requiredSha(value, message = 'expected SHA is invalid') {
  if (typeof value !== 'string' || !SHA.test(value)) fail(message);
  return value;
}

function requiredArray(value, message) {
  if (!Array.isArray(value)) fail(message);
  return value;
}

function bareHttpsVercelHost(value) {
  if (typeof value !== 'string') fail('Vercel deployment URL is invalid');
  let url;
  try {
    url = new URL(value);
  } catch {
    fail('Vercel deployment URL is invalid');
  }
  const host = url.hostname.toLowerCase();
  if (
    url.protocol !== 'https:' ||
    url.username !== '' ||
    url.password !== '' ||
    url.port !== '' ||
    url.pathname !== '/' ||
    url.search !== '' ||
    url.hash !== '' ||
    !HOST.test(host)
  ) {
    fail('Vercel deployment URL is invalid');
  }
  return host;
}

export function assertVercelCandidateHost(url) {
  return bareHttpsVercelHost(url);
}

export function normalizeCanonicalHostname(value) {
  if (typeof value !== 'string' || value !== value.trim()) {
    fail('canonical hostname is invalid');
  }
  const hostname = value.toLowerCase();
  if (
    hostname !== value ||
    hostname.length === 0 ||
    hostname.length > 253 ||
    hostname.includes('://') ||
    hostname.includes('/') ||
    hostname.includes('?') ||
    hostname.includes('#') ||
    hostname.includes(':') ||
    hostname.includes('@') ||
    hostname.includes('*') ||
    !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(hostname)
  ) {
    fail('canonical hostname is invalid');
  }
  return hostname;
}

function normalizeAliases(value) {
  const hasAliases = Object.prototype.hasOwnProperty.call(value, 'aliases');
  const hasAlias = Object.prototype.hasOwnProperty.call(value, 'alias');
  if (!hasAliases && !hasAlias) fail('Vercel aliases are missing');
  const aliases = hasAliases ? value.aliases : value.alias;
  const legacyAliases = hasAlias ? value.alias : undefined;
  requiredArray(aliases, 'Vercel aliases are malformed');
  if (hasAliases && hasAlias && JSON.stringify(aliases) !== JSON.stringify(legacyAliases)) {
    fail('Vercel aliases conflict');
  }
  return aliases.map((alias) => {
    if (typeof alias !== 'string' || alias.trim() === '') fail('Vercel alias is malformed');
    return alias.toLowerCase();
  });
}

function normalizeVercelDeployment(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('Vercel deployment is missing');
  }
  const meta = value.meta;
  if (meta !== undefined && (!meta || typeof meta !== 'object' || Array.isArray(meta))) {
    fail('Vercel deployment metadata is malformed');
  }
  const normalizedMeta = {};
  for (const key of ['githubCommitRef', 'githubCommitSha', 'githubDeployment']) {
    if (meta?.[key] !== undefined) normalizedMeta[key] = meta[key];
  }
  return {
    id: requiredText(value.id, 'Vercel deployment ID is required'),
    url: requiredText(value.url, 'Vercel deployment URL is required'),
    readyState: value.readyState,
    target: value.target,
    projectId: requiredText(value.projectId, 'Vercel deployment project ID is required'),
    aliases: normalizeAliases(value),
    meta: normalizedMeta,
  };
}

function normalizeVersion(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('Vercel version response is missing');
  }
  const keys = Object.keys(value).sort();
  if (JSON.stringify(keys) !== JSON.stringify([...VERSION_KEYS].sort())) {
    fail('Vercel version response is malformed');
  }
  return Object.fromEntries(VERSION_KEYS.map((key) => [key, value[key]]));
}

function deploymentFromEvidence(vercel) {
  if (!vercel || typeof vercel !== 'object' || Array.isArray(vercel)) {
    fail('Vercel evidence is missing');
  }
  return vercel.deployment ?? vercel;
}

export function normalizeVercelEvidence(vercel, expectedProjectId) {
  const deployment = normalizeVercelDeployment(deploymentFromEvidence(vercel));
  requiredText(expectedProjectId, 'Vercel expected project ID is required');
  if (deployment.projectId !== expectedProjectId) {
    fail('Vercel deployment project does not match expected project');
  }
  const version = vercel?.version === undefined ? undefined : normalizeVersion(vercel.version);
  return {
    expectedProjectId,
    deployment,
    ...(version === undefined ? {} : { version }),
  };
}

function verifyStagedVercel(normalized, expectedSha) {
  const sha = requiredSha(expectedSha);
  const { deployment, version } = normalized;
  if (deployment.readyState !== 'READY') fail('Vercel deployment is not READY');
  if (deployment.target !== 'production') fail('Vercel staged candidate target is invalid');
  if (deployment.aliases.length !== 0) fail('Vercel staged candidate has an alias');
  if (
    deployment.meta.githubCommitRef !== 'main' ||
    deployment.meta.githubCommitSha !== sha
  ) {
    fail('Vercel deployment commit does not match expected SHA');
  }
  if (deployment.url.includes('://')) {
    bareHttpsVercelHost(deployment.url);
  } else if (!HOST.test(deployment.url.toLowerCase())) {
    fail('Vercel deployment URL is invalid');
  }
  if (!version || version.commit !== sha || version.environment !== 'production') {
    fail('Vercel version response does not match expected SHA');
  }
  return {
    projectId: deployment.projectId,
    deploymentId: deployment.id,
    sourceSha: sha,
    deployment,
    version,
  };
}

function verifyCanonicalVercel(normalized, canonicalHostname) {
  const hostname = normalizeCanonicalHostname(canonicalHostname);
  const { deployment } = normalized;
  if (deployment.readyState !== 'READY') fail('Vercel deployment is not READY');
  if (deployment.target !== 'production') fail('Vercel canonical deployment target is invalid');
  if (!deployment.aliases.includes(hostname)) fail('Vercel canonical alias does not match');
  const sourceSha = deployment.meta.githubCommitSha;
  requiredSha(sourceSha, 'Vercel canonical source SHA is invalid');
  return {
    projectId: deployment.projectId,
    deploymentId: deployment.id,
    sourceSha,
    deployment,
    ...(normalized.version === undefined ? {} : { version: normalized.version }),
  };
}

export function verifyVercelEvidence(vercel, expectedProjectId, mode) {
  if (!mode || typeof mode !== 'object' || typeof mode.kind !== 'string') {
    fail('Vercel evidence mode is invalid');
  }
  const normalized = normalizeVercelEvidence(vercel, expectedProjectId);
  if (mode.kind === 'staged_candidate') return verifyStagedVercel(normalized, mode.expectedSha);
  if (mode.kind === 'canonical_baseline') {
    return verifyCanonicalVercel(normalized, mode.canonicalHostname);
  }
  fail('Vercel evidence mode is invalid');
}

function normalizeRailwayDeployment(value) {
  if (value === undefined || value === null) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('Railway deployment is malformed');
  }
  const meta = value.meta;
  if (meta !== undefined && (!meta || typeof meta !== 'object' || Array.isArray(meta))) {
    fail('Railway deployment metadata is malformed');
  }
  return {
    id: value.id,
    status: value.status,
    deploymentStopped: value.deploymentStopped,
    meta: { ...(meta?.commitHash === undefined ? {} : { commitHash: meta.commitHash }) },
    instances: Array.isArray(value.instances)
      ? value.instances.map((instance) => ({ id: instance?.id, status: instance?.status }))
      : value.instances,
  };
}

function normalizeRailwayService(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('Railway service is malformed');
  }
  const domains = value.domains ?? {};
  const serviceDomains = Array.isArray(domains) ? domains : domains.serviceDomains ?? [];
  const customDomains = Array.isArray(domains) ? [] : domains.customDomains ?? [];
  if (!domains || typeof domains !== 'object') {
    fail('Railway service domains are malformed');
  }
  if (!Array.isArray(serviceDomains) || !Array.isArray(customDomains)) {
    fail('Railway service domains are malformed');
  }
  return {
    serviceId: requiredText(value.serviceId, 'Railway service ID is required'),
    serviceName: requiredText(value.serviceName, 'Railway service name is required'),
    numReplicas: value.numReplicas,
    domains: [...serviceDomains, ...customDomains].map((domain) => {
      if (typeof domain === 'string') return domain;
      if (domain && typeof domain.id === 'string') return domain.id;
      fail('Railway domain is malformed');
    }),
    latestDeployment: normalizeRailwayDeployment(value.latestDeployment),
    activeDeployments: Array.isArray(value.activeDeployments)
      ? value.activeDeployments.map(normalizeRailwayDeployment)
      : value.activeDeployments,
  };
}

function normalizeRailwayServices(value) {
  return requiredArray(value, 'Railway service topology is malformed').map(normalizeRailwayService);
}

export function normalizeRailwayResponse(response) {
  if (!response || typeof response !== 'object' || Array.isArray(response)) {
    fail('Railway response is missing');
  }
  if (Array.isArray(response.errors) && response.errors.length > 0) {
    fail('Railway GraphQL response contains errors');
  }
  if (!response.data) {
    return {
      projectId: requiredText(response.projectId, 'Railway project ID is required'),
      environmentId: requiredText(response.environmentId, 'Railway environment ID is required'),
      services: normalizeRailwayServices(response.services),
    };
  }
  const data = response.data;
  const environment = data?.environment;
  const instances = environment?.serviceInstances;
  if (!environment || !instances || !Array.isArray(instances.edges)) {
    fail('Railway environment response is malformed');
  }
  if (instances.pageInfo?.hasNextPage !== false) {
    fail('Railway service pagination is truncated');
  }
  const nodes = instances.edges.map((edge) => {
    if (!edge || !edge.node) fail('Railway service topology is malformed');
    return edge.node;
  });
  return {
    projectId: requiredText(data.projectId, 'Railway project ID is required'),
    environmentId: requiredText(data.environmentId, 'Railway environment ID is required'),
    services: normalizeRailwayServices(nodes),
  };
}

function normalizeProtectedTopology(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('Railway protected topology is missing');
  }
  const services = value.services;
  if (!services || typeof services !== 'object' || Array.isArray(services)) {
    fail('Railway protected topology is malformed');
  }
  return {
    projectId: requiredText(value.projectId, 'Railway expected project ID is required'),
    environmentId: requiredText(value.environmentId, 'Railway expected environment ID is required'),
    services: {
      'fund-scenario-calc': requiredText(
        services['fund-scenario-calc'],
        'Railway fund service ID is required'
      ),
      'capital-call-status': requiredText(
        services['capital-call-status'],
        'Railway capital service ID is required'
      ),
    },
  };
}

function verifyDeployment(deployment, expectedSha, serviceName, kind) {
  if (!deployment || typeof deployment !== 'object') {
    fail('Railway protected deployment is missing');
  }
  requiredText(deployment.id, 'Railway deployment ID is required');
  if (deployment.status !== 'SUCCESS' || deployment.deploymentStopped !== false) {
    fail(`Railway ${kind} deployment is not successful and running`);
  }
  if (deployment.meta?.commitHash !== expectedSha) {
    fail(`Railway ${kind} deployment does not match expected SHA`);
  }
  if (
    !Array.isArray(deployment.instances) ||
    deployment.instances.length !== 1 ||
    deployment.instances[0]?.status !== 'RUNNING'
  ) {
    fail(`Railway ${serviceName} deployment instance is invalid`);
  }
}

function verifyProtectedService(service, serviceName, expectedServiceId, expectedSha) {
  if (!service || service.serviceName !== serviceName || service.serviceId !== expectedServiceId) {
    fail('Railway protected service identity does not match');
  }
  if (service.numReplicas !== 1) fail('Railway protected service replica count is invalid');
  if (!Array.isArray(service.domains) || service.domains.length !== 0) {
    fail('Railway protected service domains are invalid');
  }
  const active = service.activeDeployments;
  if (!Array.isArray(active) || active.length !== 1) {
    fail('Railway protected service active deployment is invalid');
  }
  verifyDeployment(service.latestDeployment, expectedSha, serviceName, 'latest');
  verifyDeployment(active[0], expectedSha, serviceName, 'active');
  if (service.latestDeployment.id !== active[0].id) {
    fail('Railway latest and active deployments differ');
  }
  return {
    serviceId: service.serviceId,
    serviceName: service.serviceName,
    deploymentId: active[0].id,
  };
}

export function verifyRailwayTopology(railway, expectedSha, protectedTopology) {
  const normalized = normalizeRailwayResponse(railway);
  const sha = requiredSha(expectedSha);
  const expected = normalizeProtectedTopology(protectedTopology);
  if (
    normalized.projectId !== expected.projectId ||
    normalized.environmentId !== expected.environmentId
  ) {
    fail('Railway project or environment does not match expected identity');
  }
  const services = normalized.services;
  const names = new Map();
  const ids = new Map();
  for (const service of services) {
    names.set(service.serviceName, (names.get(service.serviceName) ?? 0) + 1);
    ids.set(service.serviceId, (ids.get(service.serviceId) ?? 0) + 1);
  }
  for (const workerName of WORKER_NAMES) {
    if ((names.get(workerName) ?? 0) !== 1) {
      fail('Railway protected service name is duplicated or missing');
    }
    const serviceId = expected.services[workerName];
    if ((ids.get(serviceId) ?? 0) !== 1) {
      fail('Railway protected service ID is duplicated or missing');
    }
    const service = services.find((candidate) => candidate.serviceName === workerName);
    if (service?.serviceId !== serviceId) fail('Railway protected service pair is cross-mapped');
    const serviceById = services.find((candidate) => candidate.serviceId === serviceId);
    if (serviceById?.serviceName !== workerName) fail('Railway protected service pair is cross-mapped');
  }
  const serviceSummary = WORKER_NAMES.map((workerName) =>
    verifyProtectedService(
      services.find((service) => service.serviceName === workerName),
      workerName,
      expected.services[workerName],
      sha
    )
  );
  return {
    projectId: normalized.projectId,
    environmentId: normalized.environmentId,
    deploymentIds: Object.fromEntries(serviceSummary.map((service) => [service.serviceName, service.deploymentId])),
    services: serviceSummary,
  };
}

export { WORKER_NAMES, VERSION_KEYS };
