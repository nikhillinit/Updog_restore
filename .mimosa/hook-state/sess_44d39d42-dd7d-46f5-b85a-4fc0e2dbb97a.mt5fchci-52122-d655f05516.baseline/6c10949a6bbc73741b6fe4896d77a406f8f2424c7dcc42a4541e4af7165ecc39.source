import { useCallback, useEffect, useMemo, useState } from "react";

export function useQueryParam(
  key: string,
  defaultValue: string
): [string, (next: string) => void] {
  const read = useCallback(() => {
    const sp = new URLSearchParams(window.location.search);
    return sp.get(key) ?? defaultValue;
  }, [key, defaultValue]);

  const [value, setValue] = useState(read);

  useEffect(() => {
    const onPop = () => setValue(read());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [read]);

  const set = useCallback(
    (next: string) => {
      const url = new URL(window.location.href);
      url.searchParams.set(key, next);
      window.history.pushState({}, "", url.toString());
      setValue(next);
    },
    [key]
  );

  return useMemo(() => [value, set] as const, [value, set]);
}
