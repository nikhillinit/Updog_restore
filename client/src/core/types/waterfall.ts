// Discriminated union fixes branch-specific type errors for waterfall logic.
export type Waterfall =
  | {
      kind: 'american';
      carryPct: number;
      hurdleRate?: number;
    }
  | {
      kind: 'european';
      carryPct: number;
      hurdleRate?: number;
      catchUpPct?: number;
    };
