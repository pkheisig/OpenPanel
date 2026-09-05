import type { OpenPanelAssetResolver } from '../module/hostServices'

export function dataUrl(filename: string, baseUrl = import.meta.env.BASE_URL): string {
  const origin = typeof window === 'undefined' ? 'http://localhost' : window.location.origin
  return new URL(`data/${filename}`, new URL(baseUrl, origin)).toString()
}

export function createBrowserAssetResolver(baseUrl = import.meta.env.BASE_URL): OpenPanelAssetResolver {
  const resolveDataUrl = (filename: string): string => dataUrl(filename, baseUrl)
  return {
    isDefault: true,
    resolveDataUrl,
    async loadText(filename) {
      const response = await fetch(resolveDataUrl(filename))
      if (!response.ok) throw new Error(`could not load bundled data file (${response.status}).`)
      return response.text()
    },
  }
}
