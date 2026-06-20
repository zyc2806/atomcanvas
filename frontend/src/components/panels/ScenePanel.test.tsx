import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ScenePanel } from './ScenePanel';
import { useStructureStore } from '../../store/useStructureStore';

// ---------------------------------------------------------------------------
// Task 4: Theme 13 — Axes gizmo / Light gizmos tooltip glosses
// ---------------------------------------------------------------------------
describe('ScenePanel Task 4 tooltip glosses', () => {
  beforeEach(() => {
    useStructureStore.getState().resetSceneSettings();
  });

  it('Axes gizmo FormControlLabel has aria-label "Small XYZ orientation indicator" from Tooltip', () => {
    render(<ScenePanel />);
    // MUI v7 Tooltip sets aria-label on the child (FormControlLabel root = <label>).
    // The checkbox's accessible name still comes from the label text, not the aria-label
    // on the label element, so getByRole('checkbox',{name:'Axes gizmo'}) still works.
    const checkbox = screen.getByRole('checkbox', { name: 'Axes gizmo' });
    // Walk up to find the FormControlLabel root that has the aria-label set by Tooltip
    const labeled = checkbox.closest('[aria-label]');
    expect(labeled).toBeTruthy();
    expect(labeled?.getAttribute('aria-label')).toBe('Small XYZ orientation indicator');
  });

  it('Light gizmos FormControlLabel has aria-label "Show light-source markers" from Tooltip', () => {
    render(<ScenePanel />);
    const checkbox = screen.getByRole('checkbox', { name: 'Light gizmos' });
    const labeled = checkbox.closest('[aria-label]');
    expect(labeled).toBeTruthy();
    expect(labeled?.getAttribute('aria-label')).toBe('Show light-source markers');
  });

  it('getByRole checkbox name "Axes gizmo" still resolves after tooltip wrapping', () => {
    render(<ScenePanel />);
    expect(screen.getByRole('checkbox', { name: 'Axes gizmo' })).toBeInTheDocument();
  });

  it('getByRole checkbox name "Light gizmos" still resolves after tooltip wrapping', () => {
    render(<ScenePanel />);
    expect(screen.getByRole('checkbox', { name: 'Light gizmos' })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Background / brightness tests (relocated from StylePanel.test.tsx)
// ---------------------------------------------------------------------------
describe('ScenePanel background and brightness', () => {
  beforeEach(() => {
    useStructureStore.getState().resetSceneSettings();
  });

  it('brightness slider writes scene settings', () => {
    render(<ScenePanel />);
    fireEvent.change(screen.getByTestId('brightness'), { target: { value: '1.5' } });
    expect(useStructureStore.getState().sceneSettings.globalBrightness).toBeCloseTo(1.5);
  });

  it('brightness slider range is widened (0 – 5)', () => {
    render(<ScenePanel />);
    const slider = screen.getByTestId('brightness');
    expect(slider).toHaveAttribute('min', '0');
    expect(slider).toHaveAttribute('max', '5');
  });

  it('transparent background checkbox writes viewControls', () => {
    render(<ScenePanel />);
    fireEvent.click(screen.getByRole('checkbox', { name: /transparent background/i }));
    expect(useStructureStore.getState().viewControls.forceTransparentBackground).toBe(true);
  });
});

describe('ScenePanel render style', () => {
  beforeEach(() => {
    useStructureStore.getState().setVisParams({
      renderStyle: 'standard',
      cartoonParams: {
        outlineThickness: 3,
        highlightThreshold: 0.97,
        shadowThreshold: 0.3,
        shadowBrightness: 0.5,
      },
    });
  });

  it('switches render style to cartoon via the toggle', () => {
    render(<ScenePanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Cartoon' }));
    expect(useStructureStore.getState().visParams.renderStyle).toBe('cartoon');
  });

  it('shows cartoon parameter sliders only when cartoon is active', () => {
    render(<ScenePanel />);
    expect(screen.queryByTestId('outline-thickness')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Cartoon' }));
    expect(screen.getByTestId('outline-thickness')).toBeInTheDocument();
  });

  it('outline thickness slider writes cartoonParams', () => {
    useStructureStore.getState().setVisParams({ renderStyle: 'cartoon' });
    render(<ScenePanel />);
    fireEvent.change(screen.getByTestId('outline-thickness'), { target: { value: '5' } });
    expect(
      useStructureStore.getState().visParams.cartoonParams.outlineThickness,
    ).toBeCloseTo(5);
  });
});

describe('ScenePanel camera projection', () => {
  beforeEach(() => {
    useStructureStore.getState().setCameraType('perspective');
  });

  it('switches camera projection to orthographic via the toggle', () => {
    render(<ScenePanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Orthographic' }));
    expect(useStructureStore.getState().cameraType).toBe('orthographic');
  });

  it('switches camera projection back to perspective', () => {
    useStructureStore.getState().setCameraType('orthographic');
    render(<ScenePanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Perspective' }));
    expect(useStructureStore.getState().cameraType).toBe('perspective');
  });
});

describe('ScenePanel lighting', () => {
  beforeEach(() => {
    useStructureStore.getState().resetSceneSettings();
  });

  it('applies a lighting preset via the dropdown', () => {
    render(<ScenePanel />);
    fireEvent.mouseDown(screen.getByRole('combobox', { name: /lighting preset/i }));
    fireEvent.click(screen.getByRole('option', { name: 'Studio' }));
    const s = useStructureStore.getState().sceneSettings;
    expect(s.lightingPreset).toBe('studio');
    // studio enables the fill and rim lights (createSceneSlice preset table).
    expect(s.fillLight.enabled).toBe(true);
    expect(s.rimLight.enabled).toBe(true);
  });

  it('toggling a light off flips the preset to custom', () => {
    useStructureStore.getState().setLightingPreset('studio');
    render(<ScenePanel />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Key' }));
    const s = useStructureStore.getState().sceneSettings;
    expect(s.keyLight.enabled).toBe(false);
    expect(s.lightingPreset).toBe('custom');
  });

  it('enables a disabled light via its checkbox', () => {
    render(<ScenePanel />);
    // fill light is disabled by default
    fireEvent.click(screen.getByRole('checkbox', { name: 'Fill' }));
    expect(useStructureStore.getState().sceneSettings.fillLight.enabled).toBe(true);
  });

  it('toggles the light gizmos', () => {
    render(<ScenePanel />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Light gizmos' }));
    expect(useStructureStore.getState().sceneSettings.showLightGizmos).toBe(true);
  });
});
