import * as dbSchema from '@shared/db-schema';

export type CombinedSchema = Omit<typeof dbSchema, 'DB_SCHEMA_COMPATIBILITY_MAP'>;

const { DB_SCHEMA_COMPATIBILITY_MAP: _compatibilityMap, ...combinedSchemaUntyped } = dbSchema;
void _compatibilityMap;

export const combinedSchema: CombinedSchema = combinedSchemaUntyped;
