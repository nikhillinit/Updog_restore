// Run before other setup files to ensure constructors are available
declare global {
  // Declare for TS
  var HTMLIFrameElement: any;
}

// Force HTMLIFrameElement to exist as a constructor
if (typeof HTMLIFrameElement === 'undefined') {
  class HTMLIFrameElementPolyfill {}
  (global as any).HTMLIFrameElement = HTMLIFrameElementPolyfill;
  (globalThis as any).HTMLIFrameElement = HTMLIFrameElementPolyfill;
  if (typeof window !== 'undefined') {
    (window as any).HTMLIFrameElement = HTMLIFrameElementPolyfill;
  }
}

// Also ensure getSelection exists and is functional
if (typeof window !== 'undefined' && typeof window.getSelection !== 'function') {
  (window as any).getSelection = () => ({
    removeAllRanges: () => {},
    empty: () => {},
    rangeCount: 0,
    getRangeAt: () => null,
    addRange: () => {},
    removeRange: () => {},
    collapse: () => {},
    collapseToStart: () => {},
    collapseToEnd: () => {},
    toString: () => '',
  });
}

if (typeof document !== 'undefined' && typeof document.getSelection !== 'function') {
  (document as any).getSelection = window.getSelection;
}

export {};