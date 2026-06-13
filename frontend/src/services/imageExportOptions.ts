export type ImageExportFormat = 'png' | 'jpeg' | 'webp'

export type ImageExportRotationAxis = 'x' | 'y' | 'z'

export interface ImageExportRotationOptions {
  enabled: boolean
  axis: ImageExportRotationAxis
  degrees: number
  frames: number
  fixedViewport: boolean
}

export interface ImageExportOptions {
  format: ImageExportFormat
  dpi: number
  showAxes: boolean
  showLegend: boolean
  transparentBackground: boolean
  rotation?: ImageExportRotationOptions
  exportRenderParamsJson?: boolean
  renderParamsJson?: string
}

export const IMAGE_EXPORT_DPI_MIN = 72
export const IMAGE_EXPORT_DPI_MAX = 600
export const IMAGE_EXPORT_DPI_STEP = 1

export const IMAGE_EXPORT_DPI_PRESETS = [72, 150, 300, 600] as const

export const IMAGE_EXPORT_ROTATION_FRAMES_MIN = 1
export const IMAGE_EXPORT_ROTATION_FRAMES_MAX = 360

const DEFAULT_IMAGE_EXPORT_ROTATION_OPTIONS: ImageExportRotationOptions = {
  enabled: false,
  axis: 'y',
  degrees: 360,
  frames: 60,
  fixedViewport: true,
}

export const DEFAULT_IMAGE_EXPORT_OPTIONS: ImageExportOptions = {
  format: 'png',
  dpi: 150,
  showAxes: true,
  showLegend: true,
  transparentBackground: false,
  exportRenderParamsJson: false,
}

const IMAGE_EXPORT_FORMATS: ImageExportFormat[] = ['png', 'jpeg', 'webp']
const IMAGE_EXPORT_ROTATION_AXES: ImageExportRotationAxis[] = ['x', 'y', 'z']

const isValidFormat = (value: unknown): value is ImageExportFormat => {
  return typeof value === 'string' && IMAGE_EXPORT_FORMATS.includes(value as ImageExportFormat)
}

const isPlainObject = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
)

const clampRotationFrames = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_IMAGE_EXPORT_ROTATION_OPTIONS.frames
  }

  const rounded = Math.round(value)
  if (rounded < IMAGE_EXPORT_ROTATION_FRAMES_MIN) {
    return IMAGE_EXPORT_ROTATION_FRAMES_MIN
  }
  if (rounded > IMAGE_EXPORT_ROTATION_FRAMES_MAX) {
    return IMAGE_EXPORT_ROTATION_FRAMES_MAX
  }
  return rounded
}

const clampRotationDegrees = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_IMAGE_EXPORT_ROTATION_OPTIONS.degrees
  }

  return Math.max(-3600, Math.min(3600, value))
}

const sanitizeRotation = (value: unknown): ImageExportRotationOptions | undefined => {
  if (value === undefined) {
    return undefined
  }
  if (!isPlainObject(value)) {
    return undefined
  }

  const enabled = typeof value.enabled === 'boolean'
    ? value.enabled
    : DEFAULT_IMAGE_EXPORT_ROTATION_OPTIONS.enabled
  const axis = typeof value.axis === 'string' && IMAGE_EXPORT_ROTATION_AXES.includes(value.axis as ImageExportRotationAxis)
    ? value.axis as ImageExportRotationAxis
    : DEFAULT_IMAGE_EXPORT_ROTATION_OPTIONS.axis
  const degrees = clampRotationDegrees(value.degrees)
  const frames = clampRotationFrames(value.frames)
  const fixedViewport = typeof value.fixedViewport === 'boolean'
    ? value.fixedViewport
    : DEFAULT_IMAGE_EXPORT_ROTATION_OPTIONS.fixedViewport

  if (!enabled) {
    return undefined
  }

  return {
    enabled,
    axis,
    degrees,
    frames,
    fixedViewport,
  }
}

const clampDpi = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_IMAGE_EXPORT_OPTIONS.dpi
  }

  const rounded = Math.round(value)
  if (rounded < IMAGE_EXPORT_DPI_MIN) {
    return IMAGE_EXPORT_DPI_MIN
  }
  if (rounded > IMAGE_EXPORT_DPI_MAX) {
    return IMAGE_EXPORT_DPI_MAX
  }
  return rounded
}

export const sanitizeImageExportOptions = (partial: Partial<ImageExportOptions>): ImageExportOptions => {
  const format = isValidFormat(partial.format) ? partial.format : DEFAULT_IMAGE_EXPORT_OPTIONS.format
  const dpi = clampDpi(partial.dpi)
  const showAxes = typeof partial.showAxes === 'boolean' ? partial.showAxes : DEFAULT_IMAGE_EXPORT_OPTIONS.showAxes
  const showLegend = typeof partial.showLegend === 'boolean' ? partial.showLegend : DEFAULT_IMAGE_EXPORT_OPTIONS.showLegend
  const transparentBackground =
    typeof partial.transparentBackground === 'boolean'
      ? partial.transparentBackground
      : DEFAULT_IMAGE_EXPORT_OPTIONS.transparentBackground

  const renderParamsJson = typeof partial.renderParamsJson === 'string' && partial.renderParamsJson.trim().length > 0
    ? partial.renderParamsJson
    : undefined
  const exportRenderParamsJson = typeof partial.exportRenderParamsJson === 'boolean'
    ? partial.exportRenderParamsJson
    : false
  const rotation = sanitizeRotation(partial.rotation)

  return {
    format,
    dpi,
    showAxes,
    showLegend,
    transparentBackground: format === 'jpeg' ? false : transparentBackground,
    ...(rotation ? { rotation } : {}),
    exportRenderParamsJson,
    renderParamsJson,
  }
}
