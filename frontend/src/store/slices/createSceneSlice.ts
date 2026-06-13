import type { StateCreator } from 'zustand';
import type { StructureState } from '../../types/store';

// Types
export type BackgroundType = 'solid';
export type LightingPreset = 'studio' | 'flat' | 'dramatic' | 'custom';

export interface LightConfig {
  enabled: boolean;
  intensity: number;
  color: string;
  position: [number, number, number];
}

export interface BackgroundConfig {
  type: BackgroundType;
  solidColor: string;
}

export interface SceneSettings {
  background: BackgroundConfig;
  globalBrightness: number; // 0.0 - 2.0, default 1.0
  ambientLight: LightConfig;
  keyLight: LightConfig;
  fillLight: LightConfig;
  rimLight: LightConfig;
  lightingPreset: LightingPreset;
  showLightGizmos: boolean;
}

export interface SceneSlice {
  sceneSettings: SceneSettings;

  backgroundUserCustomized: boolean;
  
  // Actions
  setBackground: (config: Partial<BackgroundConfig>) => void;
  setBackgroundAuto: (config: Partial<BackgroundConfig>) => void;
  setGlobalBrightness: (brightness: number) => void;
  setLight: (lightName: 'ambientLight' | 'keyLight' | 'fillLight' | 'rimLight', config: Partial<LightConfig>) => void;
  setLightingPreset: (preset: LightingPreset) => void;
  toggleLightGizmos: () => void;
  resetSceneSettings: () => void;
}

const defaultSceneSettings: SceneSettings = {
    background: {
        type: 'solid',
        solidColor: '#121212'
    },
    globalBrightness: 1.0,
    ambientLight: {
        enabled: true,
        intensity: 0.5,
        color: '#ffffff',
        position: [0, 0, 0]
    },
    keyLight: {
        enabled: true,
        intensity: 1.0,
        color: '#ffffff',
        position: [10, 10, 10]
    },
    fillLight: {
        enabled: false,
        intensity: 0.3,
        color: '#ffffff',
        position: [-10, 5, -10]
    },
    rimLight: {
        enabled: false,
        intensity: 0.5,
        color: '#ffffff',
        position: [0, -10, 10]
    },
    lightingPreset: 'custom',
    showLightGizmos: false
};

export const createSceneSlice: StateCreator<StructureState, [], [], SceneSlice> = (set) => ({
    sceneSettings: defaultSceneSettings,

    backgroundUserCustomized: false,

    setBackground: (config) => set((state) => ({
        sceneSettings: {
            ...state.sceneSettings,
            background: { ...state.sceneSettings.background, ...config }
        },
        backgroundUserCustomized: true,
    })),

    setBackgroundAuto: (config) => set((state) => ({
        sceneSettings: {
            ...state.sceneSettings,
            background: { ...state.sceneSettings.background, ...config }
        }
    })),

    setGlobalBrightness: (brightness) => set((state) => ({
        sceneSettings: { ...state.sceneSettings, globalBrightness: brightness }
    })),

    setLight: (lightName, config) => set((state) => ({
        sceneSettings: {
            ...state.sceneSettings,
            [lightName]: { ...state.sceneSettings[lightName], ...config },
            lightingPreset: 'custom'
        }
    })),

    setLightingPreset: (preset) => set((state) => {
        if (preset === 'custom') {
            return {
                sceneSettings: { ...state.sceneSettings, lightingPreset: preset }
            };
        }

        const newSettings: Partial<SceneSettings> = { lightingPreset: preset };
        const current = state.sceneSettings;

        const ambient = { ...current.ambientLight };
        const key = { ...current.keyLight };
        const fill = { ...current.fillLight };
        const rim = { ...current.rimLight };

        switch (preset) {
            case 'flat':
                ambient.intensity = 0.8;
                ambient.enabled = true;
                key.intensity = 0.3;
                key.enabled = true;
                fill.enabled = false;
                rim.enabled = false;
                break;
            case 'studio':
                ambient.intensity = 0.4;
                ambient.enabled = true;
                key.intensity = 1.0;
                key.enabled = true;
                fill.intensity = 0.3;
                fill.enabled = true;
                rim.intensity = 0.5;
                rim.enabled = true;
                break;
            case 'dramatic':
                ambient.intensity = 0.2;
                ambient.enabled = true;
                key.intensity = 1.5;
                key.enabled = true;
                fill.enabled = false;
                rim.intensity = 0.8;
                rim.enabled = true;
                break;
        }

        return {
            sceneSettings: {
                ...state.sceneSettings,
                ...newSettings,
                ambientLight: ambient,
                keyLight: key,
                fillLight: fill,
                rimLight: rim
            }
        };
    }),

    toggleLightGizmos: () => set((state) => ({
        sceneSettings: { 
            ...state.sceneSettings, 
            showLightGizmos: !state.sceneSettings.showLightGizmos 
        }
    })),

    resetSceneSettings: () => set({
        sceneSettings: defaultSceneSettings,
        backgroundUserCustomized: false,
    })
});
