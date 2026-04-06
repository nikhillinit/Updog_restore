/**
 * useElapsedSeconds -- drives the "running..." clock shown while a sensitivity
 * analysis mutation is in-flight. Extracted verbatim from OneWayPanel so the
 * tornado and two-way panels can share the same behavior without duplication.
 */

import { useEffect, useRef, useState } from 'react';

export function useElapsedSeconds(isActive: boolean): number {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    if (isActive) {
      startRef.current = Date.now();
      setElapsed(0);
      const timer = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
      }, 1000);
      return () => clearInterval(timer);
    }
    setElapsed(0);
    return undefined;
  }, [isActive]);

  return elapsed;
}
