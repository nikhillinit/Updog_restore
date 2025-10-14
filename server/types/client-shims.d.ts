/**
 * Shims for client module imports that appear in server-side code
 * Prevents TS6307 errors when server tsconfig sees client aliases
 */

declare module '@/machines/*' {
  const x: any;
  export = x;
}

declare module '@/adapters/*' {
  const x: any;
  export = x;
}
