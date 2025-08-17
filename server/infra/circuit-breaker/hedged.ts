// Hedged requests: launch a backup after a delay; first to resolve wins.
export async function hedged<T>(primary: () => Promise<T>, backup: () => Promise<T>, hedgeDelayMs = 50): Promise<T> {
  let settled = false;
  return new Promise<T>((resolve, reject) => {
    const to = setTimeout(() => {
      if (settled) return;
      backup().then((v) => { settled = true; resolve(v); }).catch((e) => { if (!settled) reject(e); });
    }, hedgeDelayMs);
    primary().then((v) => { settled = true; clearTimeout(to); resolve(v); }).catch((e) => { if (!settled) reject(e); });
  });
}
