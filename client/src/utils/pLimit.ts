/* eslint-disable @typescript-eslint/no-explicit-any */
 
 
 
 
/**
 * pLimit – minimal concurrency limiter
 * ------------------------------------
 * Usage:
 *   const limit = pLimit(4);                          // max 4 in flight
 *   await Promise.all(items.map(item => limit(() => doAsync(item))));
 */
export type AsyncTask<T> = () => Promise<T>;

export default function pLimit(concurrency: number) {
  if (concurrency < 1) throw new Error('Concurrency must be ≥ 1');
  let active = 0;
  const queue: (() => void)[] = [];

  const next = () => {
    active--;
    if (queue.length) queue.shift()!();    // run next task
  };

  const run = <T>(task: AsyncTask<T>): Promise<T> =>
    new Promise((res: any, rej: any) => {
      const execute = () => {
        active++;
        task().then(res, rej).finally(next);
      };
      if (active < concurrency) {
        execute();
      } else {
        queue.push(execute);
      }
    });

  return run;
}

