import type { PropsWithChildren } from "react";
import React from "react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

type WouterHarness = {
  Wrapper: React.FC<PropsWithChildren>;
  location: ReturnType<typeof memoryLocation>;
  goto: (path: string) => void;
};

/**
 * Creates a memory-backed router wrapper for RTL.
 *
 * Usage:
 *   const { Wrapper, location, goto } = createWouterWrapper('/fund-setup?step=3');
 *   render(<FundSetup />, { wrapper: Wrapper });
 *   // later
 *   act(() => goto('/fund-setup?step=4'));
 */
export function createWouterWrapper(
  initial = "/fund-setup?step=2"
): WouterHarness {
  const location = memoryLocation({ path: initial });
  
  const Wrapper: React.FC<PropsWithChildren> = ({ children }) => (
    <Router hook={location.hook}>{children}</Router>
  );
  
  // wouter exposes either navigate() or set() depending on version
  const goto = (path: string) => {
    const anyLoc = location as any;
    if (typeof anyLoc.navigate === 'function') return anyLoc.navigate(path);
    if (typeof anyLoc.set === 'function') return anyLoc.set(path);
    // Fallback to hook API
    const [, setLocation] = location.hook();
    setLocation(path);
  };
  
  return { Wrapper, location, goto };
}

// Convenience sugar mirroring original API if you prefer direct JSX:
export function withWouter(
  ui: React.ReactElement,
  initial = "/fund-setup?step=2"
) {
  const { Wrapper, location, goto } = createWouterWrapper(initial);
  return { ui: <Wrapper>{ui}</Wrapper>, location, goto };
}