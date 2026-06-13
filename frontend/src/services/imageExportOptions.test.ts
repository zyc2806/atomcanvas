import { describe, expect, it } from 'vitest'

import {
  DEFAULT_IMAGE_EXPORT_OPTIONS,
  IMAGE_EXPORT_DPI_MAX,
  IMAGE_EXPORT_DPI_MIN,
  IMAGE_EXPORT_ROTATION_FRAMES_MAX,
  IMAGE_EXPORT_ROTATION_FRAMES_MIN,
  sanitizeImageExportOptions,
  type ImageExportFormat,
  type ImageExportOptions,
} from './imageExportOptions'

describe('imageExportOptions', () => {
  it('provides deterministic defaults', () => {
    expect(DEFAULT_IMAGE_EXPORT_OPTIONS.format).toBe('png')
    expect(DEFAULT_IMAGE_EXPORT_OPTIONS.dpi).toBe(150)
    expect(DEFAULT_IMAGE_EXPORT_OPTIONS.showAxes).toBe(true)
    expect(DEFAULT_IMAGE_EXPORT_OPTIONS.showLegend).toBe(true)
    expect(DEFAULT_IMAGE_EXPORT_OPTIONS.transparentBackground).toBe(false)
    expect(DEFAULT_IMAGE_EXPORT_OPTIONS.exportRenderParamsJson).toBe(false)
  })

  it('clamps dpi to configured bounds', () => {
    const low = sanitizeImageExportOptions({ dpi: IMAGE_EXPORT_DPI_MIN - 10 })
    const high = sanitizeImageExportOptions({ dpi: IMAGE_EXPORT_DPI_MAX + 10 })

    expect(low.dpi).toBe(IMAGE_EXPORT_DPI_MIN)
    expect(high.dpi).toBe(IMAGE_EXPORT_DPI_MAX)
  })

  it('forces transparent background off for jpeg', () => {
    const result = sanitizeImageExportOptions({
      format: 'jpeg',
      transparentBackground: true,
    })

    expect(result.format).toBe('jpeg')
    expect(result.transparentBackground).toBe(false)
  })

  it('keeps transparency for png and webp', () => {
    const formats: ImageExportFormat[] = ['png', 'webp']

    for (const format of formats) {
      const result = sanitizeImageExportOptions({
        format,
        transparentBackground: true,
      })
      expect(result.transparentBackground).toBe(true)
    }
  })

  it('normalizes malformed inputs to safe defaults', () => {
    const malformed = {
      format: 'bmp',
      dpi: Number.NaN,
      showAxes: 'yes',
      showLegend: null,
      transparentBackground: 1,
      exportRenderParamsJson: 'yes',
    } as unknown as Partial<ImageExportOptions>

    const result = sanitizeImageExportOptions(malformed)

    expect(result.format).toBe(DEFAULT_IMAGE_EXPORT_OPTIONS.format)
    expect(result.dpi).toBe(DEFAULT_IMAGE_EXPORT_OPTIONS.dpi)
    expect(result.showAxes).toBe(DEFAULT_IMAGE_EXPORT_OPTIONS.showAxes)
    expect(result.showLegend).toBe(DEFAULT_IMAGE_EXPORT_OPTIONS.showLegend)
    expect(result.transparentBackground).toBe(DEFAULT_IMAGE_EXPORT_OPTIONS.transparentBackground)
    expect(result.exportRenderParamsJson).toBe(false)
  })

  it('keeps exportRenderParamsJson boolean when provided', () => {
    const result = sanitizeImageExportOptions({ exportRenderParamsJson: true })
    expect(result.exportRenderParamsJson).toBe(true)
  })

  it('keeps rotation options when enabled', () => {
    const result = sanitizeImageExportOptions({
      rotation: {
        enabled: true,
        axis: 'x',
        degrees: 270,
        frames: 48,
        fixedViewport: false,
      },
    })

    expect(result.rotation).toEqual({
      enabled: true,
      axis: 'x',
      degrees: 270,
      frames: 48,
      fixedViewport: false,
    })
  })

  it('drops rotation object when disabled', () => {
    const result = sanitizeImageExportOptions({
      rotation: {
        enabled: false,
        axis: 'y',
        degrees: 180,
        frames: 24,
        fixedViewport: true,
      },
    })

    expect(result.rotation).toBeUndefined()
  })

  it('normalizes malformed rotation settings to safe bounds', () => {
    const result = sanitizeImageExportOptions({
      rotation: {
        enabled: true,
        axis: 'invalid-axis' as unknown as 'x',
        degrees: Number.POSITIVE_INFINITY,
        frames: IMAGE_EXPORT_ROTATION_FRAMES_MAX + 100,
        fixedViewport: 'yes' as unknown as boolean,
      },
    })

    expect(result.rotation).toEqual({
      enabled: true,
      axis: 'y',
      degrees: 360,
      frames: IMAGE_EXPORT_ROTATION_FRAMES_MAX,
      fixedViewport: true,
    })

    const minClamped = sanitizeImageExportOptions({
      rotation: {
        enabled: true,
        axis: 'z',
        degrees: -5000,
        frames: IMAGE_EXPORT_ROTATION_FRAMES_MIN - 5,
        fixedViewport: true,
      },
    })

    expect(minClamped.rotation).toEqual({
      enabled: true,
      axis: 'z',
      degrees: -3600,
      frames: IMAGE_EXPORT_ROTATION_FRAMES_MIN,
      fixedViewport: true,
    })
  })
})
