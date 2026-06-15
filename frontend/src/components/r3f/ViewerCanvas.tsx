import React, { useEffect, useRef, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { TrackballControls, PerspectiveCamera, OrthographicCamera, GizmoHelper } from '@react-three/drei';
import { EffectComposer, N8AO } from '@react-three/postprocessing';
import * as THREE from 'three';
import { Vector3, MathUtils, PerspectiveCamera as PerspectiveCameraImpl, OrthographicCamera as OrthographicCameraImpl } from 'three';
import { easing } from 'maath';

import useStructureStore from '../../store/useStructureStore';
import Background from './Scene/Background';
import Lighting from './Scene/Lighting';
import LightGizmos from './Scene/LightGizmos';
import AxesGizmo from './AxesGizmo';
import Atoms from './Atoms';
import Bonds from './Bonds';
import HBonds from './HBonds';
import UnitCell from './UnitCell';
import AromaticRings from './AromaticRings';
import { hasAnyTransparentOverrides } from './materials/opacityPolicy';
import { elementStylesToAtomOverrides } from '../../services/elementStyleApply';

interface ViewerCanvasProps {
    children?: ReactNode;
    center?: [number, number, number];
    shouldReset?: boolean;
}

type ControlsLike = {
    target?: THREE.Vector3;
    getTarget?: (out: THREE.Vector3) => void;
    addEventListener?: (type: string, callback: () => void) => void;
    removeEventListener?: (type: string, callback: () => void) => void;
    update?: () => void;
};

const applyCameraZoom = (camera: THREE.Camera, zoom: number): void => {
    const zoomableCamera = camera as THREE.Camera & { zoom?: number };
    if (typeof zoomableCamera.zoom === 'number') {
        zoomableCamera.zoom = zoom;
    }
};

const CameraAnimator: React.FC = () => {
    const { camera, controls } = useThree();
    const cameraViewTrigger = useStructureStore((state) => state.cameraViewTrigger);
    
    const targetPos = useRef(new Vector3());
    const targetLookAt = useRef(new Vector3());
    const targetUp = useRef(new Vector3(0, 1, 0));
    const isAnimating = useRef(false);
    const persistOnAnimationComplete = useRef(false);
    
    useEffect(() => {
        if (!controls) return;
        const controlsApi = controls as unknown as ControlsLike;
        const addEventListener = controlsApi.addEventListener;
        const removeEventListener = controlsApi.removeEventListener;
        if (!addEventListener || !removeEventListener) return;
        const callback = () => {
            isAnimating.current = false;
            persistOnAnimationComplete.current = false;
        };
        addEventListener.call(controlsApi, 'start', callback);
        return () => removeEventListener.call(controlsApi, 'start', callback);
    }, [controls]);

    useEffect(() => {
        if (cameraViewTrigger && controls) {
            const controlsApi = controls as unknown as ControlsLike;
            
            const newTarget = new Vector3(...cameraViewTrigger.target);
            const newPos = new Vector3(...cameraViewTrigger.position);
            
            if (cameraViewTrigger.preserveDistance) {
                const currentTarget = new Vector3();
                if (typeof controlsApi.getTarget === 'function') {
                    controlsApi.getTarget(currentTarget);
                } else if (controlsApi.target) {
                    currentTarget.copy(controlsApi.target);
                }

                const currentDistance = camera.position.distanceTo(currentTarget);
                
                const direction = new Vector3()
                    .subVectors(newPos, newTarget)
                    .normalize();
                
                newPos.copy(newTarget).add(direction.multiplyScalar(currentDistance));
            }
            
            if (cameraViewTrigger.up) {
                targetUp.current.set(...cameraViewTrigger.up);
            } else {
                targetUp.current.copy(camera.up);
            }

            targetPos.current.copy(newPos);
            targetLookAt.current.copy(newTarget);
            isAnimating.current = true;
            persistOnAnimationComplete.current = true;
        }
    }, [cameraViewTrigger, camera, controls]);

    useFrame((state, delta) => {
        if (!isAnimating.current || !controls) return;

        const controlsApi = controls as unknown as ControlsLike;
        if (!controlsApi.target) return;
        
        const p1 = easing.damp3(state.camera.position, targetPos.current, 0.25, delta);
        const p2 = easing.damp3(controlsApi.target, targetLookAt.current, 0.25, delta);
        const p3 = easing.damp3(state.camera.up, targetUp.current, 0.25, delta);
        
        if (!p1 && !p2 && !p3) {
            isAnimating.current = false;
            if (persistOnAnimationComplete.current) {
                const controlsTarget = controlsApi.target;
                const target = controlsTarget
                    ? (controlsTarget.toArray() as [number, number, number])
                    : ([targetLookAt.current.x, targetLookAt.current.y, targetLookAt.current.z] as [number, number, number]);
                const store = useStructureStore.getState();
                store.setViewTarget(target);
                store.setCameraState({
                    position: [state.camera.position.x, state.camera.position.y, state.camera.position.z],
                    up: [state.camera.up.x, state.camera.up.y, state.camera.up.z],
                    zoom: state.camera.zoom,
                });
                persistOnAnimationComplete.current = false;
            }
        }
    });

    return null;
};

const CameraManager: React.FC = () => {
    const { cameraType, cameraState, cameraApplyRevision, viewTarget, setCameraState } = useStructureStore();
    const { size } = useThree();
    const controls = useThree((state) => state.controls) as unknown as ControlsLike | null;
    
    const prevType = useRef(cameraType);
    const lastCameraApplyRevision = useRef(cameraApplyRevision);
    const pCamRef = useRef<PerspectiveCameraImpl>(null);
    const oCamRef = useRef<OrthographicCameraImpl>(null);
    
    const FOV = 50;

    useEffect(() => {
        const isAtomicApply = cameraApplyRevision !== lastCameraApplyRevision.current;
        if (isAtomicApply) {
            lastCameraApplyRevision.current = cameraApplyRevision;
        }

        if (prevType.current === cameraType) {
            return;
        }
        
        const currentCam = prevType.current === 'perspective' ? pCamRef.current : oCamRef.current;
        const nextCam = cameraType === 'perspective' ? pCamRef.current : oCamRef.current;
        
        if (currentCam && nextCam && controls) {
            controls.update?.();

            // Sync position/rotation
            nextCam.position.copy(currentCam.position);
            nextCam.rotation.copy(currentCam.rotation);
            nextCam.quaternion.copy(currentCam.quaternion);
            nextCam.up.copy(currentCam.up);
            
            const currentTarget = new Vector3();
            if (typeof controls.getTarget === 'function') {
                controls.getTarget(currentTarget);
            } else if (controls.target) {
                currentTarget.copy(controls.target);
            }

            const target = viewTarget ? new Vector3(...viewTarget) : currentTarget;
            const distance = currentCam.position.distanceTo(target);
            const halfFovRad = MathUtils.degToRad(FOV / 2);
            
            if (cameraType === 'orthographic') {
                if (cameraState?.zoom && cameraState.zoom !== 1) {
                    nextCam.zoom = cameraState.zoom;
                } else {
                    const visibleHeight = 2 * distance * Math.tan(halfFovRad);
                    nextCam.zoom = size.height / visibleHeight;
                }
                nextCam.updateProjectionMatrix();
            } else {
                // O -> P
                const visibleHeight = size.height / currentCam.zoom;
                const newDist = visibleHeight / (2 * Math.tan(halfFovRad));
                
                // Move camera along the view vector
                const dir = new Vector3().subVectors(currentCam.position, target).normalize();
                nextCam.position.copy(target).add(dir.multiplyScalar(newDist));
                nextCam.zoom = 1;
                nextCam.updateProjectionMatrix();
            }

            if (!isAtomicApply) {
                setCameraState({
                    position: [nextCam.position.x, nextCam.position.y, nextCam.position.z],
                    up: [nextCam.up.x, nextCam.up.y, nextCam.up.z],
                    zoom: nextCam.zoom,
                });
            }
        }
        
        prevType.current = cameraType;
    }, [cameraApplyRevision, cameraType, cameraState, size.height, controls, setCameraState, viewTarget]);

    return (
        <>
            <PerspectiveCamera 
                ref={pCamRef}
                makeDefault={cameraType === 'perspective'} 
                fov={FOV} 
            />
            <OrthographicCamera 
                ref={oCamRef}
                makeDefault={cameraType === 'orthographic'} 
            />
        </>
    );
};

const RenderInvalidator: React.FC = () => {
    const invalidate = useThree((state) => state.invalidate);

    useEffect(() => {
        const invalidateTwice = () => {
            if (typeof invalidate !== 'function') {
                return;
            }
            invalidate();
            if (typeof requestAnimationFrame === 'function') {
                requestAnimationFrame(() => {
                    invalidate();
                });
            }
        };

        invalidateTwice();

        const subscribe = (useStructureStore as unknown as {
            subscribe?: (listener: (state: ReturnType<typeof useStructureStore.getState>, prevState: ReturnType<typeof useStructureStore.getState>) => void) => () => void;
        }).subscribe;

        if (typeof subscribe !== 'function') {
            return () => {};
        }

        const unsubscribe = subscribe((state, prevState) => {
            const viewChanged = state.viewControls.showAxesGizmo !== prevState.viewControls.showAxesGizmo
                || state.viewControls.forceTransparentBackground !== prevState.viewControls.forceTransparentBackground;
            const cameraChanged = state.cameraType !== prevState.cameraType;
            const styleChanged = state.visParams.renderStyle !== prevState.visParams.renderStyle;

            if (viewChanged || cameraChanged || styleChanged) {
                invalidateTwice();
            }
        });

        return () => {
            unsubscribe();
        };
    }, [invalidate]);

    return null;
};

const RendererClearPolicy: React.FC = () => {
    const gl = useThree((state) => state.gl);
    const renderStyle = useStructureStore((state) => state.visParams.renderStyle);

    useFrame(() => {
        if (renderStyle !== 'standard') {
            gl.clear(true, true, true);
        }
    });

    return null;
};

const CameraController: React.FC<{ center: [number, number, number], shouldReset?: boolean, fitRadius?: number }> = ({ center, shouldReset, fitRadius }) => {
    const { camera, gl, events, controls: sceneControls } = useThree();
    const controlsRef = useRef<ControlsLike | null>(null);
    const { 
        userHasInteracted, 
        loading,
        cameraType,
        cameraState,
        cameraApplyRevision,
        viewTarget,
        setViewTarget,
        setCameraState,
    } = useStructureStore();
    
    const centerRef = useRef(center);
    const fitRadiusRef = useRef(fitRadius);
    const prevLoading = useRef(loading);
    const viewTargetRef = useRef(viewTarget);
    const lastCameraType = useRef(cameraType);
    const lastCameraApplyRevision = useRef(cameraApplyRevision);
    const muteControlsWriteback = useRef(false);
    const muteWritebackTimer = useRef<number | null>(null);

    useEffect(() => {
        centerRef.current = center;
        fitRadiusRef.current = fitRadius;
    }, [center, fitRadius]);

    useEffect(() => {
        viewTargetRef.current = viewTarget;
    }, [viewTarget]);

    useEffect(() => {
        if (!viewTarget) {
            setViewTarget(center);
        }
    }, [center, setViewTarget, viewTarget]);

    useEffect(() => {
        const controls = controlsRef.current;
        if (!controls) return;

        const justFinishedLoading = prevLoading.current && !loading;
        const shouldResetInitial = shouldReset && !userHasInteracted;

        if ((justFinishedLoading && !userHasInteracted) || shouldResetInitial) {
            const c = centerRef.current;
            // Frame the structure adaptively: distance to fit its bounding sphere
            // in the camera's vertical FOV (with margin), so both a small molecule
            // and a large slab are sized sensibly instead of a hardcoded distance.
            const radius = Math.max(fitRadiusRef.current ?? 0, 0.8);
            const persp = camera as THREE.PerspectiveCamera;
            const fovDeg = persp.isPerspectiveCamera && persp.fov ? persp.fov : 50;
            const halfFov = (fovDeg * Math.PI) / 180 / 2;
            const dist = Math.max((radius * 1.6) / Math.sin(halfFov), 3);
            camera.position.set(c[0], c[1], c[2] + dist);
            if (controls.target) {
                controls.target.set(c[0], c[1], c[2]);
            }
            controls.update?.();
            setViewTarget([c[0], c[1], c[2]]);
            setCameraState({ position: [c[0], c[1], c[2] + dist], up: [0, 1, 0], zoom: camera.zoom });
        }

        prevLoading.current = loading;
    }, [loading, shouldReset, userHasInteracted, setViewTarget, setCameraState, camera]);

    useEffect(() => {
        const controls = controlsRef.current ?? (sceneControls as unknown as ControlsLike | null);
        const didCameraTypeSwitch = cameraType !== lastCameraType.current;

        if (!controls || !cameraState || !viewTarget) {
            lastCameraType.current = cameraType;
            return;
        }

        const isAtomicApply = cameraApplyRevision !== lastCameraApplyRevision.current;
        if (didCameraTypeSwitch && !isAtomicApply) {
            lastCameraType.current = cameraType;
            return;
        }

        if (isAtomicApply) {
            lastCameraApplyRevision.current = cameraApplyRevision;
            muteControlsWriteback.current = true;
            if (muteWritebackTimer.current !== null) {
                window.clearTimeout(muteWritebackTimer.current);
            }
            muteWritebackTimer.current = window.setTimeout(() => {
                muteControlsWriteback.current = false;
                muteWritebackTimer.current = null;
            }, 32);
        }

        const [px, py, pz] = cameraState.position;
        const [tx, ty, tz] = viewTarget;

        camera.position.set(px, py, pz);
        if (cameraState.up) {
            camera.up.set(cameraState.up[0], cameraState.up[1], cameraState.up[2]);
        }
        if (typeof cameraState.zoom === 'number' && Number.isFinite(cameraState.zoom)) {
            applyCameraZoom(camera, cameraState.zoom);
        }
        if (controls.target) {
            controls.target.set(tx, ty, tz);
        }
        camera.updateProjectionMatrix();
        controls.update?.();
        lastCameraType.current = cameraType;
    }, [camera, cameraApplyRevision, cameraState, cameraType, sceneControls, viewTarget]);

    useEffect(() => {
        return () => {
            if (muteWritebackTimer.current !== null) {
                window.clearTimeout(muteWritebackTimer.current);
                muteWritebackTimer.current = null;
            }
        };
    }, []);

    useEffect(() => {
        if (cameraType !== 'orthographic') {
            return;
        }

        const element = (events.connected as HTMLElement) || gl.domElement;
        if (!element || typeof element.addEventListener !== 'function') {
            return;
        }
        const handleWheel = (event: WheelEvent) => {
            event.preventDefault();
            event.stopPropagation();

            const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1;
            camera.zoom = MathUtils.clamp(camera.zoom * zoomFactor, 0.05, 500);
            camera.updateProjectionMatrix();

            const store = useStructureStore.getState();
            const activeControls = controlsRef.current ?? (sceneControls as unknown as ControlsLike | null);
            if (activeControls?.target) {
                store.setViewTarget(activeControls.target.toArray() as [number, number, number]);
            }
            store.setCameraState({
                position: [camera.position.x, camera.position.y, camera.position.z],
                up: [camera.up.x, camera.up.y, camera.up.z],
                zoom: camera.zoom,
            });
            if (!store.userHasInteracted) {
                store.setUserHasInteracted(true);
            }
        };

        element.addEventListener('wheel', handleWheel, { passive: false });
        return () => {
            element.removeEventListener('wheel', handleWheel as EventListener);
        };
    }, [camera, cameraType, events.connected, gl.domElement, sceneControls]);

    const handleControlsRef = useCallback((controls: unknown) => {
        const nextControls = controls as ControlsLike | null;
        controlsRef.current = nextControls;
        if (nextControls?.target && viewTargetRef.current) {
            const t = viewTargetRef.current;
            nextControls.target.set(t[0], t[1], t[2]);
        }
    }, []);

    const handleStart = useCallback(() => {
        if (!useStructureStore.getState().userHasInteracted) {
            useStructureStore.getState().setUserHasInteracted(true);
        }
    }, []);

    const handleEnd = useCallback(() => {
        if (muteControlsWriteback.current) {
            return;
        }
        const activeControls = (controlsRef.current ?? (sceneControls as unknown as ControlsLike | null));
        if (activeControls?.target) {
            const t = activeControls.target;
            useStructureStore.getState().setViewTarget(t.toArray() as [number, number, number]);
            useStructureStore.getState().setCameraState({
                position: [camera.position.x, camera.position.y, camera.position.z],
                up: [camera.up.x, camera.up.y, camera.up.z],
                zoom: camera.zoom,
            });
        }
    }, [camera, sceneControls]);

    return (
        <TrackballControls
            key={camera.uuid}
            ref={handleControlsRef}
            makeDefault
            camera={camera}
            domElement={(events.connected as HTMLElement) || gl.domElement}
            rotateSpeed={4.0}
            zoomSpeed={1.2}
            panSpeed={0.8}
            dynamicDampingFactor={0.2}
            staticMoving={false}
            noZoom={cameraType === 'orthographic'}
            onStart={handleStart}
            onEnd={handleEnd}
        />
    );
};

const SceneContent: React.FC = () => {
    const structureData = useStructureStore((state) => state.structureData);
    const elements = useStructureStore((state) => state.elements);
    const storeColorOverrides = useStructureStore((state) => state.colorOverrides);
    const storeOpacityOverrides = useStructureStore((state) => state.opacityOverrides);
    const storeRadiusOverrides = useStructureStore((state) => state.radiusOverrides);
    const showUnitCell = useStructureStore((state) => state.viewControls.showUnitCell);
    const showHBonds = useStructureStore((state) => state.viewControls.showHBonds);

    const symbols = structureData?.structure.symbols;

    const { colorOverrides: elColor, opacityOverrides: elOpacity, radiusOverrides: elRadius } = useMemo(
        () => elementStylesToAtomOverrides(symbols ?? [], elements),
        [symbols, elements],
    );

    const mergedColorOverrides = useMemo(
        () => ({ ...elColor, ...(storeColorOverrides ?? {}) }),
        [elColor, storeColorOverrides],
    );
    const mergedOpacityOverrides = useMemo(
        () => ({ ...elOpacity, ...(storeOpacityOverrides ?? {}) }),
        [elOpacity, storeOpacityOverrides],
    );
    // Per-atom selection size overrides win over the per-element radius scale.
    const mergedRadiusOverrides = useMemo(
        () => ({ ...elRadius, ...(storeRadiusOverrides ?? {}) }),
        [elRadius, storeRadiusOverrides],
    );

    if (!structureData) return null;

    return (
        <>
            <Atoms
                colorOverrides={mergedColorOverrides}
                opacityOverrides={mergedOpacityOverrides}
                radiusOverrides={mergedRadiusOverrides}
            />
            <Bonds radiusOverrides={mergedRadiusOverrides} />
            <AromaticRings />
            {showHBonds && <HBonds />}
            {showUnitCell && <UnitCell />}
        </>
    );
};

const ViewerCanvas: React.FC<ViewerCanvasProps> = ({ children, center = [0, 0, 0], shouldReset }) => {
    const { viewControls, visParams, opacityOverrides, bondOpacityOverrides } = useStructureStore();
    const structureData = useStructureStore((state) => state.structureData);
    const { showShadows, showAxesGizmo } = viewControls;
    const { renderStyle } = visParams;
    const hasTransparentOverrides = hasAnyTransparentOverrides(opacityOverrides, bondOpacityOverrides);
    const shouldEnableStandardAO = renderStyle === 'standard' && !hasTransparentOverrides;

    // Derive the structure's centroid and bounding radius so the camera can frame
    // it adaptively. Falls back to the `center` prop / origin when no structure.
    const { fitCenter, fitRadius } = useMemo(() => {
        const positions = structureData?.structure.positions;
        if (!positions || positions.length === 0) {
            return { fitCenter: center, fitRadius: undefined as number | undefined };
        }
        let cx = 0, cy = 0, cz = 0;
        for (const p of positions) { cx += p[0]; cy += p[1]; cz += p[2]; }
        const n = positions.length;
        cx /= n; cy /= n; cz /= n;
        let r = 0;
        for (const p of positions) {
            r = Math.max(r, Math.hypot(p[0] - cx, p[1] - cy, p[2] - cz));
        }
        return { fitCenter: [cx, cy, cz] as [number, number, number], fitRadius: r };
    }, [structureData, center]);

    const effectiveCenter = structureData ? fitCenter : center;
    const effectiveReset = structureData ? true : shouldReset;

    return (
        <div style={{ width: '100%', height: '100%' }}>
            <Canvas shadows={showShadows} gl={{ preserveDrawingBuffer: true, alpha: true }} onContextMenu={(e) => e.preventDefault()}>
                <Background />
                <CameraManager />
                <Lighting />
                <LightGizmos />
                <CameraController center={effectiveCenter} shouldReset={effectiveReset} fitRadius={fitRadius} />
                <CameraAnimator />
                <RenderInvalidator />
                <RendererClearPolicy />
                {showAxesGizmo !== false && (
                    <GizmoHelper alignment="bottom-left" margin={[80, 80]} renderPriority={renderStyle === 'standard' ? 2 : 1}>
                        <AxesGizmo />
                    </GizmoHelper>
                )}
                <SceneContent />
                {children}

                {renderStyle === 'standard' && (
                    <EffectComposer>
                        <N8AO 
                            aoRadius={0.4}
                            intensity={shouldEnableStandardAO ? 1 : 0}
                            distanceFalloff={2}
                            color={new THREE.Color('black')}
                        />
                    </EffectComposer>
                )}
            </Canvas>
        </div>
    );
};

export default ViewerCanvas;
