import { describe, it, expect } from 'vitest';
import { resolveShortcut } from './keyboardShortcuts';

const active = { editableTarget: false };
const typing = { editableTarget: true };

describe('resolveShortcut', () => {
  it('maps Cmd+Z to undo', () => {
    expect(resolveShortcut({ key: 'z', metaKey: true }, active)).toEqual({ type: 'undo' });
  });

  it('maps Ctrl+Z to undo (cross-platform)', () => {
    expect(resolveShortcut({ key: 'z', ctrlKey: true }, active)).toEqual({ type: 'undo' });
  });

  it('maps Cmd+Shift+Z to redo', () => {
    expect(resolveShortcut({ key: 'z', metaKey: true, shiftKey: true }, active)).toEqual({ type: 'redo' });
  });

  it('maps Ctrl+Y to redo (Windows convention)', () => {
    expect(resolveShortcut({ key: 'y', ctrlKey: true }, active)).toEqual({ type: 'redo' });
  });

  it('ignores Cmd+Z while typing so the browser native undo wins', () => {
    expect(resolveShortcut({ key: 'z', metaKey: true }, typing)).toEqual({ type: 'none' });
  });

  it('ignores a bare z (not a panel hotkey)', () => {
    expect(resolveShortcut({ key: 'z' }, active)).toEqual({ type: 'none' });
  });

  it('toggles the style panel on s', () => {
    expect(resolveShortcut({ key: 's' }, active)).toEqual({ type: 'togglePanel', panel: 'style' });
  });

  it('maps b/c/a to their panels', () => {
    expect(resolveShortcut({ key: 'b' }, active)).toEqual({ type: 'togglePanel', panel: 'bonds' });
    expect(resolveShortcut({ key: 'c' }, active)).toEqual({ type: 'togglePanel', panel: 'scene' });
    expect(resolveShortcut({ key: 'a' }, active)).toEqual({ type: 'togglePanel', panel: 'selection' });
  });

  it('closes the panel on Escape', () => {
    expect(resolveShortcut({ key: 'Escape' }, active)).toEqual({ type: 'closePanel' });
  });

  it('ignores other modifier combos like Cmd+S', () => {
    expect(resolveShortcut({ key: 's', metaKey: true }, active)).toEqual({ type: 'none' });
  });

  it('ignores panel hotkeys while typing in a field', () => {
    expect(resolveShortcut({ key: 's' }, typing)).toEqual({ type: 'none' });
  });
});
