export interface ActualsDraftProductionPrerequisite {
  readonly predicate: string;
  readonly status: string;
  readonly verifier: string | null;
  readonly reasonCode: string;
}

export const ACTUALS_DRAFT_PRODUCTION_PREREQUISITES: readonly ActualsDraftProductionPrerequisite[];

export class ActualsDraftPrerequisiteError extends Error {
  readonly code: 'PRODUCTION_PREREQUISITES_UNAVAILABLE';
  readonly prerequisites: readonly ActualsDraftProductionPrerequisite[];
}

export function assertActualsDraftProductionPrerequisites(): never;
