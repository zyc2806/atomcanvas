import { getCentroid } from '../../utils/geoUtils';
import type { Structure } from '../../types/store';

interface GizmoTargetCenterInput {
    viewTarget: [number, number, number] | null;
    structure?: Structure;
}

export const resolveGizmoTargetCenter = ({
    viewTarget,
    structure,
}: GizmoTargetCenterInput): [number, number, number] => {
    if (viewTarget) return [...viewTarget];

    if (!structure) return [0, 0, 0];

    const hasPBC = structure.pbc?.some((value) => value) ?? false;
    const positions = hasPBC && structure.wrapped_positions.length > 0
        ? structure.wrapped_positions
        : structure.positions;

    return positions.length > 0 ? getCentroid(positions) : [0, 0, 0];
};
