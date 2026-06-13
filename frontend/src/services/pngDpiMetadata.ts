const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) !== 0 ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
    }
    table[n] = c >>> 0
  }
  return table
})()

const readUint32 = (bytes: Uint8Array, offset: number): number => {
  return (
    (bytes[offset] << 24)
    | (bytes[offset + 1] << 16)
    | (bytes[offset + 2] << 8)
    | bytes[offset + 3]
  ) >>> 0
}

const writeUint32 = (bytes: Uint8Array, offset: number, value: number) => {
  bytes[offset] = (value >>> 24) & 0xff
  bytes[offset + 1] = (value >>> 16) & 0xff
  bytes[offset + 2] = (value >>> 8) & 0xff
  bytes[offset + 3] = value & 0xff
}

const isPng = (bytes: Uint8Array): boolean => {
  if (bytes.length < PNG_SIGNATURE.length) {
    return false
  }
  for (let index = 0; index < PNG_SIGNATURE.length; index += 1) {
    if (bytes[index] !== PNG_SIGNATURE[index]) {
      return false
    }
  }
  return true
}

const crc32 = (bytes: Uint8Array): number => {
  let crc = 0xffffffff
  for (let index = 0; index < bytes.length; index += 1) {
    crc = CRC_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

const createChunk = (type: string, data: Uint8Array): Uint8Array => {
  const typeBytes = new Uint8Array([type.charCodeAt(0), type.charCodeAt(1), type.charCodeAt(2), type.charCodeAt(3)])
  const chunk = new Uint8Array(12 + data.length)
  writeUint32(chunk, 0, data.length)
  chunk.set(typeBytes, 4)
  chunk.set(data, 8)

  const crcInput = new Uint8Array(typeBytes.length + data.length)
  crcInput.set(typeBytes, 0)
  crcInput.set(data, typeBytes.length)
  writeUint32(chunk, 8 + data.length, crc32(crcInput))
  return chunk
}

const createPhysChunk = (dpi: number): Uint8Array => {
  const pixelsPerMeter = Math.max(1, Math.round(dpi / 0.0254))
  const physData = new Uint8Array(9)
  writeUint32(physData, 0, pixelsPerMeter)
  writeUint32(physData, 4, pixelsPerMeter)
  physData[8] = 1
  return createChunk('pHYs', physData)
}

export const patchPngDpiBytes = (bytes: Uint8Array, dpi: number): Uint8Array => {
  if (!isPng(bytes)) {
    return bytes
  }

  // Collect all chunks first, then drop any existing pHYs and insert exactly
  // one fresh pHYs right after IHDR. The previous single-pass approach emitted
  // two pHYs chunks whenever the source already had one (it both inserted
  // after IHDR and replaced the existing chunk).
  type ParsedChunk = { type: string; raw: Uint8Array }
  const chunks: ParsedChunk[] = []
  let offset = PNG_SIGNATURE.length
  while (offset + 8 <= bytes.length) {
    const length = readUint32(bytes, offset)
    const chunkEnd = offset + 12 + length
    if (chunkEnd > bytes.length) {
      return bytes
    }
    const type = String.fromCharCode(
      bytes[offset + 4],
      bytes[offset + 5],
      bytes[offset + 6],
      bytes[offset + 7],
    )
    chunks.push({ type, raw: bytes.slice(offset, chunkEnd) })
    offset = chunkEnd
    if (type === 'IEND') {
      break
    }
  }

  const hasIhdr = chunks.some((chunk) => chunk.type === 'IHDR')
  if (!hasIhdr) {
    return bytes
  }

  const physChunk = createPhysChunk(dpi)
  const reassembled: Uint8Array[] = [bytes.slice(0, PNG_SIGNATURE.length)]
  for (const chunk of chunks) {
    if (chunk.type === 'pHYs') {
      continue
    }
    reassembled.push(chunk.raw)
    if (chunk.type === 'IHDR') {
      reassembled.push(physChunk)
    }
  }

  const totalLength = reassembled.reduce((sum, chunk) => sum + chunk.length, 0)
  const merged = new Uint8Array(totalLength)
  let cursor = 0
  reassembled.forEach((chunk) => {
    merged.set(chunk, cursor)
    cursor += chunk.length
  })

  return merged
}

export const patchPngDpiMetadata = async (blob: Blob, dpi: number): Promise<Blob> => {
  const bytes = new Uint8Array(await new Response(blob).arrayBuffer())
  const patched = patchPngDpiBytes(bytes, dpi)
  const arrayBufferBackedBytes = new Uint8Array(patched)
  return new Blob([arrayBufferBackedBytes.buffer], { type: 'image/png' })
}
