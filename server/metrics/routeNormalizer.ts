
// Prevent metric cardinality explosion
const CARDINALITY_LIMIT = 1000;
const knownRoutes = new Set<string>();
const routePatterns = [
  { pattern: /\/\d+/g, replacement: '/:id' },              // Numeric IDs
  { pattern: /\/[a-f0-9-]{36}/gi, replacement: '/:uuid' },  // UUIDs
  { pattern: /\/[a-zA-Z0-9]{24}/g, replacement: '/:oid' },  // ObjectIds
  { pattern: /\?.*$/, replacement: '' },                    // Query strings
];

export function normalizeRoute(path: string): string {
  // Apply normalization patterns
  let normalized = path;
  for (const { pattern, replacement } of routePatterns) {
    normalized = normalized.replace(pattern, replacement);
  }
  
  // Cardinality protection
  if (knownRoutes.size >= CARDINALITY_LIMIT) {
    if (!knownRoutes.has(normalized)) {
      // Check if it's an API route or static file
      if (normalized.startsWith('/api/')) {
        return '/api/other';  // Bucket overflow API routes
      }
      return '/static/other';   // Bucket static files
    }
  } else {
    knownRoutes.add(normalized);
  }
  
  return normalized;
}

// Periodic cleanup of known routes (every hour)
setInterval(() => {
  if (knownRoutes.size > CARDINALITY_LIMIT * 0.9) {
    // Keep only the most recent 80% of routes
    const toKeep = Math.floor(CARDINALITY_LIMIT * 0.8);
    const routes = Array.from(knownRoutes);
    knownRoutes.clear();
    routes.slice(-toKeep).forEach(r => knownRoutes.add(r));
    console.log(`Cleaned route cache: kept ${knownRoutes.size} routes`);
  }
}, 3600000);
