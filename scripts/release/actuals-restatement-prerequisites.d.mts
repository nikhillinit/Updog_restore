export interface ActualsRestatementProductionPrerequisite {
  readonly predicate: string;
  readonly status: string;
  readonly verifier: string | null;
  readonly reasonCode: string;
}

export const ACTUALS_RESTATEMENT_PRODUCTION_PREREQUISITES: readonly ActualsRestatementProductionPrerequisite[];

export class ActualsRestatementPrerequisiteError extends Error {
  readonly code: 'PRODUCTION_PREREQUISITES_UNAVAILABLE';
  readonly prerequisites: readonly ActualsRestatementProductionPrerequisite[];
}

export function assertActualsRestatementProductionPrerequisites(): never;
