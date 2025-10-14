/**
 * Shims for client module imports that appear in server-side code
 * Prevents TS6307 errors when server tsconfig sees client aliases
 *
 * Note: These provide ambient type declarations for client modules that are
 * imported (type-only) in server code but excluded from tsconfig.server.json
 */

// Wildcard shims for machines and adapters
declare module '@/machines/*' {
  const x: any;
  export = x;
}

declare module '@/adapters/*' {
  const x: any;
  export = x;
}

// Specific shims for commonly imported types
declare module '@/machines/modeling-wizard.machine' {
  export interface ModelingWizardContext {
    steps: {
      generalInfo?: any;
      sectorProfiles?: any;
      capitalAllocation?: any;
      [key: string]: any;
    };
    [key: string]: any;
  }
}

declare module '@/adapters/reserves-adapter' {
  export function adaptFundToReservesInput(fund: any): any;
  export function adaptReservesConfig(config: any): any;
  export function adaptReservesResult(result: any, companiesMap: any): any;
}
