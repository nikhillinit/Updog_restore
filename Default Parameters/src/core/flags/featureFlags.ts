
function toBool(v: unknown): boolean { return String(v).toLowerCase() === 'true'; }
export const FLAGS = {
  NEW_IA: toBool(import.meta.env.VITE_NEW_IA),
  ENABLE_SELECTOR_KPIS: toBool(import.meta.env.VITE_ENABLE_SELECTOR_KPIS),
  ENABLE_MODELING_WIZARD: toBool(import.meta.env.VITE_ENABLE_MODELING_WIZARD),
  ENABLE_OPERATIONS_HUB: toBool(import.meta.env.VITE_ENABLE_OPERATIONS_HUB),
  ENABLE_LP_REPORTING: toBool(import.meta.env.VITE_ENABLE_LP_REPORTING),
} as const;
export type Flags = typeof FLAGS;
