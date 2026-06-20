import { describe, it, expect } from 'vitest';
import {
    computeLod,
    LOD_FULL_DETAIL_MAX,
    LOD_REDUCED_MAX,
    LOD_NO_OUTLINE_MAX,
} from './lod';

describe('computeLod', () => {
    describe('tier boundaries (constants)', () => {
        it('LOD_FULL_DETAIL_MAX is 2000', () => {
            expect(LOD_FULL_DETAIL_MAX).toBe(2_000);
        });
        it('LOD_REDUCED_MAX is 20000', () => {
            expect(LOD_REDUCED_MAX).toBe(20_000);
        });
        it('LOD_NO_OUTLINE_MAX is 100000', () => {
            expect(LOD_NO_OUTLINE_MAX).toBe(100_000);
        });
    });

    describe('full-detail tier (n < 2000)', () => {
        it('returns full detail for 0 atoms', () => {
            expect(computeLod(0)).toEqual({
                sphereSegments: 32,
                cylinderRadialSegments: 8,
                showOutlines: true,
                showBonds: true,
                enableAO: true,
                showLabels: true,
            });
        });

        it('returns full detail for 1 atom', () => {
            expect(computeLod(1)).toEqual({
                sphereSegments: 32,
                cylinderRadialSegments: 8,
                showOutlines: true,
                showBonds: true,
                enableAO: true,
                showLabels: true,
            });
        });

        it('returns full detail for 1000 atoms', () => {
            expect(computeLod(1000)).toEqual({
                sphereSegments: 32,
                cylinderRadialSegments: 8,
                showOutlines: true,
                showBonds: true,
                enableAO: true,
                showLabels: true,
            });
        });

        it('returns full detail for 1999 (strictly less than 2000)', () => {
            expect(computeLod(1999)).toEqual({
                sphereSegments: 32,
                cylinderRadialSegments: 8,
                showOutlines: true,
                showBonds: true,
                enableAO: true,
                showLabels: true,
            });
        });
    });

    describe('boundary: 2000 lands in reduced tier', () => {
        it('2000 is NOT full-detail (< is strict)', () => {
            const result = computeLod(2000);
            expect(result.sphereSegments).toBe(16);
        });

        it('returns reduced tier for 2000 atoms', () => {
            expect(computeLod(2000)).toEqual({
                sphereSegments: 16,
                cylinderRadialSegments: 6,
                showOutlines: true,
                showBonds: true,
                enableAO: true,
                showLabels: true,
            });
        });
    });

    describe('reduced tier (2000 <= n < 20000)', () => {
        it('returns reduced detail for 10000 atoms', () => {
            expect(computeLod(10_000)).toEqual({
                sphereSegments: 16,
                cylinderRadialSegments: 6,
                showOutlines: true,
                showBonds: true,
                enableAO: true,
                showLabels: true,
            });
        });

        it('returns reduced detail for 19999 (strictly less than 20000)', () => {
            expect(computeLod(19_999)).toEqual({
                sphereSegments: 16,
                cylinderRadialSegments: 6,
                showOutlines: true,
                showBonds: true,
                enableAO: true,
                showLabels: true,
            });
        });
    });

    describe('boundary: 20000 lands in no-outline tier', () => {
        it('20000 is NOT reduced-tier (< is strict)', () => {
            const result = computeLod(20_000);
            expect(result.sphereSegments).toBe(12);
        });

        it('returns no-outline tier for 20000 atoms', () => {
            expect(computeLod(20_000)).toEqual({
                sphereSegments: 12,
                cylinderRadialSegments: 6,
                showOutlines: false,
                showBonds: true,
                enableAO: false,
                showLabels: true,
            });
        });
    });

    describe('no-outline tier (20000 <= n < 100000)', () => {
        it('returns no-outline settings for 50000 atoms', () => {
            expect(computeLod(50_000)).toEqual({
                sphereSegments: 12,
                cylinderRadialSegments: 6,
                showOutlines: false,
                showBonds: true,
                enableAO: false,
                showLabels: true,
            });
        });

        it('returns no-outline settings for 99999 (strictly less than 100000)', () => {
            expect(computeLod(99_999)).toEqual({
                sphereSegments: 12,
                cylinderRadialSegments: 6,
                showOutlines: false,
                showBonds: true,
                enableAO: false,
                showLabels: true,
            });
        });
    });

    describe('boundary: 100000 lands in no-bonds tier', () => {
        it('100000 is NOT no-outline-tier (< is strict)', () => {
            const result = computeLod(100_000);
            expect(result.showBonds).toBe(false);
        });

        it('returns lowest tier for 100000 atoms', () => {
            expect(computeLod(100_000)).toEqual({
                sphereSegments: 8,
                cylinderRadialSegments: 4,
                showOutlines: false,
                showBonds: false,
                enableAO: false,
                showLabels: false,
            });
        });
    });

    describe('top tier (n >= 100000)', () => {
        it('returns lowest detail for 500000 atoms', () => {
            expect(computeLod(500_000)).toEqual({
                sphereSegments: 8,
                cylinderRadialSegments: 4,
                showOutlines: false,
                showBonds: false,
                enableAO: false,
                showLabels: false,
            });
        });

        it('returns lowest detail for 1000000 atoms', () => {
            expect(computeLod(1_000_000)).toEqual({
                sphereSegments: 8,
                cylinderRadialSegments: 4,
                showOutlines: false,
                showBonds: false,
                enableAO: false,
                showLabels: false,
            });
        });
    });

    describe('edge cases — clamp to full detail', () => {
        it('negative atomCount clamps to full detail', () => {
            expect(computeLod(-1)).toEqual({
                sphereSegments: 32,
                cylinderRadialSegments: 8,
                showOutlines: true,
                showBonds: true,
                enableAO: true,
                showLabels: true,
            });
        });

        it('NaN clamps to full detail', () => {
            expect(computeLod(NaN)).toEqual({
                sphereSegments: 32,
                cylinderRadialSegments: 8,
                showOutlines: true,
                showBonds: true,
                enableAO: true,
                showLabels: true,
            });
        });

        it('Infinity clamps to full detail (non-finite)', () => {
            expect(computeLod(Infinity)).toEqual({
                sphereSegments: 32,
                cylinderRadialSegments: 8,
                showOutlines: true,
                showBonds: true,
                enableAO: true,
                showLabels: true,
            });
        });

        it('-Infinity clamps to full detail', () => {
            expect(computeLod(-Infinity)).toEqual({
                sphereSegments: 32,
                cylinderRadialSegments: 8,
                showOutlines: true,
                showBonds: true,
                enableAO: true,
                showLabels: true,
            });
        });
    });
});
