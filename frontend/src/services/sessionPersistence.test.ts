import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useStructureStore } from '../store/useStructureStore';
import { buildSceneDocument } from './sceneDocument';
import {
  SESSION_KEY,
  loadSession,
  saveSessionNow,
  saveSession,
  restoreSession,
  subscribeSessionPersistence,
} from './sessionPersistence';

// ---------------------------------------------------------------------------
// Minimal structure document fixture (same shape used by sceneDocument.test.ts)
// ---------------------------------------------------------------------------
const doc = () =>
  ({
    structure: {
      symbols: ['O', 'H', 'H'],
      positions: [
        [0, 0, 0],
        [1, 0, 0],
        [0, 1, 0],
      ],
    },
    visualization: {
      bonds: [],
      wrapped_ghost_bonds: [],
      h_bond_geometries: [],
      unwrapped_h_bonds: [],
    },
  }) as never;

// ---------------------------------------------------------------------------
// Reset store + storage before every test
// ---------------------------------------------------------------------------
beforeEach(() => {
  useStructureStore.setState({ tabs: [], activeTabId: null, topologyOverrides: {} });
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// 1. save → localStorage
// ---------------------------------------------------------------------------
describe('saveSessionNow → localStorage', () => {
  it('writes a valid atomcanvas-scene doc with the expected structures count', () => {
    useStructureStore.getState().addTab(doc(), 'h2o');
    const state = useStructureStore.getState();
    saveSessionNow(state);

    const raw = localStorage.getItem(SESSION_KEY);
    expect(raw).not.toBeNull();

    const parsed = JSON.parse(raw!);
    expect(parsed.kind).toBe('atomcanvas-scene');
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.structures).toHaveLength(1);
    expect(parsed.structures[0].name).toBe('h2o');
  });

  it('stores multiple tabs correctly', () => {
    useStructureStore.getState().addTab(doc(), 'tab1');
    useStructureStore.getState().addTab(doc(), 'tab2');
    saveSessionNow(useStructureStore.getState());

    const parsed = JSON.parse(localStorage.getItem(SESSION_KEY)!);
    expect(parsed.structures).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// 2. subscribe fires save (debounced)
// ---------------------------------------------------------------------------
describe('subscribeSessionPersistence fires debounced save', () => {
  it('triggers setItem after > 600ms following an addTab', () => {
    vi.useFakeTimers();
    const spy = vi.spyOn(window.localStorage, 'setItem');

    const unsub = subscribeSessionPersistence();
    useStructureStore.getState().addTab(doc(), 'subscribed');

    // Before debounce window: nothing written yet.
    expect(spy).not.toHaveBeenCalledWith(SESSION_KEY, expect.any(String));

    vi.advanceTimersByTime(700);
    expect(spy).toHaveBeenCalledWith(SESSION_KEY, expect.any(String));

    // Unsubscribe first, then verify no further writes.
    unsub();
    spy.mockClear();
    useStructureStore.getState().addTab(doc(), 'afterUnsub');
    vi.advanceTimersByTime(700);
    expect(spy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 3. load → restore
// ---------------------------------------------------------------------------
describe('loadSession / restoreSession round-trip', () => {
  it('restores two tabs and the correct activeTabId', () => {
    // Build a state with two tabs.
    useStructureStore.getState().addTab(doc(), 'r1');
    useStructureStore.getState().addTab(doc(), 'r2');
    const scene = buildSceneDocument(useStructureStore.getState());
    localStorage.setItem(SESSION_KEY, JSON.stringify(scene));

    // Reset store.
    useStructureStore.setState({ tabs: [], activeTabId: null, topologyOverrides: {} });

    restoreSession();

    const s = useStructureStore.getState();
    expect(s.tabs).toHaveLength(2);
    expect(s.tabs.map((t) => t.name)).toEqual(['r1', 'r2']);
    expect(s.activeTabId).toBe(s.tabs[1].id);
  });

  it('loadSession returns the SceneDoc when the key contains a valid scene', () => {
    useStructureStore.getState().addTab(doc(), 'only');
    const scene = buildSceneDocument(useStructureStore.getState());
    localStorage.setItem(SESSION_KEY, JSON.stringify(scene));

    const result = loadSession();
    expect(result).not.toBeNull();
    expect(result!.kind).toBe('atomcanvas-scene');
    expect(result!.structures).toHaveLength(1);
  });

  it('loadSession returns null when localStorage is empty', () => {
    expect(loadSession()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 4. corrupt JSON → null + key cleared
// ---------------------------------------------------------------------------
describe('corrupt JSON handling', () => {
  it('returns null and removes the key on unparseable JSON', () => {
    localStorage.setItem(SESSION_KEY, '{bad json');
    const result = loadSession();
    expect(result).toBeNull();
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 5. version skew → null + key cleared
// ---------------------------------------------------------------------------
describe('schema version skew', () => {
  it('returns null and removes the key when schemaVersion is too new', () => {
    const futureDoc = {
      kind: 'atomcanvas-scene',
      schemaVersion: 999,
      structures: [],
      style: {},
      camera: null,
      activeIndex: 0,
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(futureDoc));
    const result = loadSession();
    expect(result).toBeNull();
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it('returns null and removes the key when kind is unknown', () => {
    const badDoc = { kind: 'alien-format', schemaVersion: 1 };
    localStorage.setItem(SESSION_KEY, JSON.stringify(badDoc));
    const result = loadSession();
    expect(result).toBeNull();
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it('returns null and removes the key for a valid but non-scene kind', () => {
    // A valid atomcanvas-style doc parses fine but is the wrong kind for a session.
    const styleDoc = { kind: 'atomcanvas-style', schemaVersion: 1, elements: {} };
    localStorage.setItem(SESSION_KEY, JSON.stringify(styleDoc));
    const result = loadSession();
    expect(result).toBeNull();
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 6. QuotaExceededError fallback — retries with active-tab-only trimmed doc
// ---------------------------------------------------------------------------
describe('QuotaExceededError fallback', () => {
  it('retries with a single-tab trimmed doc on the second setItem call', () => {
    // Add two tabs; active tab is tab2.
    useStructureStore.getState().addTab(doc(), 'tabA');
    useStructureStore.getState().addTab(doc(), 'tabB');
    const state = useStructureStore.getState();

    // First setItem call throws QuotaExceededError; second should succeed.
    const spy = vi.spyOn(window.localStorage, 'setItem');
    spy.mockImplementationOnce(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });

    // Should NOT throw.
    expect(() => saveSessionNow(state)).not.toThrow();

    // Second call must have been made with a trimmed payload (1 structure).
    expect(spy).toHaveBeenCalledTimes(2);
    const secondCallJson = spy.mock.calls[1][1] as string;
    const secondDoc = JSON.parse(secondCallJson);
    expect(secondDoc.structures).toHaveLength(1);
    expect(secondDoc.activeIndex).toBe(0);
  });

  it('removes the key and does not throw when both setItem calls fail', () => {
    useStructureStore.getState().addTab(doc(), 'tabC');
    const state = useStructureStore.getState();

    const spy = vi.spyOn(window.localStorage, 'setItem');
    spy.mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    const removeSpy = vi.spyOn(window.localStorage, 'removeItem');

    expect(() => saveSessionNow(state)).not.toThrow();
    expect(removeSpy).toHaveBeenCalledWith(SESSION_KEY);
  });
});

// ---------------------------------------------------------------------------
// 7. Hydration guard — restoreSession must not trigger a save
// ---------------------------------------------------------------------------
describe('hydration guard', () => {
  it('does not call setItem as a side-effect of restoreSession', () => {
    // Seed a valid scene.
    useStructureStore.getState().addTab(doc(), 'seed');
    const scene = buildSceneDocument(useStructureStore.getState());
    localStorage.setItem(SESSION_KEY, JSON.stringify(scene));

    // Reset store.
    useStructureStore.setState({ tabs: [], activeTabId: null, topologyOverrides: {} });

    vi.useFakeTimers();
    const unsub = subscribeSessionPersistence();
    const spy = vi.spyOn(window.localStorage, 'setItem');

    // This replays applySceneDocument which fires many store mutations.
    restoreSession();

    // Advance timers fully — if hydration guard is broken a debounced write fires.
    vi.advanceTimersByTime(2000);

    expect(spy).not.toHaveBeenCalledWith(SESSION_KEY, expect.any(String));

    unsub();
  });
});

// ---------------------------------------------------------------------------
// 8. saveSession debounce — multiple rapid calls collapse to one write
// ---------------------------------------------------------------------------
describe('saveSession debounce', () => {
  it('collapses multiple rapid calls into a single write', () => {
    vi.useFakeTimers();
    const spy = vi.spyOn(window.localStorage, 'setItem');

    useStructureStore.getState().addTab(doc(), 'deb');
    const state = useStructureStore.getState();

    saveSession(state);
    saveSession(state);
    saveSession(state);

    // Still within debounce window — no write yet.
    vi.advanceTimersByTime(300);
    expect(spy).not.toHaveBeenCalled();

    // Past debounce window — exactly one write.
    vi.advanceTimersByTime(400);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
