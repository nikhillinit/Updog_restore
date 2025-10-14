/**
 * Ambient declarations for untyped third-party modules
 * Used to avoid TS7016 errors during strict type checking
 */

declare module 'sanitize-html' {
  const sanitizeHtml: any;
  export = sanitizeHtml;
}

declare module 'swagger-jsdoc' {
  const swaggerJsdoc: any;
  export = swaggerJsdoc;
}

declare module 'node-fetch' {
  const fetch: any;
  export default fetch;
}
