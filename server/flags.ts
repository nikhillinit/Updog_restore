import { getConfig } from "./config";

export type Flags = { 
  DEMO_MODE: boolean; 
  ENABLE_EXPORT: boolean; 
  ENABLE_FAULTS: boolean;
  REQUIRE_AUTH: boolean;
};

export function getFlags(): Flags {
  const cfg = getConfig();
  return { 
    DEMO_MODE: cfg.DEMO_MODE, 
    ENABLE_EXPORT: true, 
    ENABLE_FAULTS: cfg.ENGINE_FAULT_RATE > 0 && !cfg.DEMO_MODE,
    REQUIRE_AUTH: cfg.REQUIRE_AUTH
  };
}