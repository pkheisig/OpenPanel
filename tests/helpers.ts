import { readFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { vi } from 'vitest'
import { resetSpectralEngineForTests } from '../src/spectralEngine'
import { resetPanelWizardReferencesForTests } from '../src/panelWizardReferences'

const DATA_DIRECTORY = resolve(process.cwd(), 'public/data')

export function mockBundledData(): void {
  resetSpectralEngineForTests()
  resetPanelWizardReferencesForTests()
  vi.stubGlobal('fetch', async (input: string | URL | Request) => {
    const source = input instanceof Request ? input.url : String(input)
    const filename = basename(new URL(source).pathname)
    try {
      const body = await readFile(resolve(DATA_DIRECTORY, filename), 'utf8')
      return new Response(body, { status: 200, headers: { 'content-type': 'text/csv' } })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
}
