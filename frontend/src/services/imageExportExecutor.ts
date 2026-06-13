import { sanitizeImageExportOptions, type ImageExportOptions } from './imageExportOptions'
import { patchPngDpiMetadata } from './pngDpiMetadata'

interface ExportDimensionsInput {
  width: number
  height: number
  dpi: number
}

interface ExecuteImageExportCaptureParams {
  sourceCanvas: HTMLCanvasElement
  options: ImageExportOptions
}

export interface ImageExportCaptureResult {
  blob: Blob
  mimeType: string
  width: number
  height: number
}

const MIME_BY_FORMAT = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
} as const

export const getScaledExportSize = ({ width, height, dpi }: ExportDimensionsInput): { width: number; height: number } => {
  const scale = dpi / 96
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

const getCanvasLogicalSize = (sourceCanvas: HTMLCanvasElement): { width: number; height: number } => {
  const rect = typeof sourceCanvas.getBoundingClientRect === 'function'
    ? sourceCanvas.getBoundingClientRect()
    : null

  const dpr = typeof window !== 'undefined' && Number.isFinite(window.devicePixelRatio) && window.devicePixelRatio > 0
    ? window.devicePixelRatio
    : 1

  const fallbackWidth = sourceCanvas.width > 0 ? sourceCanvas.width / dpr : 0
  const fallbackHeight = sourceCanvas.height > 0 ? sourceCanvas.height / dpr : 0

  const width = sourceCanvas.clientWidth > 0
    ? sourceCanvas.clientWidth
    : (rect?.width ?? 0) > 0
      ? (rect?.width ?? 0)
      : fallbackWidth > 0
        ? fallbackWidth
        : sourceCanvas.width

  const height = sourceCanvas.clientHeight > 0
    ? sourceCanvas.clientHeight
    : (rect?.height ?? 0) > 0
      ? (rect?.height ?? 0)
      : fallbackHeight > 0
        ? fallbackHeight
        : sourceCanvas.height

  return {
    width: Math.max(1, width),
    height: Math.max(1, height),
  }
}

const canvasToBlob = (canvas: HTMLCanvasElement, mimeType: string): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Failed to generate export blob'))
        return
      }
      resolve(blob)
    }, mimeType)
  })
}

export const executeImageExportCapture = async ({
  sourceCanvas,
  options,
}: ExecuteImageExportCaptureParams): Promise<ImageExportCaptureResult> => {
  const sanitized = sanitizeImageExportOptions(options)
  const mimeType = MIME_BY_FORMAT[sanitized.format]

  // Force transparent clear color when exporting with transparent background
  if (sanitized.transparentBackground && typeof sourceCanvas.getContext === 'function') {
    const gl = sourceCanvas.getContext('webgl2') ?? sourceCanvas.getContext('webgl') ?? sourceCanvas.getContext('experimental-webgl') as WebGLRenderingContext | null
    if (gl && typeof gl.clearColor === 'function') {
      gl.clearColor(0, 0, 0, 0)
    }
  }

  const logicalSize = getCanvasLogicalSize(sourceCanvas)

  const { width, height } = getScaledExportSize({
    width: logicalSize.width,
    height: logicalSize.height,
    dpi: sanitized.dpi,
  })

  const exportCanvas = document.createElement('canvas')
  exportCanvas.width = width
  exportCanvas.height = height

  const context2d = exportCanvas.getContext('2d')
  if (!context2d) {
    throw new Error('2D rendering context is unavailable')
  }

  context2d.drawImage(sourceCanvas, 0, 0, width, height)

  const rawBlob = await canvasToBlob(exportCanvas, mimeType)
  const blob = sanitized.format === 'png'
    ? await patchPngDpiMetadata(rawBlob, sanitized.dpi)
    : rawBlob
  return {
    blob,
    mimeType,
    width,
    height,
  }
}
