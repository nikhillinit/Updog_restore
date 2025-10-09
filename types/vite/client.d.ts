declare interface ImportMetaEnv extends Readonly<Record<string, string | boolean | undefined>> {
  readonly BASE_URL: string;
  readonly MODE: string;
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly SSR: boolean;
}

declare interface ImportMeta {
  readonly env: ImportMetaEnv;
  glob<T = Record<string, unknown>>(
    pattern: string,
    options?: { eager?: boolean; import?: string | string[]; as?: string }
  ): Record<string, () => Promise<T>>;
  globEager<T = Record<string, unknown>>(
    pattern: string,
    options?: { import?: string | string[]; as?: string }
  ): Record<string, T>;
}

declare module 'vite/client' {
  export interface ImportMetaEnv extends globalThis.ImportMetaEnv {}
  export interface ImportMeta extends globalThis.ImportMeta {}
}
