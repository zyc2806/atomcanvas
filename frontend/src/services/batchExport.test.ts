import { describe, it, expect, vi, beforeEach } from 'vitest';
import { batchExportGlb } from './batchExport';
import { useStructureStore } from '../store/useStructureStore';
import * as dl from './download';

vi.mock('./glbExporter', async (orig) => ({
  ...(await (orig() as Promise<Record<string, unknown>>)),
  exportGlb: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
}));

const doc = () =>
  ({
    structure: { symbols: ['O'], positions: [[0, 0, 0]] },
    visualization: { bonds: [] },
  }) as never;

describe('batchExportGlb', () => {
  beforeEach(() => {
    useStructureStore.setState({ tabs: [], activeTabId: null });
    dl.resetUniqueNames();
  });

  it('emits one download per tab named after the tab', async () => {
    const spy = vi.spyOn(dl, 'downloadBlob').mockImplementation(() => {});
    useStructureStore.getState().addTab(doc(), 'water');
    useStructureStore.getState().addTab(doc(), 'slab');
    await batchExportGlb();
    const names = spy.mock.calls.map((c) => c[1]);
    expect(names).toEqual(['water.glb', 'slab.glb']);
    spy.mockRestore();
  });
});
