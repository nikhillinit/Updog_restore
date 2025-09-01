/**
 * Ambient module declarations for optional fastify integration
 * Allows TypeScript compilation when packages are not installed
 */

declare module 'fastify-plugin' {
  import { FastifyInstance } from 'fastify';
  
  function fastifyPlugin<T = any>(
    fn: (fastify: FastifyInstance, options: T) => Promise<void> | void,
    options?: { name?: string; fastify?: string }
  ): (fastify: FastifyInstance, options: T) => Promise<void>;
  
  export = fastifyPlugin;
}

declare module 'fastify' {
  export interface FastifyInstance {
    register(plugin: any, options?: any): FastifyInstance;
    listen(options: { port: number; host?: string }): Promise<void>;
    close(): Promise<void>;
    [key: string]: any;
  }
  
  export interface FastifyRequest {
    [key: string]: any;
  }
  
  export interface FastifyReply {
    [key: string]: any;
  }
  
  function fastify(options?: any): FastifyInstance;
  export = fastify;
}