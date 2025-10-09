import type { Plugin } from 'vite';

declare function virtualPlugin(modules: Record<string, string>): Plugin;
export default virtualPlugin;
