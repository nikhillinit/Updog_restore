import { createHash } from 'node:crypto';

export class ETagLogger {
  static from(buf: Buffer | string): string {
    return createHash('sha1').update(buf).digest('hex');
  }
}
