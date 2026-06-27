/**
 * frameloopPolicy.ts
 *
 * Chooses the React Three Fiber render loop mode.
 *
 * Real users get on-demand rendering ('demand'): the WebGL canvas only redraws
 * when something actually changes (a store mutation, a camera move, an
 * animation), so an idle viewer — or one with every structure closed — returns
 * to true 0-GPU idle instead of rendering ~60fps forever.
 *
 * Automated browsers (the Playwright headless render CLI and the e2e suite) keep
 * the continuous loop ('always'). The headless capture handshake waits for a
 * monotonic frame counter to advance before screenshotting; under 'demand' that
 * counter would stall once the scene settles, so automation must stay on the
 * always-render loop. Visual output is identical either way — only *when* frames
 * are drawn differs.
 */
export type Frameloop = 'always' | 'demand';

/** True when running under browser automation (Playwright/WebDriver set this). */
export function isAutomatedBrowser(nav: { webdriver?: boolean } | undefined | null): boolean {
    return !!(nav && nav.webdriver === true);
}

export function resolveFrameloop(automated: boolean): Frameloop {
    return automated ? 'always' : 'demand';
}
