import type { StateCreator } from 'zustand';
import type { StructureState, StyleBlock, StyleSlice } from '../../types/store';
// import { loadStyleBlocks } from '../../utils/styleStorage';

export const createStyleSlice: StateCreator<StructureState, [], [], StyleSlice> = (set) => ({
    styleBlocks: [], // loadStyleBlocks(),
    activeBlockId: null,
    
    addBlock: (blockData) => {
        const id = crypto.randomUUID();
        set((state) => ({
            styleBlocks: [...state.styleBlocks, { ...blockData, id } as StyleBlock]
        }));
        return id;
    },

    removeBlock: (id) => set((state) => ({
        styleBlocks: state.styleBlocks.filter((block: StyleBlock) => block.id !== id),
        activeBlockId: state.activeBlockId === id ? null : state.activeBlockId
    })),

    updateBlockProperty: (blockId, property, value) => set((state) => ({
        styleBlocks: state.styleBlocks.map((block: StyleBlock) => 
            block.id === blockId 
                ? { 
                    ...block, 
                    style: { 
                        ...block.style, 
                        [property]: { value, timestamp: Date.now() } 
                    } 
                } 
                : block
        )
    })),

    setActiveBlock: (id) => set({ activeBlockId: id }),

    toggleBlock: (id) => set((state) => ({
        styleBlocks: state.styleBlocks.map((block: StyleBlock) => 
            block.id === id ? { ...block, enabled: !block.enabled } : block
        )
    })),

    reorderBlocks: (sourceIndex, destIndex) => set((state) => {
        const newBlocks = [...state.styleBlocks];
        const [removed] = newBlocks.splice(sourceIndex, 1);
        newBlocks.splice(destIndex, 0, removed);
        return { styleBlocks: newBlocks };
    }),

    updateBlockSelector: (blockId, config) => set((state) => ({
        styleBlocks: state.styleBlocks.map((block: StyleBlock) => 
            block.id === blockId 
                ? { 
                    ...block, 
                    selector: { 
                        ...block.selector, 
                        config
                    } 
                } 
                : block
        )
    }))
});
