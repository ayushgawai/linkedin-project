export function handleImageUpload(file: File, maxSizeMB = 5): { url: string; error?: string } {
  if (!file.type.startsWith('image/')) {
    return { url: '', error: 'Invalid file type' }
  }

  if (file.size > maxSizeMB * 1024 * 1024) {
    return { url: '', error: 'File too large' }
  }

  return { url: URL.createObjectURL(file) }
}
