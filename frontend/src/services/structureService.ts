import apiClient from './apiClient';
import type {
    StandardStructureObject,
    Structure,
} from '../types/store';

export type ExportScope = 'current_frame' | 'full_trajectory';

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
    trajectory?: Structure[];
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

const detailMessageFrom = (parsed: unknown): string | null => {
    const detail = (parsed as { detail?: unknown })?.detail;
    if (detail && typeof detail === 'object') {
        const d = detail as { message?: unknown; code?: unknown };
        if (typeof d.message === 'string') return d.message;
        if (typeof d.code === 'string') return d.code;
    }
    if (typeof detail === 'string') return detail;
    return null;
};

// Export requests use `responseType: 'blob'`, so a JSON error body (e.g. a 409
// PERIODIC_REQUIRED) arrives as a Blob and axios surfaces only the bare status
// line ("...status code 409"). Read the body back so the UI can show the
// backend's actual `detail.message` (e.g. "Format 'vasp' requires periodic data").
const backendErrorMessage = async (error: unknown): Promise<string | null> => {
    const data = (error as { response?: { data?: unknown } })?.response?.data;
    if (data instanceof Blob) {
        try {
            return detailMessageFrom(JSON.parse(await data.text()));
        } catch {
            return null;
        }
    }
    if (typeof data === 'string') {
        try {
            return detailMessageFrom(JSON.parse(data));
        } catch {
            return null;
        }
    }
    if (data && typeof data === 'object') {
        return detailMessageFrom(data);
    }
    return null;
};

export const buildExportPayload = ({
    structureData,
    scope,
    format,
    structureVersion,
}: BuildExportPayloadParams): ExportRequestPayload => {
    const payload: ExportRequestPayload = {
        format,
        scope,
        structure: structureData.structure,
        fixed_atoms: structureData.visualization.fixed_atoms ?? [],
        structure_version: structureVersion,
    };
    if (scope === 'full_trajectory' && structureData.trajectory?.length) {
        payload.trajectory = structureData.trajectory;
    }
    return payload;
};

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
        try {
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
        } catch (error) {
            // Surface the backend's detail.message (hidden inside the Blob body
            // by responseType:'blob') instead of axios's bare "...status code N".
            const message = await backendErrorMessage(error);
            if (message) throw new Error(message);
            throw error;
        }
    },
};
