/**
 * API Versioning Middleware
 * Handles version routing, deprecation warnings, and sunset headers
 */
import { Request, Response, NextFunction } from 'express';
import { features } from '../../shared/config/features';

// API version configuration
export const API_VERSIONS = {
  v1: {
    deprecated: true,
    deprecationDate: '2025-06-01',
    sunsetDate: '2025-12-01',
    path: '/api/v1',
  },
  v2: {
    current: true,
    path: '/api/v2',
    releaseDate: '2025-01-01',
  },
  v3: {
    beta: true,
    path: '/api/v3',
    releaseDate: '2025-08-01',
  },
} as const;

// Default version
export const DEFAULT_VERSION = 'v2';

// Extended request with API version
export interface VersionedRequest extends Request {
  apiVersion: string;
  versionConfig: typeof API_VERSIONS[keyof typeof API_VERSIONS];
}

/**
 * Extract API version from request
 */
function extractVersion(req: Request): string {
  // 1. Check URL path
  const pathMatch = req.path.match(/^\/api\/(v\d+)/);
  if (pathMatch) {
    return pathMatch[1];
  }
  
  // 2. Check API-Version header
  const headerVersion = req.headers['api-version'] || req.headers['x-api-version'];
  if (headerVersion && typeof headerVersion === 'string') {
    return headerVersion.toLowerCase();
  }
  
  // 3. Check Accept header for version
  const accept = req.headers.accept;
  if (accept && typeof accept === 'string') {
    const versionMatch = accept.match(/application\/vnd\.api\+(v\d+)/);
    if (versionMatch) {
      return versionMatch[1];
    }
  }
  
  // 4. Check query parameter
  const queryVersion = req.query.api_version || req.query.v;
  if (queryVersion && typeof queryVersion === 'string') {
    return `v${queryVersion.replace('v', '')}`;
  }
  
  // 5. Default version
  return DEFAULT_VERSION;
}

/**
 * API Versioning Middleware
 */
export function apiVersioning() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Skip if versioning is disabled
    if (!features.API_VERSIONING) {
      return next();
    }
    
    // Extract version
    const version = extractVersion(req);
    const versionConfig = API_VERSIONS[version as keyof typeof API_VERSIONS];
    
    // Validate version
    if (!versionConfig) {
      return res.status(400).json({
        error: 'Invalid API version',
        message: `Version ${version} is not supported`,
        supported: Object.keys(API_VERSIONS),
      });
    }
    
    // Attach version to request
    (req as VersionedRequest).apiVersion = version;
    (req as VersionedRequest).versionConfig = versionConfig;
    
    // Set version response header
    res.setHeader('API-Version', version);
    
    // Handle deprecated versions
    if ('deprecated' in versionConfig && versionConfig.deprecated) {
      if (features.DEPRECATION_WARNINGS) {
        // Set deprecation headers
        res.setHeader('Deprecation', 'true');
        res.setHeader('Deprecation-Date', versionConfig.deprecationDate);
        res.setHeader('Sunset', versionConfig.sunsetDate);
        res.setHeader('Link', `</api/v2>; rel="successor-version"`);
        
        // Add deprecation warning to response
        res.setHeader('Warning', `299 - "API version ${version} is deprecated and will be removed on ${versionConfig.sunsetDate}"`);
      }
      
      // Log deprecation usage
      console.warn(`[API] Deprecated version ${version} used`, {
        path: req.path,
        method: req.method,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      });
    }
    
    // Handle beta versions
    if ('beta' in versionConfig && versionConfig.beta) {
      res.setHeader('X-Beta', 'true');
      res.setHeader('Warning', `199 - "API version ${version} is in beta and may change"`);
    }
    
    next();
  };
}

/**
 * Version-specific route handler
 */
export function versionRoute(
  versions: Partial<Record<string, (req: Request, res: Response, next: NextFunction) => void>>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    const version = (req as VersionedRequest).apiVersion || DEFAULT_VERSION;
    const handler = versions[version] || versions.default;
    
    if (!handler) {
      return res.status(501).json({
        error: 'Not Implemented',
        message: `This endpoint is not available in API version ${version}`,
        availableVersions: Object.keys(versions),
      });
    }
    
    handler(req, res, next);
  };
}

/**
 * Check if request is using deprecated API
 */
export function isDeprecatedVersion(req: Request): boolean {
  const version = (req as VersionedRequest).apiVersion;
  const config = API_VERSIONS[version as keyof typeof API_VERSIONS];
  return config && 'deprecated' in config && config.deprecated === true;
}

/**
 * Check if request is using beta API
 */
export function isBetaVersion(req: Request): boolean {
  const version = (req as VersionedRequest).apiVersion;
  const config = API_VERSIONS[version as keyof typeof API_VERSIONS];
  return config && 'beta' in config && config.beta === true;
}

/**
 * Get version config for request
 */
export function getVersionConfig(req: Request) {
  return (req as VersionedRequest).versionConfig;
}

/**
 * Middleware to block sunset versions
 */
export function blockSunsetVersions() {
  return (req: Request, res: Response, next: NextFunction) => {
    const config = getVersionConfig(req);
    
    if (config && 'sunsetDate' in config) {
      const sunsetDate = new Date(config.sunsetDate);
      const now = new Date();
      
      if (now > sunsetDate) {
        return res.status(410).json({
          error: 'Gone',
          message: `API version ${(req as VersionedRequest).apiVersion} has been sunset as of ${config.sunsetDate}`,
          successor: '/api/v2',
        });
      }
    }
    
    next();
  };
}

/**
 * Version compatibility checker
 */
export function requireVersion(minVersion: string, maxVersion?: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const version = (req as VersionedRequest).apiVersion;
    const versionNum = parseInt(version.replace('v', ''));
    const minNum = parseInt(minVersion.replace('v', ''));
    const maxNum = maxVersion ? parseInt(maxVersion.replace('v', '')) : Infinity;
    
    if (versionNum < minNum || versionNum > maxNum) {
      return res.status(400).json({
        error: 'Version Not Supported',
        message: `This endpoint requires API version ${minVersion}${maxVersion ? `-${maxVersion}` : '+'}`,
        currentVersion: version,
      });
    }
    
    next();
  };
}