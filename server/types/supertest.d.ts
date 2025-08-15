declare module 'supertest' {
  import { Response } from 'superagent';
  
  interface SuperTest<T> {
    (url: string): Test;
    get(url: string): Test;
    post(url: string): Test;
    put(url: string): Test;
    delete(url: string): Test;
    patch(url: string): Test;
    head(url: string): Test;
    options(url: string): Test;
  }
  
  interface Test extends Promise<Response> {
    accept(type: string): this;
    attach(field: string, file: string | Buffer, filename?: string): this;
    auth(user: string, pass: string): this;
    buffer(val?: boolean): this;
    ca(cert: string | string[]): this;
    cert(cert: string | string[]): this;
    disableTLSCerts(): this;
    end(callback?: (err: Error, res: Response) => void): this;
    expect(status: number, callback?: (err: Error, res: Response) => void): this;
    expect(status: number, body: any, callback?: (err: Error, res: Response) => void): this;
    expect(checker: (res: Response) => any, callback?: (err: Error, res: Response) => void): this;
    field(name: string, val: string): this;
    get(url: string): this;
    ok(callback?: (res: Response) => void): this;
    parse(fn: (res: Response, callback: (err: Error | null, body: any) => void) => void): this;
    part(): this;
    query(val: object | string): this;
    redirects(n: number): this;
    responseType(type: string): this;
    retry(count?: number, callback?: (err: Error, res: Response) => void): this;
    send(data: string | object): this;
    set(field: string, val: string): this;
    set(field: object): this;
    timeout(ms: number | { deadline?: number; response?: number }): this;
    type(val: string): this;
    unset(field: string): this;
    use(fn: (req: any) => any): this;
    withCredentials(): this;
    write(data: string | Buffer): this;
  }
  
  function request(app: any): SuperTest<any>;
  
  export = request;
}