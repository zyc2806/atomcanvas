import { useCallback, useMemo } from 'react';
import * as THREE from 'three';
import useStructureStore from '../store/useStructureStore';

const useAtomColors = () => {
    const { selectedAtoms, colorOverrides, opacityOverrides, atomStyles, structureData } = useStructureStore();
    const fixedAtomSet = useMemo(
        () => new Set(structureData?.visualization?.fixed_atoms ?? []),
        [structureData?.visualization?.fixed_atoms],
    );

    const getAtomBaseColor = useCallback((symbol: string) => {
        const color = new THREE.Color();
        if (atomStyles && atomStyles[symbol]) {
            color.set(atomStyles[symbol].color);
            return color;
        }
        color.set('#ff1493');
        return color;
    }, [atomStyles]);

    const getAtomColor = useCallback((index: number, symbol: string) => {
        const color = new THREE.Color();

        if (colorOverrides && colorOverrides[index]) {
            color.set(colorOverrides[index]);
            return color;
        }

        if (selectedAtoms.includes(index)) {
            color.set('#ffff00');
            return color;
        }

        if (fixedAtomSet.has(index)) {
            color.set('#ff8c00');
            return color;
        }

        return getAtomBaseColor(symbol);
    }, [selectedAtoms, colorOverrides, getAtomBaseColor, fixedAtomSet]);

    const getAtomOpacity = useCallback((index: number) => {
        if (opacityOverrides && opacityOverrides[index] !== undefined) {
            return opacityOverrides[index];
        }
        return 1.0;
    }, [opacityOverrides]);

    const getAtomBaseOpacity = useCallback(() => 1.0, []);

    return { getAtomColor, getAtomOpacity, getAtomBaseColor, getAtomBaseOpacity };
};

export default useAtomColors;
