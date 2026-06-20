import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { pickAtomMaterialKind, buildInstanceColors } from './materialKind';

describe('pickAtomMaterialKind', () => {
  it('selects the toon material for cartoon render style', () => {
    expect(pickAtomMaterialKind('cartoon')).toBe('toon');
  });

  it('selects the standard material for standard render style', () => {
    expect(pickAtomMaterialKind('standard')).toBe('standard');
  });

  it('selects the standard material for soft render style', () => {
    expect(pickAtomMaterialKind('soft')).toBe('standard');
  });
});

describe('buildInstanceColors', () => {
  it('returns an empty buffer for no colors', () => {
    const out = buildInstanceColors([]);
    expect(out).toBeInstanceOf(Float32Array);
    expect(out.length).toBe(0);
  });

  it('flattens colors into 3 floats per instance in order', () => {
    const colors = [
      new THREE.Color(1, 0, 0),
      new THREE.Color(0, 0.5, 0),
      new THREE.Color(0, 0, 1),
    ];
    const out = buildInstanceColors(colors);
    expect(out.length).toBe(9);
    // r,g,b for instance 0
    expect(out[0]).toBeCloseTo(1);
    expect(out[1]).toBeCloseTo(0);
    expect(out[2]).toBeCloseTo(0);
    // instance 1
    expect(out[3]).toBeCloseTo(0);
    expect(out[4]).toBeCloseTo(0.5);
    expect(out[5]).toBeCloseTo(0);
    // instance 2
    expect(out[6]).toBeCloseTo(0);
    expect(out[7]).toBeCloseTo(0);
    expect(out[8]).toBeCloseTo(1);
  });

  it('preserves per-instance order so setColorAt(i) maps to instance i', () => {
    const a = new THREE.Color(0.2, 0.4, 0.6);
    const b = new THREE.Color(0.7, 0.8, 0.9);
    const out = buildInstanceColors([a, b]);
    expect(Array.from(out.slice(0, 3))).toEqual([
      expect.closeTo(a.r),
      expect.closeTo(a.g),
      expect.closeTo(a.b),
    ]);
    expect(Array.from(out.slice(3, 6))).toEqual([
      expect.closeTo(b.r),
      expect.closeTo(b.g),
      expect.closeTo(b.b),
    ]);
  });
});
