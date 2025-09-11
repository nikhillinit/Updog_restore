/**
 * Disables document.activeElement for tests to bypass JSDOM focus management issues
 * This is safe for smoke tests that are checking for render loops, not focus behavior
 */
export function disableActiveElement() {
  const desc = Object.getOwnPropertyDescriptor(Document.prototype, 'activeElement');
  let restored = false;

  Object.defineProperty(Document.prototype, 'activeElement', {
    configurable: true,
    get: () => null,
  });

  return () => {
    if (!restored && desc) {
      Object.defineProperty(Document.prototype, 'activeElement', desc);
      restored = true;
    }
  };
}