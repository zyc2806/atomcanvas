import { describe, it, expect } from 'vitest';
import {
  shouldShowViewportHint,
  dismissViewportHint,
  shouldFireLoadToast,
  markLoadToastFired,
} from './onboarding';

// A minimal in-memory Storage stand-in so the flag logic can be tested without
// touching the real localStorage.
function fakeStorage(): Pick<Storage, 'getItem' | 'setItem'> {
  const m = new Map<string, string>();
  return {
    getItem: (k) => (m.has(k) ? m.get(k)! : null),
    setItem: (k, v) => void m.set(k, v),
  };
}

// A storage whose access always throws (private-mode / disabled localStorage).
const throwingStorage: Pick<Storage, 'getItem' | 'setItem'> = {
  getItem: () => {
    throw new Error('denied');
  },
  setItem: () => {
    throw new Error('denied');
  },
};

describe('onboarding flags', () => {
  it('shows the viewport hint by default and hides it after dismiss', () => {
    const s = fakeStorage();
    expect(shouldShowViewportHint(s)).toBe(true);
    dismissViewportHint(s);
    expect(shouldShowViewportHint(s)).toBe(false);
  });

  it('fires the load toast once, then never again', () => {
    const s = fakeStorage();
    expect(shouldFireLoadToast(s)).toBe(true);
    markLoadToastFired(s);
    expect(shouldFireLoadToast(s)).toBe(false);
  });

  it('the two flags are independent', () => {
    const s = fakeStorage();
    dismissViewportHint(s);
    expect(shouldFireLoadToast(s)).toBe(true);
    markLoadToastFired(s);
    expect(shouldShowViewportHint(s)).toBe(false);
  });

  it('never throws and defaults to showing when storage is unavailable', () => {
    expect(() => dismissViewportHint(throwingStorage)).not.toThrow();
    expect(() => markLoadToastFired(throwingStorage)).not.toThrow();
    // A broken storage must not suppress onboarding — default to showing.
    expect(shouldShowViewportHint(throwingStorage)).toBe(true);
    expect(shouldFireLoadToast(throwingStorage)).toBe(true);
  });
});
