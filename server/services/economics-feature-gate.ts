export function omitEconomicsAssumptionsWhenDisabled<T extends object>(config: T): T {
  // This flag controls annual economics execution, not persisted capital-source
  // semantics. Dropping any part of a validated assumptions object can silently
  // change fee, expense, GP, timeline, or recycling interpretation.
  return config;
}
