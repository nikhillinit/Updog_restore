export async function hedged<T>(
  primary: () => Promise<T>,
  secondary: () => Promise<T>,
  hedgeDelayMs: number
): Promise<T> {
  let timer: any;
  let secondaryStarted = false;
  const p1 = primary();
  const p2 = new Promise<T>((resolve, reject) => {
    timer = setTimeout(() => {
      secondaryStarted = true;
      secondary().then(resolve, reject);
    }, hedgeDelayMs);
  });
  try {
    return await Promise.race([p1, p2]);
  } finally {
    clearTimeout(timer);
    // Best-effort: let the slower request be GC'd; upstream clients should use abortable fetch to cancel.
  }
}
