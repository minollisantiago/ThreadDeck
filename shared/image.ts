const imageTypes: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' }

// Only raster formats may render inline; SVG/HTML always remain downloads.
export function inlineImageType(filename: string, contentType?: string | null): string | undefined {
  const type = contentType?.split(';')[0].trim().toLowerCase()
  if (type && Object.values(imageTypes).includes(type)) return type
  if (type && type !== 'application/octet-stream') return undefined
  const extension = filename.split('.').at(-1)?.toLowerCase() || ''
  return Object.hasOwn(imageTypes, extension) ? imageTypes[extension] : undefined
}
