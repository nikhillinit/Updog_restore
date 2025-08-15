import { IncomingMessage, ServerResponse } from 'http';

// Use a namespace to avoid conflicts with global types
declare namespace ExpressCustom {
  interface Request extends IncomingMessage {
    path: string;
    route?: { path: string };
    params: Record<string, string>;
    query: Record<string, string | string[]>;
    body: any;
    ip: string;
    get(name: string): string | undefined;
    [key: string]: any;
  }

  interface Response extends ServerResponse {
    json: {
      (body: any): Response;
      (): Response;
    };
    send(body: any): Response;
    status(code: number): Response;
    set(field: string, value: string): Response;
    set(fields: Record<string, string>): Response;
    get(field: string): string | undefined;
    on(event: string, listener: (...args: any[]) => void): this;
    sendFile(path: string): void;
    [key: string]: any;
  }

  interface NextFunction {
    (err?: any): void;
  }
}

// Export the types for use in other files
export type Request = ExpressCustom.Request;
export type Response = ExpressCustom.Response;
export type NextFunction = ExpressCustom.NextFunction;