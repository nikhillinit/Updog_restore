import type { Plugin } from 'vite';

declare function reactPlugin(options?: Record<string, unknown>): Plugin;
export default reactPlugin;
