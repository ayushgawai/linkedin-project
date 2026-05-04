export function handleImageUpload(file: File, maxSizeMB = 5): { url: string; error?: string } {
  if (!file.type.startsWith('image/')) {
    return { url: '', error: 'Invalid file type' }
  }

  if (file.size > maxSizeMB * 1024 * 1024) {
    return { url: '', error: 'File too large' }
  }

  return { url: URL.createObjectURL(file) }
}

/**
 * Read an image as a data URL so it can be sent to the API and shown on other users' browsers.
 * `blob:` URLs from {@link handleImageUpload} are only valid in the tab that created them.
 */
export async function readImageFileAsDataUrl(file: File, maxSizeMB = 8): Promise<{ url: string; error?: string }> {
  if (!file.type.startsWith('image/')) {
    return { url: '', error: 'Invalid file type' }
  }
  if (file.size > maxSizeMB * 1024 * 1024) {
    return { url: '', error: 'File too large' }
  }
  const url = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('read failed'))
    reader.readAsDataURL(file)
  })
  return { url }
}

/** Read any file as a data URL (e.g. video) for upload endpoints that accept base64. */
export async function readFileAsDataUrl(file: File, maxSizeMB = 40): Promise<{ url: string; error?: string }> {
  if (file.size > maxSizeMB * 1024 * 1024) {
    return { url: '', error: `File too large (max ${maxSizeMB}MB)` }
  }
  const url = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('read failed'))
    reader.readAsDataURL(file)
  })
  return { url }
}
