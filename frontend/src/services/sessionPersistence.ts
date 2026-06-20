import type { StructureState } from '../types/store';
import { useStructureStore } from '../store/useStructureStore';
import {
  buildSceneDocument,
  applySceneDocument,
  parseDocument,
} from './sceneDocument';
import type { SceneDoc } from './sceneDocument';

export const SESSION_KEY = 'atomcanvas.session.v1';
const SAVE_DEBOUNCE_MS = 600;

// Debounce state (module-level, so it persists across calls within a session).
let _debounceTimer: ReturnType<typeof setTimeout> | null = null;

// Hydration guard: true while restoreSession is replaying applySceneDocument so
// that the subscription does not trigger a save during restore.
let hydrating = false;

/**
 * Build a trimmed SceneDoc that contains only the active tab, used as a
 * fallback when the full serialization exceeds the storage quota.
 */
function buildTrimmedDoc(state: StructureState): SceneDoc {
  const full = buildSceneDocument(state);
  const active = full.structures[full.activeIndex];
  return {
    ...full,
    structures: active ? [active] : [],
    activeIndex: 0,
  };
}

/**
 * Persist the given state to localStorage immediately (no debounce).
 * Never throws. Falls back to an active-tab-only document on QuotaExceededError.
 */
export function saveSessionNow(state: StructureState): void {
  const doc = buildSceneDocument(state);
  const json = JSON.stringify(doc);
  try {
    localStorage.setItem(SESSION_KEY, json);
  } catch (e) {
    const isQuota =
      e instanceof DOMException &&
      (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED');
    if (isQuota) {
      // Retry with a trimmed doc containing only the active tab.
      try {
        const trimmed = buildTrimmedDoc(state);
        localStorage.setItem(SESSION_KEY, JSON.stringify(trimmed));
      } catch {
        // Even the trimmed doc didn't fit — remove the stale entry silently.
        try {
          localStorage.removeItem(SESSION_KEY);
        } catch {
          // Nothing we can do.
        }
      }
    }
    // For any other error, swallow silently.
  }
}

/**
 * Debounced wrapper over saveSessionNow. Resets the timer on each call so
 * that rapid state changes result in a single write after SAVE_DEBOUNCE_MS ms.
 */
export function saveSession(state: StructureState): void {
  if (_debounceTimer !== null) {
    clearTimeout(_debounceTimer);
  }
  _debounceTimer = setTimeout(() => {
    _debounceTimer = null;
    saveSessionNow(state);
  }, SAVE_DEBOUNCE_MS);
}

/**
 * Read and validate the persisted session. Returns null (and clears the key)
 * on any parse / schema error. Never throws.
 */
export function loadSession(): SceneDoc | null {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const doc = parseDocument(raw);
    if (doc.kind === 'atomcanvas-scene') return doc as SceneDoc;
    // Valid document but not a session scene (e.g. a style doc) — discard it.
    localStorage.removeItem(SESSION_KEY);
    return null;
  } catch {
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch {
      // Ignore.
    }
    return null;
  }
}

/**
 * Restore the persisted session into the store (synchronous).
 * Protected by the hydrating guard so the subscription does not re-save
 * the store changes triggered by the replay.
 */
export function restoreSession(): void {
  const doc = loadSession();
  if (!doc) return;
  hydrating = true;
  try {
    applySceneDocument(doc);
  } finally {
    hydrating = false;
  }
}

/**
 * Subscribe to store changes and auto-persist (debounced).
 * Returns the unsubscribe function.
 */
export function subscribeSessionPersistence(): () => void {
  return useStructureStore.subscribe(() => {
    if (hydrating) return;
    saveSession(useStructureStore.getState());
  });
}
