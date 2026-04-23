import { withDemoHeaders } from '../core/demo/http';
export const demoFetch: typeof fetch = (input, init) => fetch(input, withDemoHeaders(init));
