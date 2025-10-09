import type { Plugin } from 'vite';

declare function viteTsconfigPaths(options?: Record<string, unknown>): Plugin;
export default viteTsconfigPaths;
