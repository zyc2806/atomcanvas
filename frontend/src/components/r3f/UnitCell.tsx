import React, { useMemo } from 'react';
import * as THREE from 'three';
import useStructureStore from '../../store/useStructureStore';

const UnitCell: React.FC = () => {
    const { structureData } = useStructureStore();

    const geometry = useMemo(() => {
        const cell = structureData?.structure?.cell;
        
        if (!cell) return null;
        // Ensure cell is valid (3x3)
        if (!Array.isArray(cell) || cell.length !== 3) return null;

        const a = new THREE.Vector3(...cell[0]);
        const b = new THREE.Vector3(...cell[1]);
        const c = new THREE.Vector3(...cell[2]);
        const origin = new THREE.Vector3(0, 0, 0);

        // Calculate vertices
        const v000 = origin.clone();
        const v100 = origin.clone().add(a);
        const v010 = origin.clone().add(b);
        const v001 = origin.clone().add(c);
        const v110 = origin.clone().add(a).add(b);
        const v101 = origin.clone().add(a).add(c);
        const v011 = origin.clone().add(b).add(c);
        const v111 = origin.clone().add(a).add(b).add(c);

        // 12 edges
        const points = [
            v000, v100, // a-axis
            v000, v010, // b-axis
            v000, v001, // c-axis
            v100, v110,
            v100, v101,
            v010, v110,
            v010, v011,
            v001, v101,
            v001, v011,
            v110, v111,
            v101, v111,
            v011, v111
        ];

        return new THREE.BufferGeometry().setFromPoints(points);
    }, [structureData]);

    if (!geometry) return null;

    return (
        <lineSegments geometry={geometry}>
            <lineBasicMaterial color="black" linewidth={2} />
        </lineSegments>
    );
};

export default UnitCell;
