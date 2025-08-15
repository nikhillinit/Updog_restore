declare module 'compression' {
  // Define RequestHandler inline instead of importing from express
  type RequestHandler = (req: any, res: any, next: (err?: any) => void) => void;
  
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