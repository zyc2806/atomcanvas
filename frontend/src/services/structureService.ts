import apiClient from './apiClient';
import type {
    StandardStructureObject,
    Structure,
} from '../types/store';

export type ExportScope = 'current_frame';

export interface ExportWarning {
    code: string;
    severity: 'error' | 'warning' | 'info';
    message: string;
    details?: Record<string, string>;
}

export interface ExportRequestPayload {
    format: string;
    scope: ExportScope;
    structure: Structure;
    fixed_atoms?: number[];
    structure_version: number;
    file_name?: string;
}

export interface ExportResponsePayload {
    blob: Blob;
    warnings: ExportWarning[];
    filename?: string;
}

interface BuildExportPayloadParams {
    structureData: StandardStructureObject;
    scope: ExportScope;
    format: string;
    structureVersion: number;
}

const parseWarningsHeader = (rawHeader: unknown): ExportWarning[] => {
    if (!rawHeader || typeof rawHeader !== 'string') {
        return [];
    }
    try {
        const parsed = JSON.parse(rawHeader);
        if (!Array.isArray(parsed)) {
            return [];
        }
        return parsed as ExportWarning[];
    } catch {
        return [];
    }
};

const HARD_BLOCK_CODES = new Set([
    'PERIODIC_NOT_SUPPORTED',
    'PERIODIC_REQUIRED',
    'UNKNOWN_FORMAT',
]);

const WARNING_TEXT_BY_CODE: Record<string, string> = {
    CONSTRAINTS_DROPPED: 'Selected format does not preserve fixed-atom constraints.',
    PERIODIC_NOT_SUPPORTED: 'Selected format does not support periodic structures.',
    PERIODIC_REQUIRED: 'Selected format requires periodic structure data.',
};

export const isHardBlockCode = (code: string): boolean => HARD_BLOCK_CODES.has(code);

export const formatExportWarning = (warning: ExportWarning): string => {
    const mapped = WARNING_TEXT_BY_CODE[warning.code];
    return mapped ? `[${warning.code}] ${mapped}` : `[${warning.code}] ${warning.message}`;
};

const parseFilenameFromContentDisposition = (rawHeader: unknown): string | undefined => {
    if (!rawHeader || typeof rawHeader !== 'string') {
        return undefined;
    }
    const match = rawHeader.match(/filename="?([^";]+)"?/i);
    return match?.[1];
};

export const buildExportPayload = ({
    structureData,
    scope,
    format,
    structureVersion,
}: BuildExportPayloadParams): ExportRequestPayload => ({
    format,
    scope,
    structure: structureData.structure,
    fixed_atoms: structureData.visualization.fixed_atoms ?? [],
    structure_version: structureVersion,
});

export const structureService = {
    uploadStructure: async (file: File): Promise<StandardStructureObject> => {
        const formData = new FormData();
        formData.append('file', file);
        const response = await apiClient.post<StandardStructureObject>('/structure/upload', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            // Uploads can be slow over a tunneled backend; opt out of the default timeout.
            timeout: 0,
        });
        return response.data;
    },

    exportStructure: async (payload: ExportRequestPayload): Promise<ExportResponsePayload> => {
        const response = await apiClient.post<Blob>('/structure/export', payload, {
            responseType: 'blob',
        });

        const warnings = parseWarningsHeader(response.headers?.['x-export-warnings']);
        const filename = parseFilenameFromContentDisposition(response.headers?.['content-disposition']);

        return {
            blob: response.data,
            warnings,
            filename,
        };
    },
};
