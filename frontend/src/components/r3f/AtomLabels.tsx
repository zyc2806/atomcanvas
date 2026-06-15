import React, { useEffect, useMemo } from 'react';
import { CanvasTexture } from 'three';
import { buildAtomLabels } from './atomLabelData';

/**
 * World-space persistent atom labels, gated on viewControls.showLabels.
 *
 * Each label is a camera-facing sprite carrying a CanvasTexture of the atom's
 * element symbol + per-element index (mirrors the AxesGizmo label sprites).
 * depthTest is off so labels read on top of the atoms. Textures are cached per
 * distinct text and disposed when the set changes, so structures with many
 * repeated elements allocate only a handful of textures.
 */

interface AtomLabelsProps {
  symbols: string[];
  positions: readonly (readonly number[])[];
  showLabels: boolean;
}

function makeLabelTexture(text: string): CanvasTexture | null {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.clearRect(0, 0, 128, 64);
  ctx.fillStyle = '#000000';
  ctx.font = 'bold 40px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 64, 34);
  const tex = new CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

const AtomLabels: React.FC<AtomLabelsProps> = ({ symbols, positions, showLabels }) => {
  const labels = useMemo(
    () => buildAtomLabels(symbols, positions, showLabels),
    [symbols, positions, showLabels],
  );

  // One texture per distinct label text (bounded by element × max-index).
  const textures = useMemo(() => {
    const map = new Map<string, CanvasTexture>();
    for (const l of labels) {
      if (!map.has(l.text)) {
        const t = makeLabelTexture(l.text);
        if (t) map.set(l.text, t);
      }
    }
    return map;
  }, [labels]);

  useEffect(() => () => textures.forEach((t) => t.dispose()), [textures]);

  if (labels.length === 0) return null;

  return (
    <group>
      {labels.map((l) => {
        const tex = textures.get(l.text);
        if (!tex) return null;
        return (
          <sprite key={l.key} position={l.position} scale={[0.8, 0.4, 0.8]}>
            <spriteMaterial
              map={tex}
              transparent
              depthTest={false}
              depthWrite={false}
              toneMapped={false}
            />
          </sprite>
        );
      })}
    </group>
  );
};

export default AtomLabels;
