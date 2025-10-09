declare namespace Vite {
  interface Plugin {
    name: string;
    enforce?: 'pre' | 'post';
    apply?: 'build' | 'serve' | ((config: UserConfig, env: ConfigEnv) => boolean);
    config?: (config: UserConfig, env: ConfigEnv) => UserConfig | void | Promise<UserConfig | void>;
    configureServer?: (...args: any[]) => void | Promise<void>;
    [key: string]: unknown;
  }

  interface ServerOptions {
    [key: string]: unknown;
  }

  interface BuildOptions {
    [key: string]: unknown;
  }

  interface ResolveOptions {
    [key: string]: unknown;
  }

  interface UserConfig {
    plugins?: Array<Plugin | false | null | undefined>;
    server?: ServerOptions;
    build?: BuildOptions;
    resolve?: ResolveOptions;
    define?: Record<string, unknown>;
    root?: string;
    [key: string]: unknown;
  }

  interface ConfigEnv {
    command: 'build' | 'serve';
    mode: string;
  }
}

export type Plugin = Vite.Plugin;
export type UserConfig = Vite.UserConfig;
export type ConfigEnv = Vite.ConfigEnv;

export function defineConfig(config: Vite.UserConfig | ((env: Vite.ConfigEnv) => Vite.UserConfig)): Vite.UserConfig;
