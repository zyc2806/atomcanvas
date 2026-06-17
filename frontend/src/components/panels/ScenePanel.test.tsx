import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ScenePanel } from './ScenePanel';
import { useStructureStore } from '../../store/useStructureStore';

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
