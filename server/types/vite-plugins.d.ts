/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
declare module '@vitejs/plugin-react' {
  interface PluginOptions {
    include?: string | RegExp | Array<string | RegExp>;
    exclude?: string | RegExp | Array<string | RegExp>;
    jsxRuntime?: 'classic' | 'automatic';
    jsxImportSource?: string;
    babel?: any;
    [key: string]: any;
  }
  
  function reactPlugin(options?: PluginOptions): any;
  
  export default reactPlugin;
}

declare module 'rollup-plugin-visualizer' {
  interface VisualizerOptions {
    filename?: string;
    title?: string;
    open?: boolean;
    template?: 'sunburst' | 'treemap' | 'network' | 'raw-data';
    gzipSize?: boolean;
    brotliSize?: boolean;
    sourcemap?: boolean;
    [key: string]: any;
  }
  
  export function visualizer(options?: VisualizerOptions): any;
}

declare module 'vite-plugin-virtual' {
  interface VirtualModuleOptions {
    [key: string]: string | (() => string | Promise<string>);
  }
  
  function virtualPlugin(modules: VirtualModuleOptions): any;
  
  export default virtualPlugin;
}
