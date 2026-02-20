/**
 * @vitest-environment jsdom
 *
 * Diagnostic smoke test to prove jsdom environment initialization.
 * This test bypasses project-level config to test jsdom directly.
 *
 * If this test fails, jsdom is not being initialized by Vitest.
 * If this test passes but other React tests fail, the problem is in setup files or RTL usage.
 */

import { describe, it, expect } from 'vitest';

describe('jsdom smoke test', () => {
  it('has a window object', () => {
    console.warn('[jsdom-smoke] typeof window:', typeof window);

    expect(typeof window).toBe('object');
    expect(window).not.toBeUndefined();
  });

  it('has a document object', () => {
    console.warn('[jsdom-smoke] typeof document:', typeof document);

    expect(typeof document).toBe('object');
    expect(document).not.toBeUndefined();
  });

  it('has a document.body element', () => {
    console.warn('[jsdom-smoke] body exists?', !!document?.body);

    console.warn('[jsdom-smoke] body tagName:', document?.body?.tagName);

    expect(document.body).not.toBeNull();
    expect(document.body).toBeInstanceOf(HTMLElement);
    expect(document.body.tagName).toBe('BODY');
  });

  it('can create and append elements', () => {
    const div = document.createElement('div');
    div.textContent = 'jsdom smoke test';

    // This is the operation that was supposedly failing with appendChild error
    document.body.appendChild(div);

    expect(document.body.contains(div)).toBe(true);
    expect(div.textContent).toBe('jsdom smoke test');

    // Cleanup
    document.body.removeChild(div);
  });

  it('has basic DOM APIs', () => {
    expect(typeof document.querySelector).toBe('function');
    expect(typeof document.getElementById).toBe('function');
    expect(typeof document.createElement).toBe('function');
    expect(typeof Element).toBe('function');
    expect(typeof HTMLElement).toBe('function');
  });
});
