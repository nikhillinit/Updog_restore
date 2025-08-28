// Re-export from centralized monitoring module
// The actual initialization happens in @/monitoring/index.ts
import { Sentry } from '@/monitoring';

export function initSentry() {
  // This is now a no-op since initialization happens in monitoring module
  // Kept for backwards compatibility
  console.log('Sentry initialization delegated to monitoring module');
}