import { VERSION, getReleaseIdentity, type ReleaseIdentity } from '../server/version';

export const SUPPORTED_WORKER_TYPES = ['fund-scenario-calc', 'capital-call-status'] as const;
export type SupportedWorkerType = (typeof SUPPORTED_WORKER_TYPES)[number];

export interface WorkerDeploymentIdentity extends ReleaseIdentity {
  workerType: SupportedWorkerType;
  deploymentId: string;
}

const COMMIT_SHA_PATTERN = /^[a-f0-9]{40}$/;
const RAILWAY_IDENTITY_MARKERS = [
  'RAILWAY_SERVICE_NAME',
  'RAILWAY_ENVIRONMENT_NAME',
  'RAILWAY_GIT_COMMIT_SHA',
  'RAILWAY_DEPLOYMENT_ID',
] as const;

function environmentValue(name: string, environment: NodeJS.ProcessEnv): string | undefined {
  const value = environment[name]?.trim();
  return value || undefined;
}

function requireEnvironmentValue(name: string, environment: NodeJS.ProcessEnv): string {
  const value = environmentValue(name, environment);
  if (!value) {
    throw new Error(`Worker deployment identity requires ${name}`);
  }
  return value;
}

function hasRailwayIdentityMarker(environment: NodeJS.ProcessEnv): boolean {
  return RAILWAY_IDENTITY_MARKERS.some((name) => environmentValue(name, environment));
}

/**
 * Resolve a worker's immutable deployment identity before it can create queue
 * resources. Local execution is explicitly limited to development and test;
 * any Railway marker there is rejected instead of being synthesized.
 */
export function resolveWorkerDeploymentIdentity(
  expectedWorkerType: SupportedWorkerType,
  environment: NodeJS.ProcessEnv = process.env
): WorkerDeploymentIdentity {
  const workerType = requireEnvironmentValue('WORKER_TYPE', environment);
  if (workerType !== expectedWorkerType) {
    throw new Error('Worker deployment identity has an unexpected WORKER_TYPE');
  }

  const nodeEnvironment = environmentValue('NODE_ENV', environment);
  if (nodeEnvironment === 'development' || nodeEnvironment === 'test') {
    if (hasRailwayIdentityMarker(environment)) {
      throw new Error('Local worker identity must not include Railway identity markers');
    }

    return {
      version: VERSION,
      commit: 'local',
      environment: nodeEnvironment,
      workerType: expectedWorkerType,
      deploymentId: 'local',
    };
  }

  if (nodeEnvironment !== 'production') {
    throw new Error(
      'Worker deployment identity requires NODE_ENV to be production, development, or test'
    );
  }

  const serviceName = requireEnvironmentValue('RAILWAY_SERVICE_NAME', environment);
  if (serviceName !== expectedWorkerType) {
    throw new Error('Worker deployment identity has an unexpected Railway service name');
  }

  const railwayEnvironment = requireEnvironmentValue('RAILWAY_ENVIRONMENT_NAME', environment);
  if (railwayEnvironment !== 'production') {
    throw new Error('Worker deployment identity requires the Railway production environment');
  }

  const railwayCommit = requireEnvironmentValue('RAILWAY_GIT_COMMIT_SHA', environment);
  if (!COMMIT_SHA_PATTERN.test(railwayCommit)) {
    throw new Error('Worker deployment identity requires a valid lowercase Railway commit SHA');
  }

  const deploymentId = requireEnvironmentValue('RAILWAY_DEPLOYMENT_ID', environment);
  const releaseIdentity = getReleaseIdentity();
  if (releaseIdentity.commit !== railwayCommit) {
    throw new Error('Worker deployment identity commit does not match release identity');
  }

  return {
    ...releaseIdentity,
    workerType: expectedWorkerType,
    deploymentId,
  };
}
