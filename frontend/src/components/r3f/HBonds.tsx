import React, { useMemo } from 'react';
import useStructureStore from '../../store/useStructureStore';

interface HBondsProps {
    bonds?: [number, number][]; // Index pairs
    positions?: [number, number, number][]; // Coordinates
}

const HBonds: React.FC<HBondsProps> = ({ bonds, positions }) => {
    const { structureData, visParams } = useStructureStore();
    const { hBondColor, hBondDashSize, hBondGapSize } = visParams;

    const { positionsBuffer, distancesBuffer } = useMemo(() => {
        const bondPairs: [number, number][] | undefined = bonds;
        const atomPositions: [number, number, number][] | undefined = positions;
        let coordinatePairs: [number[], number[]][] | undefined;

        // Fallback to store if props are missing
        if (!bondPairs || !atomPositions) {
            // Check if store has H-bonds defined as coordinate pairs (current behavior)
            const storeHBonds = structureData?.visualization?.unwrapped_h_bonds?.length 
                ? structureData.visualization.unwrapped_h_bonds 
                : structureData?.visualization?.h_bond_geometries;

            if (storeHBonds && storeHBonds.length > 0) {
                coordinatePairs = storeHBonds as [number[], number[]][];
            }
        }

        const segments: number[] = [];
        const lineDistances: number[] = [];

        const addSegment = (start: number[] | readonly number[], end: number[] | readonly number[]) => {
            const x1 = start[0], y1 = start[1], z1 = start[2];
            const x2 = end[0], y2 = end[1], z2 = end[2];

            segments.push(x1, y1, z1);
            segments.push(x2, y2, z2);

            // Calculate distance for dashed line
            const dx = x2 - x1;
            const dy = y2 - y1;
            const dz = z2 - z1;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

            // Add line distances (0 for start, dist for end) to ensure dash pattern starts fresh
            lineDistances.push(0);
            lineDistances.push(dist);
        };

        if (bondPairs && atomPositions) {
            for (let i = 0; i < bondPairs.length; i++) {
                const [idx1, idx2] = bondPairs[i];
                const start = atomPositions[idx1];
                const end = atomPositions[idx2];
                if (start && end) {
                    addSegment(start, end);
                }
            }
        }

        if (coordinatePairs) {
            for (let i = 0; i < coordinatePairs.length; i++) {
                const [start, end] = coordinatePairs[i];
                if (start && end) {
                    addSegment(start, end);
                }
            }
        }

        return {
            positionsBuffer: new Float32Array(segments),
            distancesBuffer: new Float32Array(lineDistances)
        };
    }, [bonds, positions, structureData]);

    if (positionsBuffer.length === 0) return null;

    return (
        <lineSegments>
            <bufferGeometry>
                <bufferAttribute
                    attach="attributes-position"
                    args={[positionsBuffer, 3]}
                />
                <bufferAttribute
                    attach="attributes-lineDistance"
                    args={[distancesBuffer, 1]}
                />
            </bufferGeometry>
            <lineDashedMaterial
                color={hBondColor}
                dashSize={hBondDashSize}
                gapSize={hBondGapSize}
                scale={1}
            />
        </lineSegments>
    );
};

export default HBonds;
