declare module 'vite' {
  export type Plugin = unknown;
  export function defineConfig(config: any): any;
  export function createServer(options: any): Promise<any>;
  export function createLogger(): any;
}
