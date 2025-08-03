import { createHash } from 'node:crypto';

export const computeETag = (buf: Buffer | string) => 
  createHash('sha1').update(buf).digest('hex');
