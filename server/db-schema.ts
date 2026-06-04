import * as dbSchema from '@shared/db-schema';

export const { DB_SCHEMA_COMPATIBILITY_MAP, ...combinedSchema } = dbSchema;

export type CombinedSchema = typeof combinedSchema;
