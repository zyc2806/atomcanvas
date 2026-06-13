import { create } from 'zustand';
import type { StructureState } from '../types/store';
import { createDataSlice } from './slices/createDataSlice';
import { createUISlice } from './slices/createUISlice';
import { createSceneSlice } from './slices/createSceneSlice';
import { createStyleSlice } from './slices/createStyleSlice';
import { createHistorySlice } from './slices/createHistorySlice';
import { createTabsSlice } from './slices/createTabsSlice';
import { createPresetSlice } from './slices/createPresetSlice';

export const useStructureStore = create<StructureState>()((...a) => ({
  ...createDataSlice(...a),
  ...createUISlice(...a),
  ...createSceneSlice(...a),
  ...createStyleSlice(...a),
  ...createHistorySlice(...a),
  ...createTabsSlice(...a),
  ...createPresetSlice(...a),
}));

export default useStructureStore;
export * from '../types/store';
