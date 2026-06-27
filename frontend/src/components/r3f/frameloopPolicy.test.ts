import { describe, it, expect } from 'vitest';
import { resolveFrameloop, isAutomatedBrowser } from './frameloopPolicy';

describe('resolveFrameloop', () => {
    it('uses on-demand rendering for real users (idle when nothing changes)', () => {
        expect(resolveFrameloop(false)).toBe('demand');
    });

    it('uses the continuous loop under browser automation (keeps the headless capture handshake reliable)', () => {
        expect(resolveFrameloop(true)).toBe('always');
    });
});

describe('isAutomatedBrowser', () => {
    it('is true when navigator.webdriver is true (Playwright / WebDriver)', () => {
        expect(isAutomatedBrowser({ webdriver: true })).toBe(true);
    });

    it('is false for a normal browser', () => {
        expect(isAutomatedBrowser({ webdriver: false })).toBe(false);
        expect(isAutomatedBrowser({})).toBe(false);
        expect(isAutomatedBrowser(undefined)).toBe(false);
    });
});
