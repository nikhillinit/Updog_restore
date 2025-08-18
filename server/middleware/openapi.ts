/**
 * OpenAPI Documentation Middleware
 * Serves OpenAPI specs and Swagger UI
 */
import { Request, Response, NextFunction, Router } from 'express';
import * as path from 'path';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { features } from '../../shared/config/features';
import { VersionedRequest } from './api-version';

// OpenAPI spec paths
const SPEC_DIR = path.join(__dirname, '..', 'docs');
const SPECS = {
  v1: path.join(SPEC_DIR, 'openapi-v1.yaml'),
  v2: path.join(SPEC_DIR, 'openapi-v2.yaml'),
};

/**
 * Load OpenAPI spec from file
 */
function loadSpec(version: string): any {
  const specPath = SPECS[version as keyof typeof SPECS];
  
  if (!specPath || !fs.existsSync(specPath)) {
    return null;
  }
  
  const content = fs.readFileSync(specPath, 'utf8');
  return yaml.load(content);
}

/**
 * Create OpenAPI documentation router
 */
export function createOpenAPIRouter(): Router {
  const router = Router();
  
  // Skip if OpenAPI docs are disabled
  if (!features.OPENAPI_DOCS) {
    router.use((req, res) => {
      res.status(404).json({
        error: 'Not Found',
        message: 'OpenAPI documentation is disabled',
      });
    });
    return router;
  }
  
  // Serve OpenAPI spec as JSON
  router.get('/openapi.json', (req: Request, res: Response) => {
    const version = (req as VersionedRequest).apiVersion || 'v2';
    const spec = loadSpec(version);
    
    if (!spec) {
      return res.status(404).json({
        error: 'Not Found',
        message: `OpenAPI spec not found for version ${version}`,
      });
    }
    
    res.json(spec);
  });
  
  // Serve OpenAPI spec as YAML
  router.get('/openapi.yaml', (req: Request, res: Response) => {
    const version = (req as VersionedRequest).apiVersion || 'v2';
    const specPath = SPECS[version as keyof typeof SPECS];
    
    if (!specPath || !fs.existsSync(specPath)) {
      return res.status(404).send(`OpenAPI spec not found for version ${version}`);
    }
    
    res.type('text/yaml').sendFile(specPath);
  });
  
  // Version-specific endpoints
  router.get('/v1/openapi.json', (req: Request, res: Response) => {
    const spec = loadSpec('v1');
    if (!spec) {
      return res.status(404).json({ error: 'Not Found' });
    }
    res.json(spec);
  });
  
  router.get('/v2/openapi.json', (req: Request, res: Response) => {
    const spec = loadSpec('v2');
    if (!spec) {
      return res.status(404).json({ error: 'Not Found' });
    }
    res.json(spec);
  });
  
  // Swagger UI HTML
  router.get('/', (req: Request, res: Response) => {
    const version = (req as VersionedRequest).apiVersion || 'v2';
    const html = generateSwaggerUI(version);
    res.type('text/html').send(html);
  });
  
  // Version-specific Swagger UI
  router.get('/v1', (req: Request, res: Response) => {
    const html = generateSwaggerUI('v1');
    res.type('text/html').send(html);
  });
  
  router.get('/v2', (req: Request, res: Response) => {
    const html = generateSwaggerUI('v2');
    res.type('text/html').send(html);
  });
  
  return router;
}

/**
 * Generate Swagger UI HTML
 */
function generateSwaggerUI(version: string): string {
  const specUrl = `/docs/${version}/openapi.json`;
  
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Updog API Documentation - ${version.toUpperCase()}</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.9.0/swagger-ui.css">
    <style>
      body {
        margin: 0;
        padding: 0;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      }
      .topbar {
        background-color: #1b1b1b;
        padding: 10px 20px;
        color: white;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .topbar h1 {
        margin: 0;
        font-size: 24px;
      }
      .version-selector {
        display: flex;
        gap: 10px;
        align-items: center;
      }
      .version-link {
        color: white;
        text-decoration: none;
        padding: 5px 10px;
        border-radius: 4px;
        transition: background-color 0.2s;
      }
      .version-link:hover {
        background-color: #333;
      }
      .version-link.active {
        background-color: #61affe;
      }
      .deprecation-banner {
        background-color: #ff6b6b;
        color: white;
        padding: 10px 20px;
        text-align: center;
        font-weight: bold;
      }
      .deprecation-banner a {
        color: white;
        text-decoration: underline;
      }
      #swagger-ui {
        padding: 20px;
      }
      .swagger-ui .topbar {
        display: none;
      }
    </style>
</head>
<body>
    <div class="topbar">
        <h1>Updog API Documentation</h1>
        <div class="version-selector">
            <span>Version:</span>
            <a href="/docs/v1" class="version-link ${version === 'v1' ? 'active' : ''}">v1 (Deprecated)</a>
            <a href="/docs/v2" class="version-link ${version === 'v2' ? 'active' : ''}">v2 (Current)</a>
        </div>
    </div>
    
    ${version === 'v1' ? `
    <div class="deprecation-banner">
        ⚠️ API v1 is deprecated and will be sunset on 2025-12-01. 
        Please <a href="/docs/v2">migrate to v2</a>.
    </div>
    ` : ''}
    
    <div id="swagger-ui"></div>
    
    <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.9.0/swagger-ui-bundle.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.9.0/swagger-ui-standalone-preset.js"></script>
    <script>
      window.onload = function() {
        const ui = SwaggerUIBundle({
          url: "${specUrl}",
          dom_id: '#swagger-ui',
          deepLinking: true,
          presets: [
            SwaggerUIBundle.presets.apis,
            SwaggerUIStandalonePreset
          ],
          plugins: [
            SwaggerUIBundle.plugins.DownloadUrl
          ],
          layout: "StandaloneLayout",
          validatorUrl: null,
          tryItOutEnabled: true,
          supportedSubmitMethods: ['get', 'post', 'put', 'delete', 'patch'],
          onComplete: function() {
            console.log("Swagger UI loaded for API ${version}");
          }
        });
        
        window.ui = ui;
      };
    </script>
</body>
</html>
  `;
}

/**
 * Middleware to redirect root docs to current version
 */
export function redirectToCurrentDocs() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.path === '/docs' || req.path === '/docs/') {
      return res.redirect('/docs/v2');
    }
    next();
  };
}