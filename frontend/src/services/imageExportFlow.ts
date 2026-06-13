import {
  sanitizeImageExportOptions,
  type ImageExportFormat,
  type ImageExportOptions,
  type ImageExportRotationOptions,
} from './imageExportOptions'
import type { LegendItem } from './imageLegendComposite'

interface BuildImageExportFilenameParams {
  structureName?: string | null
  format: ImageExportFormat
  now?: () => Date
}

interface CaptureResult {
  blob: Blob
  mimeType: string
  width: number
  height: number
}

interface ComposeResult {
  blob: Blob
  width: number
  height: number
}

interface RunImageExportFlowParams {
  structureName?: string | null
  sourceCanvas: HTMLCanvasElement
  options: ImageExportOptions
  legendItems: LegendItem[]
  isExporting: boolean
  setExporting: (value: boolean) => void
  getAxesVisible: () => boolean
  setAxesVisible: (value: boolean) => void
  getTransparentBackground?: () => boolean
  setTransparentBackground?: (value: boolean) => void
  captureImage: (args: { sourceCanvas: HTMLCanvasElement; options: ImageExportOptions }) => Promise<CaptureResult>
  composeLegend: (args: {
    sourceCanvas: HTMLCanvasElement
    width: number
    height: number
    dpi: number
    showLegend: boolean
    legendItems: LegendItem[]
    mimeType: string
    includeSource?: boolean
  }) => Promise<ComposeResult>
  downloadImage: (blob: Blob, filename: string) => void
  rotateToFrame?: (args: {
    frameIndex: number
    frameCount: number
    rotation: ImageExportRotationOptions
  }) => Promise<void> | void
  onMetadata?: (metadata: ImageExportMetadata) => void
  now?: () => Date
}

let exportTransactionInFlight = false

const waitForRenderSync = async (frames = 2): Promise<void> => {
  for (let index = 0; index < frames; index += 1) {
    await new Promise<void>((resolve) => {
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => resolve())
        return
      }
      setTimeout(() => resolve(), 0)
    })
  }
}

const waitForStableViewStateSync = async (
  check: () => boolean,
  maxFrames = 12,
  stableFrames = 2,
): Promise<boolean> => {
  let stablePasses = 0

  for (let frame = 0; frame < maxFrames; frame += 1) {
    if (check()) {
      stablePasses += 1
      if (stablePasses >= stableFrames) {
        return true
      }
    } else {
      stablePasses = 0
    }
    await waitForRenderSync(1)
  }

  return check()
}

export interface ImageExportMetadata {
  filename: string
  legendFilename?: string
  format: ImageExportFormat
  dpi: number
  renderParamsJson?: string
}

const toDateStamp = (date: Date): string => {
  const yyyy = String(date.getFullYear())
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  const ss = String(date.getSeconds()).padStart(2, '0')
  return `${yyyy}${mm}${dd}_${hh}${min}${ss}`
}

const sanitizeStructureName = (name?: string | null): string => {
  const trimmed = (name ?? '').trim()
  if (!trimmed) {
    return 'structure'
  }
  return trimmed.replace(/[^a-zA-Z0-9_-]+/g, '_')
}

export const buildImageExportFilename = ({ structureName, format, now = () => new Date() }: BuildImageExportFilenameParams): string => {
  const base = sanitizeStructureName(structureName)
  return `${base}_${toDateStamp(now())}.${format}`
}

const appendFrameSuffix = (filename: string, frameIndex: number): string => {
  const suffix = `_f${String(frameIndex + 1).padStart(4, '0')}`
  const extIndex = filename.lastIndexOf('.')
  if (extIndex <= 0) {
    return `${filename}${suffix}`
  }
  return `${filename.slice(0, extIndex)}${suffix}${filename.slice(extIndex)}`
}

export const runImageExportFlow = async ({
  structureName,
  sourceCanvas,
  options,
  legendItems,
  isExporting,
  setExporting,
  getAxesVisible,
  setAxesVisible,
  getTransparentBackground,
  setTransparentBackground,
  captureImage,
  composeLegend,
  downloadImage,
  rotateToFrame,
  onMetadata,
  now,
}: RunImageExportFlowParams): Promise<boolean> => {
  if (isExporting || exportTransactionInFlight) {
    return false
  }

  const normalized = sanitizeImageExportOptions(options)
  const previousAxesVisible = getAxesVisible()
  const hasTransparentController = typeof getTransparentBackground === 'function' && typeof setTransparentBackground === 'function'
  const previousTransparentBackground = hasTransparentController ? (getTransparentBackground() ?? false) : false

  exportTransactionInFlight = true
  setExporting(true)
  try {
    const isViewReady = () => {
      const axesReady = getAxesVisible() === normalized.showAxes
      const transparentReady = !hasTransparentController
        || (getTransparentBackground?.() ?? false) === normalized.transparentBackground
      return axesReady && transparentReady
    }

    setAxesVisible(normalized.showAxes)
    if (hasTransparentController) {
      setTransparentBackground(normalized.transparentBackground)
    }

    let viewReady = await waitForStableViewStateSync(isViewReady)
    if (!viewReady) {
      setAxesVisible(normalized.showAxes)
      if (hasTransparentController) {
        setTransparentBackground(normalized.transparentBackground)
      }
      await waitForRenderSync(2)
      viewReady = await waitForStableViewStateSync(isViewReady)
    }

    if (!viewReady) {
      await waitForRenderSync(2)
    }

    await waitForRenderSync(2)

    if (normalized.transparentBackground) {
      const gl = typeof sourceCanvas.getContext === 'function'
        ? (sourceCanvas.getContext('webgl2') ?? sourceCanvas.getContext('webgl') as WebGLRenderingContext | null)
        : null
      if (gl && typeof gl.clearColor === 'function') {
        gl.clearColor(0, 0, 0, 0)
      }
      await waitForRenderSync(2)
    }

    const renderSyncFrames = normalized.showAxes ? 3 : 5
    await waitForRenderSync(renderSyncFrames)

    if (!normalized.showAxes) {
      const axesHiddenStable = await waitForStableViewStateSync(() => getAxesVisible() === false, 8, 2)
      if (!axesHiddenStable) {
        setAxesVisible(false)
        await waitForRenderSync(2)
      }
    }

    if (normalized.transparentBackground) {
      await new Promise<void>((resolve) => {
        if (typeof requestAnimationFrame !== 'function') {
          setTimeout(() => resolve(), 0)
          return
        }
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resolve())
        })
      })
    }

    const baseFilename = buildImageExportFilename({
      structureName,
      format: normalized.format,
      now,
    })

    const rotation = normalized.rotation
    const frameCount = rotation?.enabled
      ? Math.max(1, Math.round(rotation.frames))
      : 1

    let metadataFilename: string | undefined
    let metadataLegendFilename: string | undefined

    for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
      if (rotation && rotation.enabled && typeof rotateToFrame === 'function') {
        await rotateToFrame({
          frameIndex,
          frameCount,
          rotation,
        })
        await waitForRenderSync(2)
      }

      if (normalized.transparentBackground) {
        const gl = typeof sourceCanvas.getContext === 'function'
          ? (sourceCanvas.getContext('webgl2') ?? sourceCanvas.getContext('webgl') as WebGLRenderingContext | null)
          : null
        if (gl && typeof gl.clearColor === 'function') {
          gl.clearColor(0, 0, 0, 0)
        }
      }

      const captured = await captureImage({ sourceCanvas, options: normalized })

      const filename = frameCount > 1
        ? appendFrameSuffix(baseFilename, frameIndex)
        : baseFilename
      downloadImage(captured.blob, filename)

      let legendFilename: string | undefined

      if (normalized.showLegend && legendItems.length > 0) {
        const legendOnly = await composeLegend({
          sourceCanvas,
          width: captured.width,
          height: captured.height,
          dpi: normalized.dpi,
          showLegend: true,
          legendItems,
          mimeType: captured.mimeType,
          includeSource: false,
        })
        legendFilename = filename.replace(/\.[^.]+$/, `_legend.${normalized.format}`)
        downloadImage(legendOnly.blob, legendFilename)
      }

      if (!metadataFilename) {
        metadataFilename = filename
        metadataLegendFilename = legendFilename
      }
    }

    onMetadata?.({
      filename: metadataFilename ?? baseFilename,
      legendFilename: metadataLegendFilename,
      format: normalized.format,
      dpi: normalized.dpi,
      renderParamsJson: normalized.renderParamsJson,
    })

    return true
  } finally {
    setAxesVisible(previousAxesVisible)
    if (hasTransparentController) {
      setTransparentBackground(previousTransparentBackground)
    }
    setExporting(false)
    exportTransactionInFlight = false
  }
}
