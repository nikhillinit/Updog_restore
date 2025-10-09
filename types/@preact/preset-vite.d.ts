import type { Plugin } from 'vite';

declare function preactPlugin(options?: Record<string, unknown>): Plugin;
export default preactPlugin;
