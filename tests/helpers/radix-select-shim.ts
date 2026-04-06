/**
 * Idempotent shim for Radix Select's pointer-event APIs that jsdom does not implement.
 * Safe to call multiple times. Reuse from any test file that renders a Radix Select.
 */
export function installRadixSelectShim(): void {
  if (typeof Element === 'undefined') return;
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => undefined;
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => undefined;
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => undefined;
  }
}
