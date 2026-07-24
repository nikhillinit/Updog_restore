/**
 * Dependency-free import V2 version token.
 *
 * Keep this leaf module free of hashing and Node-only imports so browser
 * request builders can use the wire value without pulling server utilities
 * into the client bundle.
 */
export const IMPORT_V2_CONTRACT_VERSION = 'import-v2' as const;
