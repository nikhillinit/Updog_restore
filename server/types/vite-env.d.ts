/**
 * Ambient typings for `import.meta.env` to prevent type errors when server
 * type-checks files that were authored with Vite client typings.
 * This is types-only and has no runtime effect.
 *
 * Week 3 (ESM alignment) can replace this with proper environment typings or
 * further isolate client-only code from server checks.
 */
interface ImportMetaEnv {
  readonly [key: string]: string | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// This file is included via tsconfig.server.json and not via client tsconfig.
// Provides minimal typing to allow files in client/src/core to compile when
// checked as part of server scope (due to server importing business logic).
