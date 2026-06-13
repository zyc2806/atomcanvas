import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useStructureStore from '../../store/useStructureStore';
import { bondService } from '../../services/bondService';
import type { StandardStructureObject } from '../../types/store';

vi.mock('../../services/bondService');

describe('createUISlice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const { result } = renderHook(() => useStructureStore());
    act(() => {
      result.current.resetUIState();
      useStructureStore.setState({ past: [], future: [] });
    });
  });

  it('should initialize viewTarget as null', () => {
    const { result } = renderHook(() => useStructureStore());
    expect(result.current.viewTarget).toBeNull();
  });

  it('should update viewTarget correctly using setViewTarget', () => {
    const { result } = renderHook(() => useStructureStore());
    const newTarget: [number, number, number] = [10, 20, 30];
    
    act(() => {
      result.current.setViewTarget(newTarget);
    });

    expect(result.current.viewTarget).toEqual(newTarget);
  });

  it('should reset viewTarget when resetUIState is called', () => {
    const { result } = renderHook(() => useStructureStore());
    const newTarget: [number, number, number] = [5, 5, 5];
    
    act(() => {
      result.current.setViewTarget(newTarget);
    });
    expect(result.current.viewTarget).toEqual(newTarget);

    act(() => {
      result.current.resetUIState();
    });
    expect(result.current.viewTarget).toBeNull();
  });

  it('should apply camera snapshot atomically and increment revision', () => {
    const { result } = renderHook(() => useStructureStore());

    const beforeRevision = result.current.cameraApplyRevision;
    act(() => {
      result.current.applyCameraSnapshot({
        type: 'orthographic',
        target: [1, 2, 3],
        state: {
          position: [9, 8, 7],
          up: [0, 0, 1],
          zoom: 1.5,
        },
      });
    });

    expect(result.current.cameraType).toBe('orthographic');
    expect(result.current.viewTarget).toEqual([1, 2, 3]);
    expect(result.current.cameraState).toEqual({
      position: [9, 8, 7],
      up: [0, 0, 1],
      zoom: 1.5,
    });
    expect(result.current.userHasInteracted).toBe(true);
    expect(result.current.cameraApplyRevision).toBe(beforeRevision + 1);
  });

  it('should increment camera revision on repeated snapshot apply', () => {
    const { result } = renderHook(() => useStructureStore());

    const initialRevision = result.current.cameraApplyRevision;
    const snapshot = {
      type: 'perspective' as const,
      target: [0, 0, 0] as [number, number, number],
      state: {
        position: [0, 0, 20] as [number, number, number],
        up: [0, 1, 0] as [number, number, number],
        zoom: 2,
      },
    };

    act(() => {
      result.current.applyCameraSnapshot(snapshot);
      result.current.applyCameraSnapshot(snapshot);
    });

    expect(result.current.cameraState?.zoom).toBe(2);
    expect(result.current.cameraApplyRevision).toBe(initialRevision + 2);
  });

  it('should initialize renderStyle as standard', () => {
    const { result } = renderHook(() => useStructureStore());
    expect(result.current.visParams.renderStyle).toBe('standard');
  });

  it('should update renderStyle via setVisParams', () => {
    const { result } = renderHook(() => useStructureStore());
    act(() => {
      result.current.setVisParams({ renderStyle: 'cartoon' });
    });
    expect(result.current.visParams.renderStyle).toBe('cartoon');
  });

  it('should initialize cartoonParams with defaults', () => {
    const { result } = renderHook(() => useStructureStore());
    expect(result.current.visParams.cartoonParams).toEqual({
      outlineThickness: 3,
      highlightThreshold: 0.97,
      shadowThreshold: 0.3,
      shadowBrightness: 0.5,
    });
  });

  it('should update cartoonParams via setVisParams', () => {
    const { result } = renderHook(() => useStructureStore());
    act(() => {
      result.current.setVisParams({ 
        cartoonParams: { outlineThickness: 5, highlightThreshold: 0.95, shadowThreshold: 0.4, shadowBrightness: 0.6 } 
      });
    });
    expect(result.current.visParams.cartoonParams.outlineThickness).toBe(5);
  });

  describe('toggleSelection', () => {
    it('should auto-select bond when 2 connected atoms are selected', async () => {
      const { result } = renderHook(() => useStructureStore());
      
      const mockStructureData = {
        structure: {
          symbols: ['H', 'H'],
          positions: [[0, 0, 0], [1, 0, 0]],
          cell: [[10, 0, 0], [0, 10, 0], [0, 0, 10]],
          pbc: [true, true, true]
        },
        visualization: { 
            bonds: [[0, 1, 1.0]], 
            h_bonds: [], 
            rings: [] 
        }
      };

      await act(async () => {
        result.current.setStructureData(mockStructureData as any);
        result.current.toggleSelection(0);
      });
      
      expect(result.current.selectedAtoms).toEqual([0]);
      expect(result.current.selectedBonds).toEqual([]);

      await act(async () => {
        result.current.toggleSelection(1);
      });

      expect(result.current.selectedAtoms).toEqual([0, 1]);
      expect(result.current.selectedBonds).toEqual(['0-1']);
    });

    it('should deselect bond when atom count drops below 2', async () => {
        const { result } = renderHook(() => useStructureStore());
        const mockStructureData = {
            structure: {
              symbols: ['H', 'H'],
              positions: [[0, 0, 0], [1, 0, 0]],
              cell: [[10, 0, 0], [0, 10, 0], [0, 0, 10]],
              pbc: [true, true, true]
            },
            visualization: { bonds: [[0, 1, 1.0]], h_bonds: [], rings: [] }
        };
    
        await act(async () => {
            result.current.setStructureData(mockStructureData as any);
            result.current.updateSelection([0, 1], 'replace');
            useStructureStore.setState({ selectedBonds: ['0-1'] });
        });
    
        expect(result.current.selectedBonds).toEqual(['0-1']);
    
        await act(async () => {
            result.current.toggleSelection(0); // Deselect atom 0
        });
    
        expect(result.current.selectedAtoms).toEqual([1]);
        expect(result.current.selectedBonds).toEqual([]);
    });

    it('should auto-select bonds for all selected atom pairs', async () => {
      const { result } = renderHook(() => useStructureStore());
      
      const mockStructureData = {
        structure: {
          symbols: ['H', 'H', 'H'],
          positions: [[0, 0, 0], [1, 0, 0], [2, 0, 0]],
          cell: [[10, 0, 0], [0, 10, 0], [0, 0, 10]],
          pbc: [true, true, true]
        },
        visualization: { 
            bonds: [[0, 1, 1.0], [1, 2, 1.0]], 
            h_bonds: [], 
            rings: [] 
        }
      };

      await act(async () => {
        result.current.setStructureData(mockStructureData as any);
        result.current.toggleSelection(0);
        result.current.toggleSelection(1);
        result.current.toggleSelection(2);
      });

      expect(result.current.selectedAtoms).toEqual([0, 1, 2]);
      expect(result.current.selectedBonds).toContain('0-1');
      expect(result.current.selectedBonds).toContain('1-2');
      expect(result.current.selectedBonds.length).toBe(2);
    });

    it('should update selectionExpression when atoms are toggled', async () => {
      const { result } = renderHook(() => useStructureStore());
      
      const mockStructureData = {
        structure: {
          symbols: ['C', 'O', 'C'],
          positions: [[0, 0, 0], [1, 0, 0], [2, 0, 0]],
          cell: [[10, 0, 0], [0, 10, 0], [0, 0, 10]],
          pbc: [true, true, true]
        },
        visualization: { bonds: [], h_bonds: [], rings: [] }
      };

      await act(async () => {
        result.current.setStructureData(mockStructureData as any);
      });

      await act(async () => {
        result.current.toggleSelection(0);
      });
      expect(result.current.selectionExpression).toBe('label:C1');

      await act(async () => {
        result.current.toggleSelection(1);
      });
      expect(result.current.selectionExpression).toBe('label:C1,O1');

      await act(async () => {
        result.current.toggleSelection(2);
      });
      expect(result.current.selectionExpression).toBe('label:C1,C2,O1');

      await act(async () => {
        result.current.toggleSelection(0);
      });
      expect(result.current.selectionExpression).toBe('label:C2,O1');
    });
  });

  describe('bond overrides', () => {
    it('should set multiple bond overrides correctly', () => {
      const { result } = renderHook(() => useStructureStore());
      
      act(() => {
        result.current.setMultipleBondOverrides({
          '0-1': '2.0',
          '1-2': '1.5'
        });
      });

      expect(result.current.bondOverrides).toEqual({
        '0-1': '2.0',
        '1-2': '1.5'
      });
    });

    it('should clear specific bond overrides when passing null', () => {
      const { result } = renderHook(() => useStructureStore());
      
      act(() => {
        result.current.setMultipleBondOverrides({
          '0-1': '2.0',
          '1-2': '1.5'
        });
      });

      act(() => {
        result.current.setMultipleBondOverrides({
          '0-1': null
        });
      });

      expect(result.current.bondOverrides).toEqual({
        '1-2': '1.5'
      });
    });

    it('should set bondOverrides to null when all overrides are cleared', () => {
      const { result } = renderHook(() => useStructureStore());
      
      act(() => {
        result.current.setMultipleBondOverrides({
          '0-1': '2.0'
        });
      });

      act(() => {
        result.current.setMultipleBondOverrides({
          '0-1': null
        });
      });

      expect(result.current.bondOverrides).toBeNull();
    });
  });

  describe('selectionExpression', () => {
    it('should initialize with empty string', () => {
      const { result } = renderHook(() => useStructureStore());
      expect(result.current.selectionExpression).toBe('');
    });

    it('should update expression via setSelectionExpression', () => {
      const { result } = renderHook(() => useStructureStore());
      act(() => {
        result.current.setSelectionExpression('elem:C');
      });
      expect(result.current.selectionExpression).toBe('elem:C');
    });

    it('should clear expression when clearSelection is called', () => {
      const { result } = renderHook(() => useStructureStore());
      act(() => {
        result.current.setSelectionExpression('elem:C');
        result.current.clearSelection();
      });
      expect(result.current.selectionExpression).toBe('');
    });

  });

  describe('updateSelection', () => {
    it('should auto-select bonds when multiple connected atoms are selected via updateSelection', async () => {
      const { result } = renderHook(() => useStructureStore());
      
      const mockStructureData = {
        structure: {
          symbols: ['H', 'H', 'H'],
          positions: [[0, 0, 0], [1, 0, 0], [2, 0, 0]],
          cell: [[10, 0, 0], [0, 10, 0], [0, 0, 10]],
          pbc: [true, true, true]
        },
        visualization: { 
            bonds: [[0, 1, 1.0], [1, 2, 1.0]], 
            h_bonds: [], 
            rings: [] 
        }
      };

      await act(async () => {
        result.current.setStructureData(mockStructureData as any);
        result.current.updateSelection([0, 1, 2], 'replace');
      });

      expect(result.current.selectedAtoms).toEqual([0, 1, 2]);
      expect(result.current.selectedBonds).toContain('0-1');
      expect(result.current.selectedBonds).toContain('1-2');
      expect(result.current.selectedBonds.length).toBe(2);
    });

    it('should deselect bonds when atoms are removed via updateSelection', async () => {
        const { result } = renderHook(() => useStructureStore());
        const mockStructureData = {
            structure: {
              symbols: ['H', 'H'],
              positions: [[0, 0, 0], [1, 0, 0]],
              cell: [[10, 0, 0], [0, 10, 0], [0, 0, 10]],
              pbc: [true, true, true]
            },
            visualization: { bonds: [[0, 1, 1.0]], h_bonds: [], rings: [] }
        };
    
        await act(async () => {
            result.current.setStructureData(mockStructureData as any);
            result.current.updateSelection([0, 1], 'replace');
        });
    
        await act(async () => {
            result.current.updateSelection([1], 'replace');
        });
    
        expect(result.current.selectedAtoms).toEqual([1]);
        expect(result.current.selectedBonds).toEqual([]);
    });

    it('should handle dense advanced-selection inversions without blocking', async () => {
      const { result } = renderHook(() => useStructureStore());

      const atomCount = 300;
      const positions: [number, number, number][] = Array.from({ length: atomCount }, (_, i) => [i, 0, 0]);
      const bonds: [number, number, number][] = [];

      for (let i = 0; i < atomCount; i++) {
        for (let j = i + 1; j < atomCount; j++) {
          bonds.push([i, j, 1]);
        }
      }

      const denseStructure: StandardStructureObject = {
        structure: {
          symbols: Array.from({ length: atomCount }, () => 'C'),
          positions,
          wrapped_positions: positions,
          cell: [[1000, 0, 0], [0, 1000, 0], [0, 0, 1000]],
          pbc: [false, false, false],
        },
        visualization: {
          bonds,
          rings: [],
          wrapped_ghost_bonds: [],
          h_bond_geometries: [],
          unwrapped_h_bonds: [],
        },
      };

      await act(async () => {
        result.current.setStructureData(denseStructure);
      });

      const allIndices = Array.from({ length: atomCount }, (_, i) => i);

      await act(async () => {
        result.current.updateSelection(allIndices, 'replace');
      });

      expect(result.current.selectedAtoms.length).toBe(atomCount);
      expect(result.current.selectedBonds.length).toBe(bonds.length);
    }, 4000);
  });

  describe('Advanced Selection Logic', () => {
    const mockStructureData = {
      structure: {
        symbols: ['C', 'O', 'N'],
        positions: [[0, 0, 0], [1, 0, 0], [2, 0, 0]],
        cell: [[10, 0, 0], [0, 10, 0], [0, 0, 10]],
        pbc: [true, true, true]
      },
      visualization: { bonds: [], h_bonds: [], rings: [] }
    };

    it('should fallback to simple regeneration for simple label lists', async () => {
        const { result } = renderHook(() => useStructureStore());
        const mockData = { ...mockStructureData, visualization: { bonds: [], h_bonds: [], rings: [] } };
        
        await act(async () => {
          result.current.setStructureData(mockData as any);
          result.current.setSelectionExpression('label:C1');
          useStructureStore.setState({ selectedAtoms: [0] });
        });
  
        await act(async () => {
          result.current.toggleSelection(1);
        });
  
        expect(result.current.selectionExpression).toBe('label:C1,O1');
      });

    it('should preserve advanced expression and append "or" when adding atom', async () => {
      const { result } = renderHook(() => useStructureStore());
      
      await act(async () => {
        result.current.setStructureData(mockStructureData as any);
        result.current.setSelectionExpression('x > 5');
        useStructureStore.setState({ selectedAtoms: [0] }); 
      });

      await act(async () => {
        result.current.toggleSelection(1);
      });

      expect(result.current.selectedAtoms).toContain(1);
      expect(result.current.selectionExpression).toBe('(x > 5) or label:O1');
    });

    it('should preserve advanced expression and append "and not" when removing atom', async () => {
      const { result } = renderHook(() => useStructureStore());
      
      await act(async () => {
        result.current.setStructureData(mockStructureData as any);
        result.current.setSelectionExpression('x > 5');
        useStructureStore.setState({ selectedAtoms: [0, 1] }); 
      });

      await act(async () => {
        result.current.toggleSelection(1);
      });

      expect(result.current.selectedAtoms).not.toContain(1);
      expect(result.current.selectionExpression).toBe('(x > 5) and not label:O1');
    });

    it('should undo "and not" suffix when adding atom back', async () => {
      const { result } = renderHook(() => useStructureStore());
      
      await act(async () => {
        result.current.setStructureData(mockStructureData as any);
        result.current.setSelectionExpression('(x > 5) and not label:O1');
        useStructureStore.setState({ selectedAtoms: [0] }); 
      });

      await act(async () => {
        result.current.toggleSelection(1);
      });

      expect(result.current.selectedAtoms).toContain(1);
      expect(result.current.selectionExpression).toBe('(x > 5)'); 
    });

    it('should undo "or" suffix when removing added atom', async () => {
      const { result } = renderHook(() => useStructureStore());
      
      await act(async () => {
        result.current.setStructureData(mockStructureData as any);
        result.current.setSelectionExpression('(x > 5) or label:O1');
        useStructureStore.setState({ selectedAtoms: [0, 1] }); 
      });

      await act(async () => {
        result.current.toggleSelection(1);
      });

      expect(result.current.selectedAtoms).not.toContain(1);
      expect(result.current.selectionExpression).toBe('(x > 5)');
    });
  });

  describe('updateVisualization', () => {
    it('should pass default bond inference controls to bondService', async () => {
      const { result } = renderHook(() => useStructureStore());

      const mockStructureData: StandardStructureObject = {
        structure: {
          symbols: ['O', 'H', 'H'],
          positions: [[0, 0, 0], [0.758, 0, 0.504], [-0.758, 0, 0.504]],
          wrapped_positions: [[0, 0, 0], [0.758, 0, 0.504], [-0.758, 0, 0.504]],
          cell: [[10, 0, 0], [0, 10, 0], [0, 0, 10]],
          pbc: [false, false, false],
        },
        visualization: {
          bonds: [[0, 1, 1], [0, 2, 1]],
          rings: [],
          wrapped_ghost_bonds: [],
          h_bond_geometries: [],
          unwrapped_h_bonds: [],
          fixed_atoms: [],
        },
      };

      vi.mocked(bondService.updateVisualization).mockResolvedValue({
        bonds: [[0, 1, 1], [0, 2, 1]],
        rings: [],
        wrapped_ghost_bonds: [],
        h_bond_geometries: [],
        unwrapped_h_bonds: [],
        labels: ['O1', 'H1', 'H2'],
        fixed_atoms: [],
      });

      await act(async () => {
        result.current.setStructureData(mockStructureData);
      });

      await act(async () => {
        await result.current.updateVisualization();
      });

      expect(bondService.updateVisualization).toHaveBeenCalledWith(
        expect.objectContaining({
          structure: mockStructureData.structure,
          bond_inference_mode: 'auto',
          include_bond_diagnostics: false,
        }),
      );
    });

    it('should pass customized bond inference controls to bondService', async () => {
      const { result } = renderHook(() => useStructureStore());

      const mockStructureData: StandardStructureObject = {
        structure: {
          symbols: ['O', 'H', 'H'],
          positions: [[0, 0, 0], [0.758, 0, 0.504], [-0.758, 0, 0.504]],
          wrapped_positions: [[0, 0, 0], [0.758, 0, 0.504], [-0.758, 0, 0.504]],
          cell: [[10, 0, 0], [0, 10, 0], [0, 0, 10]],
          pbc: [false, false, false],
        },
        visualization: {
          bonds: [[0, 1, 1], [0, 2, 1]],
          rings: [],
          wrapped_ghost_bonds: [],
          h_bond_geometries: [],
          unwrapped_h_bonds: [],
          fixed_atoms: [],
        },
      };

      vi.mocked(bondService.updateVisualization).mockResolvedValue({
        bonds: [[0, 1, 1], [0, 2, 1]],
        rings: [],
        wrapped_ghost_bonds: [],
        h_bond_geometries: [],
        unwrapped_h_bonds: [],
        labels: ['O1', 'H1', 'H2'],
        fixed_atoms: [],
      });

      await act(async () => {
        result.current.setStructureData(mockStructureData);
        result.current.setVisParams({
          bondInferenceMode: 'quick',
          includeBondDiagnostics: true,
        });
      });

      await act(async () => {
        await result.current.updateVisualization();
      });

      expect(bondService.updateVisualization).toHaveBeenCalledWith(
        expect.objectContaining({
          structure: mockStructureData.structure,
          bond_inference_mode: 'quick',
          include_bond_diagnostics: true,
        }),
      );
    });
  });
});
