export const getNearestAtomIndexToRing = (
    ringCenter: readonly [number, number, number],
    positions: [number, number, number][],
): number | null => {
    if (!positions || positions.length === 0) return null;

    let nearestIndex = 0;
    let nearestDistanceSq = Number.POSITIVE_INFINITY;

    for (let index = 0; index < positions.length; index += 1) {
        const [x, y, z] = positions[index];
        const dx = x - ringCenter[0];
        const dy = y - ringCenter[1];
        const dz = z - ringCenter[2];
        const distanceSq = dx * dx + dy * dy + dz * dz;

        if (distanceSq < nearestDistanceSq) {
            nearestDistanceSq = distanceSq;
            nearestIndex = index;
        }
    }

    return nearestIndex;
};
