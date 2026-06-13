import { patchPngDpiMetadata } from './pngDpiMetadata'

const DPI_BASELINE = 96

interface ComposeLegendExportBlobParams {
  sourceCanvas: HTMLCanvasElement
  width: number
  height: number
  dpi?: number
  showLegend: boolean
  legendItems: LegendItem[]
  mimeType: string
  includeSource?: boolean
}

export type LegendItem = string | {
  label: string
  color?: string
}

interface NormalizedLegendItem {
  label: string
  color?: string
}

interface ComposeLegendExportBlobResult {
  blob: Blob
  width: number
  height: number
}

interface LegendLayout {
  safeItems: NormalizedLegendItem[]
  lineHeight: number
  blockWidth: number
  blockHeight: number
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

const normalizeLegendItems = (legendItems: LegendItem[]): NormalizedLegendItem[] => {
  return legendItems
    .map((item) => {
      if (typeof item === 'string') {
        return { label: item }
      }
      return item
    })
    .map((item) => ({
      label: item.label.trim(),
      color: item.color,
    }))
    .filter((item) => item.label.length > 0)
}

const resolveRenderScale = (dpi?: number): number => {
  if (typeof dpi !== 'number' || !Number.isFinite(dpi) || dpi <= 0) {
    return 1
  }
  return Math.max(1, dpi / DPI_BASELINE)
}

const buildLegendLayout = (ctx: CanvasRenderingContext2D, legendItems: LegendItem[], scale: number): LegendLayout | null => {
  const safeItems = normalizeLegendItems(legendItems)
  if (safeItems.length === 0) {
    return null
  }

  ctx.font = `${14 * scale}px sans-serif`
  const maxTextWidth = Math.max(...safeItems.map((item) => ctx.measureText(item.label).width))
  const lineHeight = 18 * scale
  const markerSize = 10 * scale
  const markerGap = 8 * scale
  const blockWidth = Math.ceil(maxTextWidth + 28 * scale + markerSize + markerGap)
  const blockHeight = Math.ceil(safeItems.length * lineHeight + 18 * scale)

  return {
    safeItems,
    lineHeight,
    blockWidth,
    blockHeight,
  }
}

const drawLegend = (
  ctx: CanvasRenderingContext2D,
  layout: LegendLayout,
  scale: number,
  x: number,
  y: number,
) => {
  if (layout.safeItems.length === 0) {
    return
  }

  ctx.save()
  ctx.font = `${14 * scale}px sans-serif`
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'

  ctx.fillStyle = 'rgba(20, 20, 24, 0.74)'
  ctx.fillRect(x, y, layout.blockWidth, layout.blockHeight)

  layout.safeItems.forEach((item, index) => {
    const rowY = y + 20 * scale + index * layout.lineHeight
    const markerX = x + 12 * scale
    const markerCenterY = rowY
    ctx.beginPath()
    ctx.arc(markerX + 5 * scale, markerCenterY, 5 * scale, 0, Math.PI * 2)
    ctx.fillStyle = item.color && item.color.trim().length > 0 ? item.color : '#c7d2e0'
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.fillText(item.label, x + 30 * scale, rowY)
  })
  ctx.restore()
}

export const composeLegendExportBlob = async ({
  sourceCanvas,
  width,
  height,
  dpi,
  showLegend,
  legendItems,
  mimeType,
  includeSource = true,
}: ComposeLegendExportBlobParams): Promise<ComposeLegendExportBlobResult> => {
  const renderScale = resolveRenderScale(dpi)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * renderScale))
  canvas.height = Math.max(1, Math.round(height * renderScale))

  let context2d = canvas.getContext('2d')
  if (!context2d) {
    throw new Error('2D rendering context is unavailable')
  }

  const legendLayout = showLegend ? buildLegendLayout(context2d, legendItems, renderScale) : null

  if (!includeSource && legendLayout) {
    const padding = Math.ceil(12 * renderScale)
    canvas.width = Math.max(1, Math.ceil(legendLayout.blockWidth + padding * 2))
    canvas.height = Math.max(1, Math.ceil(legendLayout.blockHeight + padding * 2))
    context2d = canvas.getContext('2d')
    if (!context2d) {
      throw new Error('2D rendering context is unavailable')
    }
  }

  if (includeSource) {
    context2d.drawImage(sourceCanvas, 0, 0, canvas.width, canvas.height)
  } else {
    context2d.fillStyle = '#101216'
    context2d.fillRect(0, 0, canvas.width, canvas.height)
  }

  if (showLegend && legendLayout) {
    const legendX = includeSource
      ? Math.max(Math.ceil(8 * renderScale), canvas.width - legendLayout.blockWidth - Math.ceil(12 * renderScale))
      : Math.ceil(12 * renderScale)
    const legendY = includeSource
      ? Math.max(Math.ceil(8 * renderScale), canvas.height - legendLayout.blockHeight - Math.ceil(12 * renderScale))
      : Math.ceil(12 * renderScale)
    drawLegend(context2d, legendLayout, renderScale, legendX, legendY)
  }

  const rawBlob = await canvasToBlob(canvas, mimeType)
  const blob = mimeType === 'image/png' && typeof dpi === 'number'
    ? await patchPngDpiMetadata(rawBlob, dpi)
    : rawBlob
  return {
    blob,
    width: canvas.width,
    height: canvas.height,
  }
}
