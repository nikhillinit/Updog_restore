// Hedged requests: launch a backup after a delay; first to resolve wins.
export async function hedged<T>(primary: () => Promise<T>, backup: () => Promise<T>, hedgeDelayMs = 50): Promise<T> {
  let settled = false;
  return new Promise<T>((resolve: any, reject: any) => {
    const to = setTimeout(() => {
      if (settled) return;
      backup().then((v: any) => { settled = true; resolve(v); }).catch((e: any) => { if (!settled) reject(e); });
    }, hedgeDelayMs);
    primary().then((v: any) => { settled = true; clearTimeout(to); resolve(v); }).catch((e: any) => { if (!settled) reject(e); });
  });
}
