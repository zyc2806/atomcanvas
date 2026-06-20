import { afterEach, describe, expect, it } from 'vitest';
import { installRenderHook, bumpRenderFrame } from './renderHook';

declare global {
  interface Window { __atomcanvas?: Record<string, unknown>; }
}

afterEach(() => { delete window.__atomcanvas; });

describe('renderHook', () => {
  it('installs a __atomcanvas hook with the expected API surface', () => {
    expect(window.__atomcanvas).toBeUndefined();
    installRenderHook();
    const hook = window.__atomcanvas!;
    for (const key of [
      'version', 'getState', 'setStructureData', 'setDisplayMode', 'setVisParams',
      'setViewControls', 'setBackground', 'applyScene', 'capturePng',
      'exportGlbBase64', 'forceRender', 'frames',
    ]) {
      expect(hook[key], `missing ${key}`).toBeDefined();
    }
    expect(typeof hook.capturePng).toBe('function');
  });

  it('frames() reflects bumpRenderFrame()', () => {
    installRenderHook();
    const hook = window.__atomcanvas!;
    const before = (hook.frames as () => number)();
    bumpRenderFrame();
    bumpRenderFrame();
    expect((hook.frames as () => number)()).toBe(before + 2);
  });
});
