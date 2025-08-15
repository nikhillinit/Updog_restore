declare module 'compression' {
  import { RequestHandler } from 'express';
  
  interface CompressionOptions {
    threshold?: number;
    level?: number;
    memLevel?: number;
    strategy?: number;
    filter?: (req: any, res: any) => boolean;
    chunkSize?: number;
    windowBits?: number;
    [key: string]: any;
  }
  
  function compression(options?: CompressionOptions): RequestHandler;
  
  export = compression;
}