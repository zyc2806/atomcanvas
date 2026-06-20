import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildExportPayload, structureService } from './structureService';
import apiClient from './apiClient';
import type { StandardStructureObject, Structure } from '../types/store';

vi.mock('./apiClient', () => ({ default: { post: vi.fn() } }));
const mockedPost = vi.mocked(apiClient.post);

const makeStructure = (): Structure => ({
    symbols: ['H', 'O'],
    positions: [[0, 0, 0], [0, 0, 0.96]],
    wrapped_positions: [[0, 0, 0], [0, 0, 0.96]],
});

const makeViz = () => ({
    bonds: [] as [number, number, number][],
    wrapped_ghost_bonds: [] as never[],
    h_bond_geometries: [] as never[],
    unwrapped_h_bonds: [] as never[],
});

const makeDoc = (trajectory?: Structure[]): StandardStructureObject => ({
    structure: makeStructure(),
    visualization: makeViz(),
    ...(trajectory !== undefined ? { trajectory } : {}),
});

describe('buildExportPayload', () => {
    it('scope=current_frame does NOT include trajectory', () => {
        const frames = [makeStructure(), makeStructure()];
        const doc = makeDoc(frames);
        const payload = buildExportPayload({
            structureData: doc,
            scope: 'current_frame',
            format: 'xyz',
            structureVersion: 1,
        });
        expect(payload.trajectory).toBeUndefined();
        expect(payload.scope).toBe('current_frame');
    });

    it('scope=full_trajectory WITH trajectory includes it', () => {
        const frames = [makeStructure(), makeStructure()];
        const doc = makeDoc(frames);
        const payload = buildExportPayload({
            structureData: doc,
            scope: 'full_trajectory',
            format: 'extxyz',
            structureVersion: 2,
        });
        expect(payload.trajectory).toEqual(frames);
        expect(payload.scope).toBe('full_trajectory');
    });

    it('scope=full_trajectory WITHOUT trajectory omits the field', () => {
        const doc = makeDoc(); // no trajectory
        const payload = buildExportPayload({
            structureData: doc,
            scope: 'full_trajectory',
            format: 'extxyz',
            structureVersion: 3,
        });
        expect(payload.trajectory).toBeUndefined();
        expect(payload.scope).toBe('full_trajectory');
    });

    it('scope=full_trajectory with empty trajectory omits the field', () => {
        const doc = makeDoc([]); // empty array — falsy length
        const payload = buildExportPayload({
            structureData: doc,
            scope: 'full_trajectory',
            format: 'extxyz',
            structureVersion: 4,
        });
        expect(payload.trajectory).toBeUndefined();
    });
});

describe('structureService.exportStructure error surfacing', () => {
    beforeEach(() => mockedPost.mockReset());

    const req = (format: string) => ({
        format,
        scope: 'current_frame' as const,
        structure: makeStructure(),
        structure_version: 1,
    });

    it('surfaces the backend detail.message from a Blob error body (responseType blob)', async () => {
        // With responseType:'blob', the JSON 409 body arrives as a Blob, so axios's
        // default message is only "...status code 409". We must read it back.
        const body = JSON.stringify({
            detail: { code: 'PERIODIC_REQUIRED', message: "Format 'vasp' requires periodic structure data." },
        });
        const blob = new Blob([body], { type: 'application/json' });
        // jsdom's Blob lacks a working .text(); real browsers (and axios's blob
        // responses) provide it — supply one so we exercise the real parse path.
        (blob as unknown as { text: () => Promise<string> }).text = async () => body;
        mockedPost.mockRejectedValueOnce({ response: { status: 409, data: blob } });
        await expect(structureService.exportStructure(req('vasp'))).rejects.toThrow(
            /requires periodic structure data/,
        );
    });

    it('re-throws the original error when there is no parseable backend detail', async () => {
        mockedPost.mockRejectedValueOnce(new Error('Network Error'));
        await expect(structureService.exportStructure(req('xyz'))).rejects.toThrow('Network Error');
    });
});
