export type SaveFileOptions = {
  suggestedName: string
  description: string
  mimeType: string
  extensions: string[]
}

export function projectJsonFilename(projectName: string): string {
  const withoutControlCharacters = Array.from(projectName.trim())
    .filter((character) => (character.codePointAt(0) ?? 0) >= 32)
    .join('')
  const safeName = withoutControlCharacters
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/[.\s]+$/g, '')
  return `${safeName || 'Untitled panel'}_OpenPanel.json`
}

export function projectNameFromFilename(filename: string): string {
  return filename
    .replace(/_OpenPanel\.json$/i, '')
    .replace(/\.(?:json|op|openpanel)$/i, '')
    .replace(/[_-]+/g, ' ')
    .trim() || 'Imported panel'
}

type FilePickerWindow = Window & {
  showSaveFilePicker?: (options: {
    suggestedName: string
    types: Array<{ description: string; accept: Record<string, string[]> }>
  }) => Promise<FileSystemFileHandle>
  showOpenFilePicker?: (options: {
    multiple: boolean
    types: Array<{ description: string; accept: Record<string, string[]> }>
  }) => Promise<FileSystemFileHandle[]>
}

function downloadFallback(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export async function saveBlob(blob: Blob, options: SaveFileOptions): Promise<void> {
  const picker = (window as FilePickerWindow).showSaveFilePicker
  if (picker) {
    try {
      const handle = await picker({
        suggestedName: options.suggestedName,
        types: [{ description: options.description, accept: { [options.mimeType]: options.extensions } }],
      })
      const writable = await handle.createWritable()
      await writable.write(blob)
      await writable.close()
      return
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      // Browsers can expose the picker but reject it under policy; download remains available.
    }
  }
  downloadFallback(options.suggestedName, blob)
}

export async function openTextFile(
  options: Omit<SaveFileOptions, 'suggestedName'>,
  fallbackInput: HTMLInputElement | null,
): Promise<File | null> {
  const picker = (window as FilePickerWindow).showOpenFilePicker
  if (picker) {
    try {
      const handles = await picker({
        multiple: false,
        types: [{ description: options.description, accept: { [options.mimeType]: options.extensions } }],
      })
      return handles[0] ? handles[0].getFile() : null
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return null
    }
  }
  fallbackInput?.click()
  return null
}
