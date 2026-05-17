import { isFlagEnabled } from '@shared/flags/getFlag';

export function omitEconomicsAssumptionsWhenDisabled<T extends object>(config: T): T {
  if (isFlagEnabled('enable_gp_economics_engine')) {
    return config;
  }
  if (!('economicsAssumptions' in config)) {
    return config;
  }

  const configWithEconomics = config as T & { economicsAssumptions?: unknown };
  const { economicsAssumptions, ...rest } = configWithEconomics;
  void economicsAssumptions;
  return rest as T;
}
