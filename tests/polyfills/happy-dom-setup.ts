/**
 * Polyfills for happy-dom to ensure React compatibility
 * happy-dom also has incomplete DOM API coverage that needs patching
 */

// Ensure HTMLIFrameElement exists to prevent React's instanceof error
if (typeof globalThis.HTMLIFrameElement === 'undefined') {
  class HTMLIFrameElementPolyfill extends HTMLElement {}
  Object.defineProperty(globalThis, 'HTMLIFrameElement', {
    value: HTMLIFrameElementPolyfill,
    configurable: true,
    writable: true
  });
  
  // Also set on window if it exists
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'HTMLIFrameElement', {
      value: HTMLIFrameElementPolyfill,
      configurable: true,
      writable: true
    });
  }
}

// Ensure selection APIs exist
if (typeof window !== 'undefined') {
  if (typeof window.getSelection !== 'function') {
    window.getSelection = () => ({
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
      anchorNode: null,
      anchorOffset: 0,
      focusNode: null,
      focusOffset: 0,
      isCollapsed: true,
      type: 'None'
    } as any);
  }
  
  if (typeof document !== 'undefined' && typeof document.getSelection !== 'function') {
    document.getSelection = window.getSelection;
  }
}

export {};