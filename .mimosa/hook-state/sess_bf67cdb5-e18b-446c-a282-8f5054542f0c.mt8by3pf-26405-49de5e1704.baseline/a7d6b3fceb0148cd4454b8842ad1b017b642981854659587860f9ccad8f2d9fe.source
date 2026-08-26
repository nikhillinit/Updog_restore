// Hedged requests: launch a backup after a delay; first to resolve wins.
export async function hedged<T>(
  primary: () => Promise<T>,
  backup: () => Promise<T>,
  hedgeDelayMs = 50
): Promise<T> {
  let settled = false;
  return new Promise<T>((resolve, reject) => {
    const to = setTimeout(() => {
      if (settled) return;
      void backup()
        .then((value) => {
          if (settled) {
            return;
          }
          settled = true;
          resolve(value);
        })
        .catch((error: unknown) => {
          if (!settled) {
            reject(error);
          }
        });
    }, hedgeDelayMs);
    void primary()
      .then((value) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(to);
        resolve(value);
      })
      .catch((error: unknown) => {
        if (!settled) {
          clearTimeout(to);
          reject(error);
        }
      });
  });
}
