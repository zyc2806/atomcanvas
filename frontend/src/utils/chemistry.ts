/**
 * Chemistry utility functions for bond calculations.
 * Ported from ase-view-web/frontend/scripts/benchmark_js_full.cjs
 */

export const elementToNumber: { [key: string]: number } = {
  'H': 1, 'He': 2, 'Li': 3, 'Be': 4, 'B': 5, 'C': 6, 'N': 7, 'O': 8, 'F': 9, 'Ne': 10,
  'Na': 11, 'Mg': 12, 'Al': 13, 'Si': 14, 'P': 15, 'S': 16, 'Cl': 17, 'Ar': 18, 'K': 19, 'Ca': 20,
  'Sc': 21, 'Ti': 22, 'V': 23, 'Cr': 24, 'Mn': 25, 'Fe': 26, 'Co': 27, 'Ni': 28, 'Cu': 29, 'Zn': 30,
  'Ga': 31, 'Ge': 32, 'As': 33, 'Se': 34, 'Br': 35, 'Kr': 36, 'Rb': 37, 'Sr': 38, 'Y': 39, 'Zr': 40,
  'Nb': 41, 'Mo': 42, 'Tc': 43, 'Ru': 44, 'Rh': 45, 'Pd': 46, 'Ag': 47, 'Cd': 48, 'In': 49, 'Sn': 50,
  'Sb': 51, 'Te': 52, 'I': 53, 'Xe': 54, 'Cs': 55, 'Ba': 56, 'La': 57, 'Ce': 58, 'Pr': 59, 'Nd': 60,
  'Pm': 61, 'Sm': 62, 'Eu': 63, 'Gd': 64, 'Tb': 65, 'Dy': 66, 'Ho': 67, 'Er': 68, 'Tm': 69, 'Yb': 70,
  'Lu': 71, 'Hf': 72, 'Ta': 73, 'W': 74, 'Re': 75, 'Os': 76, 'Ir': 77, 'Pt': 78, 'Au': 79, 'Hg': 80,
  'Tl': 81, 'Pb': 82, 'Bi': 83, 'Po': 84, 'At': 85, 'Rn': 86, 'Fr': 87, 'Ra': 88, 'Ac': 89, 'Th': 90,
  'Pa': 91, 'U': 92, 'Np': 93, 'Pu': 94, 'Am': 95, 'Cm': 96, 'Bk': 97, 'Cf': 98, 'Es': 99, 'Fm': 100,
  'Md': 101, 'No': 102, 'Lr': 103, 'Rf': 104, 'Db': 105, 'Sg': 106, 'Bh': 107, 'Hs': 108, 'Mt': 109,
  'Ds': 110, 'Rg': 111, 'Cn': 112, 'Nh': 113, 'Fl': 114, 'Mc': 115, 'Lv': 116, 'Ts': 117, 'Og': 118
};

export function getAtomicNumber(symbol: string): number {
  return elementToNumber[symbol] || 0;
}

export type Vector3 = [number, number, number];

export interface Structure {
  positions: number[][]; // [x, y, z][]
  numbers: number[];     // Atomic numbers
  cell: number[][];      // 3x3 matrix
  pbc: boolean[];        // Periodic boundary conditions
}

export type Bond = [number, number];

// Helper for vector magnitude squared
function magSq(v: Vector3): number {
  return v[0] * v[0] + v[1] * v[1] + v[2] * v[2];
}

// Helper for vector magnitude
function mag(v: Vector3): number {
  return Math.sqrt(magSq(v));
}

// Helper for dot product
function dot(a: Vector3, b: Vector3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/**
 * Minimum Image Convention (MIC) for orthogonal cells.
 * Simplified version as per original JS implementation.
 */
function find_mic(v: Vector3, cell: number[][], pbc: boolean[]): Vector3 {
  const result: Vector3 = [v[0], v[1], v[2]];
  
  // Only apply MIC if PBC is enabled for that dimension?
  // The original JS code didn't check pbc array, but it's good practice.
  // However, to strictly port the logic and ensure "flying bonds" are handled 
  // by the visual check, we should follow the JS logic which applies MIC based on cell dimensions.
  // The prompt explicitly mentions `pbc` as input, so we should probably use it.
  // But standard ASE behavior applies MIC if PBC is true.
  // Let's stick to the JS logic which just checks cell[i][i] > 0, 
  // but we'll add the pbc check if provided to be more correct.
  
  for (let i = 0; i < 3; i++) {
    if (pbc[i]) {
      const L = cell[i][i];
      if (L > 0) {
        result[i] -= Math.round(result[i] / L) * L;
      }
    }
  }
  return result;
}

/**
 * Calculate covalent bonds based on atomic radii.
 * Includes visual filtering to prevent "flying bonds" across PBC.
 */
export function calculateBonds(
  positions: number[][],
  numbers: number[],
  cell: number[][],
  pbc: boolean[],
  radii: number[],
  bondScale: number = 1.15
): Bond[] {
  const bonds: Bond[] = [];
  const n = positions.length;
  const atomRadii = numbers.map((num) => radii[num] || 0.0); // Fallback to 0 if unknown

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const p1 = positions[i];
      const p2 = positions[j];

      const dx = p2[0] - p1[0];
      const dy = p2[1] - p1[1];
      const dz = p2[2] - p1[2];

      // 1. Topology Check (MIC)
      const vRaw: Vector3 = [dx, dy, dz];
      const vMic = find_mic(vRaw, cell, pbc);
      const distMic = mag(vMic);

      const cutoff = (atomRadii[i] + atomRadii[j]) * bondScale;

      if (distMic <= cutoff) {
        // 2. Visual Check (Euclidean)
        // If the visual distance (straight line) is significantly larger than the cutoff,
        // it means the bond wraps around the periodic boundary.
        // We filter these out for visualization purposes ("flying bonds").
        const distVisual = mag(vRaw);
        
        // Heuristic: if visual distance is > 1.5x the bond length, it's likely a PBC bond
        // that shouldn't be drawn as a long line across the screen.
        if (distVisual <= cutoff * 1.5) {
          bonds.push([i, j]);
        }
      }
    }
  }

  return bonds;
}

/**
 * Calculate Hydrogen Bonds.
 * Criteria:
 * 1. H is covalently bonded to a donor (N, O, F).
 * 2. H is within distance of an acceptor (N, O, F).
 * 3. Angle D-H...A is > angleMin (default 120 deg).
 */
export function calculateHBonds(
  positions: number[][],
  numbers: number[],
  symbols: string[], // Need symbols for element checking
  cell: number[][],
  pbc: boolean[],
  radii: number[],
  distMax: number = 3.5,
  angleMin: number = 120
): Bond[] {
  const hBonds: Bond[] = [];
  const n = positions.length;
  const atomRadii = numbers.map((num) => radii[num] || 0.0);

  const donorSymbols = new Set(['N', 'O', 'F']);
  const acceptorSymbols = new Set(['N', 'O', 'F']);

  // 1. Find covalent bonds to H (mult=1.2)
  // Store as [H_idx, Donor_idx, dist]
  const hCovalentBonds: [number, number, number][] = [];

  for (let i = 0; i < n; i++) {
    if (symbols[i] === 'H') {
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        
        if (donorSymbols.has(symbols[j])) {
          const p1 = positions[i]; // H
          const p2 = positions[j]; // Donor

          const dx = p2[0] - p1[0];
          const dy = p2[1] - p1[1];
          const dz = p2[2] - p1[2];

          const vRaw: Vector3 = [dx, dy, dz];
          const vMic = find_mic(vRaw, cell, pbc);
          const distMic = mag(vMic);

          const cutoff = (atomRadii[i] + atomRadii[j]) * 1.2;

          if (distMic <= cutoff) {
            hCovalentBonds.push([i, j, distMic]);
          }
        }
      }
    }
  }

  // 2. For each H, find acceptors and check angles
  // Map H_idx -> { acceptor_idx, dist, angle }
  const hToBestHBond = new Map<number, { acceptor_idx: number; dist: number; angle: number }>();

  for (const [hIdx, dIdx] of hCovalentBonds) {
    for (let aIdx = 0; aIdx < n; aIdx++) {
      if (aIdx === dIdx || aIdx === hIdx) continue;

      if (acceptorSymbols.has(symbols[aIdx])) {
        // H...A distance
        const pH = positions[hIdx];
        const pA = positions[aIdx];
        const pD = positions[dIdx];

        const dxHA = pA[0] - pH[0];
        const dyHA = pA[1] - pH[1];
        const dzHA = pA[2] - pH[2];

        const vHA_Raw: Vector3 = [dxHA, dyHA, dzHA];
        const vHA_Mic = find_mic(vHA_Raw, cell, pbc);
        const distHA = mag(vHA_Mic);

        if (distHA <= distMax) {
          // Angle D-H...A
          // Vector HD = D - H
          const dxHD = pD[0] - pH[0];
          const dyHD = pD[1] - pH[1];
          const dzHD = pD[2] - pH[2];
          
          const vHD_Raw: Vector3 = [dxHD, dyHD, dzHD];
          const vHD_Mic = find_mic(vHD_Raw, cell, pbc);

          // Calculate angle
          // cos(theta) = (vHD . vHA) / (|vHD| * |vHA|)
          const dotProd = dot(vHD_Mic, vHA_Mic);
          const magHD = mag(vHD_Mic);
          const magHA = distHA; // Already calculated

          if (magHD > 0 && magHA > 0) {
            const cosTheta = dotProd / (magHD * magHA);
            // Clamp for safety
            const clampedCos = Math.max(-1, Math.min(1, cosTheta));
            const angle = Math.acos(clampedCos) * (180 / Math.PI);

            if (angle > angleMin) {
              // Visual Check for H...A bond
              // We only want to draw it if it doesn't fly across the screen
              const distVisual = mag(vHA_Raw);
              
              // Use a heuristic for visual cutoff, e.g., distMax * 1.5
              if (distVisual <= distMax * 1.5) {
                // Keep the best one (shortest distance)
                const currentBest = hToBestHBond.get(hIdx);
                if (!currentBest || distHA < currentBest.dist) {
                  hToBestHBond.set(hIdx, { acceptor_idx: aIdx, dist: distHA, angle });
                }
              }
            }
          }
        }
      }
    }
  }

  // Convert map to array
  for (const [hIdx, data] of hToBestHBond) {
    hBonds.push([hIdx, data.acceptor_idx]);
  }

  return hBonds;
}
