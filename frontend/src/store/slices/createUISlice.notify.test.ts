import { describe, it, expect, beforeEach } from 'vitest';
import { useStructureStore } from '../useStructureStore';

describe('UISlice notify', () => {
  beforeEach(() => useStructureStore.getState().clearNotification());

  it('notify sets a notification with message, severity and an incrementing key', () => {
    useStructureStore.getState().notify('hello');
    const first = useStructureStore.getState().notification;
    expect(first?.message).toBe('hello');
    expect(first?.severity).toBe('info');

    useStructureStore.getState().notify('done', 'success');
    const second = useStructureStore.getState().notification;
    expect(second?.message).toBe('done');
    expect(second?.severity).toBe('success');
    expect(second!.key).not.toBe(first!.key);
  });

  it('clearNotification resets to null', () => {
    useStructureStore.getState().notify('x');
    useStructureStore.getState().clearNotification();
    expect(useStructureStore.getState().notification).toBeNull();
  });
});
