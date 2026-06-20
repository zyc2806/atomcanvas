const isFiniteTriplet = (point: [number, number, number] | undefined): point is [number, number, number] => {
  if (!point) return false;
  return Number.isFinite(point[0]) && Number.isFinite(point[1]) && Number.isFinite(point[2]);
};

export const isRenderableRegularBond = (
  idx1: number,
  idx2: number,
  positions: [number, number, number][],
): boolean => {
  if (idx1 === idx2) return false;
  if (idx1 < 0 || idx2 < 0) return false;
  if (idx1 >= positions.length || idx2 >= positions.length) return false;

  const start = positions[idx1];
  const end = positions[idx2];
  if (!isFiniteTriplet(start) || !isFiniteTriplet(end)) return false;

  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const dz = end[2] - start[2];
  const lengthSq = dx * dx + dy * dy + dz * dz;
  return lengthSq > 1e-12;
};

export const isRenderableGhostBond = (
  startPos: [number, number, number],
  endPos: [number, number, number],
  atomIdx: number,
  otherIdx: number,
  atomCount: number,
): boolean => {
  if (atomIdx === otherIdx) return false;
  if (atomIdx < 0 || otherIdx < 0) return false;
  if (atomIdx >= atomCount || otherIdx >= atomCount) return false;
  if (!isFiniteTriplet(startPos) || !isFiniteTriplet(endPos)) return false;

  const dx = endPos[0] - startPos[0];
  const dy = endPos[1] - startPos[1];
  const dz = endPos[2] - startPos[2];
  const lengthSq = dx * dx + dy * dy + dz * dz;
  return lengthSq > 1e-12;
};
