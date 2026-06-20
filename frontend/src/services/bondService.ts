import apiClient from './apiClient';
import type { Structure, StandardStructureObject, Visualization } from '../types/store';

export type BondInferenceMode = 'auto' | 'quick' | 'full';

export interface UpdateVisualizationRequest {
    structure: Structure;
    bond_scale: number;
    h_bond_distance_cutoff: number;
    h_bond_angle_cutoff: number;
    bond_overrides?: { [key: string]: string };
    bond_inference_mode?: BondInferenceMode;
    include_bond_diagnostics?: boolean;
}

export const bondService = {
    // Recompute bond topology / h-bonds for a structure given the current bond
    // overrides and thresholds. Returns the fresh Visualization payload.
    updateVisualization: async (
        request: UpdateVisualizationRequest,
    ): Promise<Visualization> => {
        const { structure, ...params } = request;
        const response = await apiClient.post<Visualization>('/structure/update_visualization', {
            structure,
            params,
        });
        return response.data;
    },

    deleteBonds: async (
        structure: Structure,
        bondIds: string[],
        currentOverrides: { [key: string]: string } | null,
        bondScale: number,
    ): Promise<StandardStructureObject> => {
        const response = await apiClient.post<StandardStructureObject>('/edit/delete_bonds', {
            structure,
            bond_ids: bondIds,
            bond_overrides: currentOverrides,
            bond_scale: bondScale,
        });
        return response.data;
    },

    createBond: async (
        structure: Structure,
        bondId: string,
        currentOverrides: { [key: string]: string } | null,
        bondScale: number,
    ): Promise<StandardStructureObject> => {
        const response = await apiClient.post<StandardStructureObject>('/edit/create_bond', {
            structure,
            bond_id: bondId,
            bond_overrides: currentOverrides,
            bond_scale: bondScale,
        });
        return response.data;
    },

    // Translate every atom by a cartesian (Å) or lattice (fractional) vector,
    // optionally wrapping into the cell. Returns a full recomputed document.
    translateStructure: async (
        structure: Structure,
        translationVector: [number, number, number],
        vectorType: 'cartesian' | 'lattice',
        wrap: boolean,
    ): Promise<StandardStructureObject> => {
        const response = await apiClient.post<StandardStructureObject>('/edit/translate_structure', {
            structure,
            translation_vector: translationVector,
            vector_type: vectorType,
            wrap,
        });
        return response.data;
    },

    // Replicate the structure into an N×M×K supercell.
    buildSupercell: async (
        structure: Structure,
        repetitions: [number, number, number],
    ): Promise<StandardStructureObject> => {
        const response = await apiClient.post<StandardStructureObject>('/edit/supercell', {
            structure,
            repetitions,
        });
        return response.data;
    },
};
