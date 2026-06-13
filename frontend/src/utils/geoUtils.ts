/**
 * Calculates the centroid (average position) of a set of points.
 * @param positions Array of [x, y, z] coordinates
 * @returns The centroid as [x, y, z]
 */
export const getCentroid = (positions: [number, number, number][]): [number, number, number] => {
  if (positions.length === 0) return [0, 0, 0];

  const sum = positions.reduce(
    (acc, pos) => [acc[0] + pos[0], acc[1] + pos[1], acc[2] + pos[2]],
    [0, 0, 0]
  );

  return [
    sum[0] / positions.length,
    sum[1] / positions.length,
    sum[2] / positions.length,
  ];
};
