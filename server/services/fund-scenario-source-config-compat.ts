function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

export function normalizeLegacyScenarioSourceConfig(value: unknown): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return value;
  }

  const config = value as Record<string, unknown>;
  if (!hasOwn(config, 'name') || hasOwn(config, 'fundName')) {
    return value;
  }

  const { name, ...canonicalConfig } = config;
  return { ...canonicalConfig, fundName: name };
}
