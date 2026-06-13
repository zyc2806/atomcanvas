import { describe, expect, it, vi } from 'vitest'

import { executeImageExportCapture, getScaledExportSize } from './imageExportExecutor'

describe('imageExportExecutor', () => {
  it('calculates dpi-scaled output dimensions from 96dpi baseline', () => {
    const scaled = getScaledExportSize({ width: 800, height: 600, dpi: 192 })

    expect(scaled.width).toBe(1600)
    expect(scaled.height).toBe(1200)
  })

  it('uses logical canvas size so dpi matches configured value', async () => {
    const sourceCanvas = {
      width: 1600,
      height: 1200,
      clientWidth: 800,
      clientHeight: 600,
      getBoundingClientRect: () => ({ width: 800, height: 600 }),
    } as unknown as HTMLCanvasElement

    const drawImage = vi.fn()
    const originalCreateElement = document.createElement.bind(document)
    const createElementSpy = vi
      .spyOn(document, 'createElement')
      .mockImplementation((tagName: string) => {
        if (tagName === 'canvas') {
          return {
            width: 0,
            height: 0,
            getContext: () => ({ drawImage }),
            toBlob: (callback: BlobCallback) => callback(new Blob(['ok'], { type: 'image/png' })),
          } as unknown as HTMLCanvasElement
        }
        return originalCreateElement(tagName)
      })

    try {
      const result = await executeImageExportCapture({
        sourceCanvas,
        options: {
          format: 'png',
          dpi: 192,
          showAxes: true,
          showLegend: true,
          transparentBackground: false,
        },
      })

      expect(result.width).toBe(1600)
      expect(result.height).toBe(1200)
      expect(drawImage).toHaveBeenCalledWith(sourceCanvas, 0, 0, 1600, 1200)
    } finally {
      createElementSpy.mockRestore()
    }
  })

  it('forces transparent background off when exporting jpeg', async () => {
    const sourceCanvas = {
      width: 400,
      height: 300,
    } as HTMLCanvasElement

    const drawImage = vi.fn()
    const offscreenToBlob = vi.fn((callback: BlobCallback) => callback(new Blob(['ok'], { type: 'image/jpeg' })))

    const originalCreateElement = document.createElement.bind(document)
    const createElementSpy = vi
      .spyOn(document, 'createElement')
      .mockImplementation((tagName: string) => {
        if (tagName === 'canvas') {
          return {
            width: 0,
            height: 0,
            getContext: () => ({ drawImage }),
            toBlob: offscreenToBlob,
          } as unknown as HTMLCanvasElement
        }
        return originalCreateElement(tagName)
      })

    try {
      const result = await executeImageExportCapture({
        sourceCanvas,
        options: {
          format: 'jpeg',
          dpi: 150,
          showAxes: true,
          showLegend: true,
          transparentBackground: true,
        },
      })

      expect(result.mimeType).toBe('image/jpeg')
      expect(drawImage).toHaveBeenCalledWith(sourceCanvas, 0, 0, result.width, result.height)
    } finally {
      createElementSpy.mockRestore()
    }
  })

  it('throws when blob generation fails', async () => {
    const sourceCanvas = {
      width: 320,
      height: 240,
    } as HTMLCanvasElement

    const originalCreateElement = document.createElement.bind(document)
    const createElementSpy = vi
      .spyOn(document, 'createElement')
      .mockImplementation((tagName: string) => {
        if (tagName === 'canvas') {
          return {
            width: 0,
            height: 0,
            getContext: () => ({ drawImage: vi.fn() }),
            toBlob: (callback: BlobCallback) => callback(null),
          } as unknown as HTMLCanvasElement
        }
        return originalCreateElement(tagName)
      })

    try {
      await expect(
        executeImageExportCapture({
          sourceCanvas,
          options: {
            format: 'png',
            dpi: 150,
            showAxes: true,
            showLegend: true,
            transparentBackground: true,
          },
        }),
      ).rejects.toThrow('Failed to generate export blob')
    } finally {
      createElementSpy.mockRestore()
    }
  })
})
