/**
 * Browser download helpers shared by the export menu and batch exporters.
 *
 * `downloadBlob` materializes any payload into a Blob, triggers an anchor-click
 * download, then revokes the object URL. `uniqueName` numbers collisions so
 * batch exports (e.g. two tabs both named "structure") never clobber each other
 * inside a single session.
 */

export function downloadBlob(data: Blob | ArrayBuffer | string, filename: string, mime: string): void {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const seen = new Map<string, number>();

export function uniqueName(base: string, ext: string): string {
  const key = `${base}.${ext}`;
  const n = (seen.get(key) ?? 0) + 1;
  seen.set(key, n);
  return n === 1 ? key : `${base}-${n}.${ext}`;
}

// Test helper: reset the collision counter so a test's expectations are not
// polluted by names produced in an earlier test.
export function resetUniqueNames(): void {
  seen.clear();
}
