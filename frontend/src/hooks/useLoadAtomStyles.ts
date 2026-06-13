import { useEffect, useRef } from 'react';
import { useStructureStore } from '../store/useStructureStore';

/**
 * Loads element colors/radii from public/atom.json into the store on mount.
 * atom.json stores color as an [r,g,b] array in 0..1; the store expects a hex
 * string. Without this, every atom falls back to the magenta "unknown element"
 * color in useAtomColors.
 */
export function useLoadAtomStyles(): void {
    const setAtomStyles = useStructureStore((s) => s.setAtomStyles);
    const loaded = useRef(false);

    useEffect(() => {
        // No per-mount "cancelled" gate: atomStyles is global store state, so
        // setting it after an (e.g. StrictMode) unmount is harmless — and gating
        // on cancellation would drop the only fetch when StrictMode double-invokes
        // this effect while the ref guard blocks the second fetch.
        if (loaded.current) return;
        loaded.current = true;

        (async () => {
            try {
                const res = await fetch('/atom.json');
                if (!res.ok) throw new Error(`atom.json HTTP ${res.status}`);
                const data = (await res.json()) as {
                    [symbol: string]: { color: number[]; radius: number };
                };
                const styles: { [symbol: string]: { color: string; radius: number } } = {};
                for (const [symbol, info] of Object.entries(data)) {
                    const color =
                        '#' +
                        info.color
                            .map((c) => Math.round(c * 255).toString(16).padStart(2, '0'))
                            .join('');
                    styles[symbol] = { color, radius: info.radius };
                }
                setAtomStyles(styles);
            } catch (err) {
                loaded.current = false;
                console.error('Failed to load atom styles from /atom.json:', err);
            }
        })();
    }, [setAtomStyles]);
}
