import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ColorSwatch } from './ColorSwatch';

describe('ColorSwatch', () => {
  it('shows the given colour as its background', () => {
    render(<ColorSwatch color="#ff0000" onChange={() => {}} testId="swatch" />);
    // jsdom normalises the hex background to rgb().
    expect(screen.getByTestId('swatch')).toHaveStyle({ backgroundColor: 'rgb(255, 0, 0)' });
  });

  it('opens a react-colorful hex picker on click', () => {
    render(<ColorSwatch color="#ff0000" onChange={() => {}} testId="swatch" />);
    expect(document.querySelector('.react-colorful')).toBeNull();
    fireEvent.click(screen.getByTestId('swatch'));
    expect(document.querySelector('.react-colorful')).not.toBeNull();
  });
});
