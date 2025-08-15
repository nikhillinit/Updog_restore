declare module 'express' {
  import { Server } from 'http';
  
  export interface Request {
    id?: string;
    user?: any;
    params: Record<string, string>;
    query: Record<string, string | string[]>;
    body: any;
    headers: Record<string, string | string[] | undefined>;
    cookies: Record<string, string>;
    ip: string;
    path: string;
    method: string;
    originalUrl: string;
    [key: string]: any;
  }
  
  export interface Response {
    status(code: number): Response;
    send(body: any): Response;
    json(body: any): Response;
    end(): Response;
    cookie(name: string, value: string, options?: any): Response;
    clearCookie(name: string, options?: any): Response;
    redirect(url: string): Response;
    redirect(status: number, url: string): Response;
    set(field: string, value: string): Response;
    set(headers: Record<string, string>): Response;
    get(field: string): string;
    [key: string]: any;
  }
  
  export interface NextFunction {
    (err?: any): void;
  }
  
  export interface Express {
    use(...handlers: any[]): Express;
    get(path: string, ...handlers: any[]): Express;
    post(path: string, ...handlers: any[]): Express;
    put(path: string, ...handlers: any[]): Express;
    delete(path: string, ...handlers: any[]): Express;
    patch(path: string, ...handlers: any[]): Express;
    options(path: string, ...handlers: any[]): Express;
    head(path: string, ...handlers: any[]): Express;
    all(path: string, ...handlers: any[]): Express;
    listen(port: number, callback?: () => void): Server;
    listen(port: number, hostname: string, callback?: () => void): Server;
    set(setting: string, value: any): Express;
    [key: string]: any;
  }
  
  export interface Router {
    use(...handlers: any[]): Router;
    get(path: string, ...handlers: any[]): Router;
    post(path: string, ...handlers: any[]): Router;
    put(path: string, ...handlers: any[]): Router;
    delete(path: string, ...handlers: any[]): Router;
    patch(path: string, ...handlers: any[]): Router;
    options(path: string, ...handlers: any[]): Router;
    head(path: string, ...handlers: any[]): Router;
    all(path: string, ...handlers: any[]): Router;
    [key: string]: any;
  }
  
  export function Router(options?: any): Router;
  
  function createApplication(): Express;

namespace createApplication {
  export function json(options?: any): any;
  export function urlencoded(options?: any): any;
  export function static(path: string, options?: any): any;
}

export default createApplication;
}