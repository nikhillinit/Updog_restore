import * as sharedSchema from '@shared/schema';
import * as lpSchema from '@shared/schema-lp-reporting';
import * as lpSprint3Schema from '@shared/schema-lp-sprint3';
import * as approvalSchema from '@shared/schemas/reserve-approvals';

export const combinedSchema = {
  ...sharedSchema,
  ...lpSchema,
  ...lpSprint3Schema,
  ...approvalSchema,
};

export type CombinedSchema = typeof combinedSchema;
