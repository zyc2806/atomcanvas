// One-time onboarding-hint flags persisted in localStorage. Every access is
// wrapped so a disabled or full localStorage (private mode, quota) never throws:
// on any failure the hint simply shows again, which is harmless. The functions
// accept an optional Storage so they can be unit-tested without the real one.
const VIEWPORT_HINT_KEY = 'atomcanvas:onboarding:viewportHint';
const LOAD_TOAST_KEY = 'atomcanvas:onboarding:loadToast';

type FlagStorage = Pick<Storage, 'getItem' | 'setItem'>;

function resolveStorage(s?: FlagStorage): FlagStorage | null {
  if (s) return s;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function read(key: string, s?: FlagStorage): string | null {
  const store = resolveStorage(s);
  if (!store) return null;
  try {
    return store.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string, s?: FlagStorage): void {
  const store = resolveStorage(s);
  if (!store) return;
  try {
    store.setItem(key, value);
  } catch {
    /* storage unavailable/full — onboarding hints are best-effort */
  }
}

/** The dismissible "click an atom to select" viewport caption shows until dismissed. */
export function shouldShowViewportHint(s?: FlagStorage): boolean {
  return read(VIEWPORT_HINT_KEY, s) !== 'dismissed';
}

export function dismissViewportHint(s?: FlagStorage): void {
  write(VIEWPORT_HINT_KEY, 'dismissed', s);
}

/** The first-successful-load nudge toast fires exactly once, ever. */
export function shouldFireLoadToast(s?: FlagStorage): boolean {
  return read(LOAD_TOAST_KEY, s) !== 'fired';
}

export function markLoadToastFired(s?: FlagStorage): void {
  write(LOAD_TOAST_KEY, 'fired', s);
}
