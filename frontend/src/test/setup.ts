import '@testing-library/jest-dom';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// Runs a cleanup after each test case (e.g. clearing jsdom)
afterEach(() => {
  cleanup();
});

// Mock ResizeObserver
class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver = ResizeObserver;

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock WebGL Context
// @ts-expect-error - Overriding getContext for WebGL mocking in tests
HTMLCanvasElement.prototype.getContext = function(contextId: string, options?: unknown) {
    void options;
    if (contextId === 'webgl' || contextId === 'experimental-webgl' || contextId === 'webgl2') {
        return {
            getParameter: vi.fn().mockReturnValue(0),
            getExtension: vi.fn().mockReturnValue({}),
            createTexture: vi.fn(),
            bindTexture: vi.fn(),
            texParameteri: vi.fn(),
            texImage2D: vi.fn(),
            clearColor: vi.fn(),
            clear: vi.fn(),
            createBuffer: vi.fn(),
            bindBuffer: vi.fn(),
            bufferData: vi.fn(),
            enable: vi.fn(),
            disable: vi.fn(),
            blendFunc: vi.fn(),
            createProgram: vi.fn(),
            createShader: vi.fn(),
            shaderSource: vi.fn(),
            compileShader: vi.fn(),
            attachShader: vi.fn(),
            linkProgram: vi.fn(),
            useProgram: vi.fn(),
            getProgramParameter: vi.fn().mockReturnValue(true),
            getShaderParameter: vi.fn().mockReturnValue(true),
            getUniformLocation: vi.fn(),
            getAttribLocation: vi.fn(),
            enableVertexAttribArray: vi.fn(),
            vertexAttribPointer: vi.fn(),
            uniformMatrix4fv: vi.fn(),
            uniform1i: vi.fn(),
            uniform1f: vi.fn(),
            drawArrays: vi.fn(),
            drawElements: vi.fn(),
            viewport: vi.fn(),
        } as unknown as WebGLRenderingContext;
    }
    return null;
 }; 

const createLocalStorage = (): Storage => {
  const store = new Map<string, string>();

  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  } as Storage;
};

Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: createLocalStorage(),
});
