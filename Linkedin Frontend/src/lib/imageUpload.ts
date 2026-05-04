export function handleImageUpload(file: File, maxSizeMB = 5): { url: string; error?: string } {
  if (!file.type.startsWith('image/')) {
    return { url: '', error: 'Invalid file type' }
  }

  if (file.size > maxSizeMB * 1024 * 1024) {
    return { url: '', error: 'File too large' }
  }

  return { url: URL.createObjectURL(file) }
}

function guessImageMimeType(file: File): string {
  if (file.type.startsWith('image/')) return file.type
  const ext = file.name.toLowerCase().split('.').pop()
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'png':
      return 'image/png'
    case 'gif':
      return 'image/gif'
    case 'webp':
      return 'image/webp'
    case 'bmp':
      return 'image/bmp'
    case 'svg':
    case 'svgz':
      return 'image/svg+xml'
    case 'heic':
      return 'image/heic'
    case 'heif':
      return 'image/heif'
    default:
      return file.type || 'application/octet-stream'
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000
  let binary = ''
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const slice = bytes.subarray(index, index + chunkSize)
    binary += String.fromCharCode(...slice)
  }
  return btoa(binary)
}

/**
 * Read an image as a data URL so it can be sent to the API and shown on other users' browsers.
 * `blob:` URLs from {@link handleImageUpload} are only valid in the tab that created them.
 */
export async function readImageFileAsDataUrl(file: File, maxSizeMB = 8): Promise<{ url: string; error?: string }> {
  const mimeType = guessImageMimeType(file)
  if (!mimeType.startsWith('image/')) {
    return { url: '', error: 'Invalid file type' }
  }
  if (file.size > maxSizeMB * 1024 * 1024) {
    return { url: '', error: 'File too large' }
  }

  if (typeof file.arrayBuffer === 'function') {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      return { url: `data:${mimeType};base64,${bytesToBase64(bytes)}` }
    } catch {
      // Fall back to FileReader for browsers with partial Blob support.
    }
  }

  const url = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('read failed'))
    reader.readAsDataURL(file)
  })
  return { url }
}
