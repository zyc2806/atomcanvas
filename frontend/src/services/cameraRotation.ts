import type { ImageExportRotationOptions } from './imageExportOptions';

export interface ExportCameraSnapshot {
    type: 'perspective' | 'orthographic';
    target: [number, number, number];
    position: [number, number, number];
    up: [number, number, number];
    zoom: number;
}

const rotateVectorByAxis = (
    vector: [number, number, number],
    axis: ImageExportRotationOptions['axis'],
    radians: number,
): [number, number, number] => {
    const [x, y, z] = vector;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);

    if (axis === 'x') {
        return [x, y * cos - z * sin, y * sin + z * cos];
    }
    if (axis === 'y') {
        return [x * cos + z * sin, y, -x * sin + z * cos];
    }
    return [x * cos - y * sin, x * sin + y * cos, z];
};

const normalizeVector3 = (
    value: [number, number, number],
    fallback: [number, number, number],
): [number, number, number] => {
    const [x, y, z] = value;
    const length = Math.hypot(x, y, z);
    if (!Number.isFinite(length) || length < 1e-8) {
        return fallback;
    }
    return [x / length, y / length, z / length];
};

export const buildRotationFrameSnapshot = (
    base: ExportCameraSnapshot,
    frameIndex: number,
    frameCount: number,
    rotation: ImageExportRotationOptions,
): ExportCameraSnapshot => {
    const count = Math.max(1, frameCount);
    const stepDenominator = count > 1 ? count - 1 : 1;
    const stepFraction = frameIndex / stepDenominator;
    const radians = (rotation.degrees * stepFraction * Math.PI) / 180;

    if (!rotation.fixedViewport) {
        const rotatedTarget = rotateVectorByAxis(base.target, rotation.axis, radians);
        const rotatedPosition = rotateVectorByAxis(base.position, rotation.axis, radians);
        const rotatedUp = normalizeVector3(
            rotateVectorByAxis(base.up, rotation.axis, radians),
            base.up,
        );

        return {
            type: base.type,
            target: rotatedTarget,
            position: rotatedPosition,
            up: rotatedUp,
            zoom: base.zoom,
        };
    }

    const rel: [number, number, number] = [
        base.position[0] - base.target[0],
        base.position[1] - base.target[1],
        base.position[2] - base.target[2],
    ];
    const rotatedRel = rotateVectorByAxis(rel, rotation.axis, radians);
    const rotatedUp = normalizeVector3(
        rotateVectorByAxis(base.up, rotation.axis, radians),
        base.up,
    );

    return {
        type: base.type,
        target: base.target,
        position: [
            base.target[0] + rotatedRel[0],
            base.target[1] + rotatedRel[1],
            base.target[2] + rotatedRel[2],
        ],
        up: rotatedUp,
        zoom: base.zoom,
    };
};
