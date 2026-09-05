// @vitest-environment jsdom
import React from 'react'
import { cleanup, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  OPEN_PANEL_APPLICATION_MANIFEST,
  createOpenPanelModule,
  validateOpenPanelApplicationManifest,
} from '../src/module/OpenPanelApplication'
import {
  OPEN_PANEL_UI_CONTRACT_VERSION,
  normalizeOpenPanelApplicationContext,
  openPanelHostOwns,
  validateOpenPanelApplicationContext,
} from '../src/module/hostServices'
import type { OpenPanelHostServices } from '../src/module/hostServices'

vi.mock('../src/App', () => ({
  default: () => React.createElement('div', { 'data-testid': 'mock-openpanel-app' }, 'OpenPanel'),
}))

function services(navigation?: () => void): OpenPanelHostServices {
  return {
    storage: {
      getItem: () => null,
      setItem: () => true,
      removeItem: () => undefined,
    },
    projects: {
      listPanelProjects: async () => [],
      loadLastPanelProject: async () => null,
      createPanelProject: async () => { throw new Error('unused') },
      savePanelProject: async () => { throw new Error('unused') },
      saveActiveProject: async () => undefined,
      renamePanelProject: async () => null,
      duplicatePanelProject: async () => null,
      archivePanelProject: async () => null,
      restorePanelProject: async () => null,
      deletePanelProject: async () => undefined,
      setActivePanelProject: () => undefined,
    },
    files: {
      openTextFile: async () => null,
      readTextFileWithinLimit: async () => '',
      saveBlob: async () => undefined,
    },
    theme: {
      read: () => 'light',
      save: () => undefined,
    },
    navigation: { requestExit: navigation },
    assets: {
      resolveDataUrl: (filename) => `data://${filename}`,
      loadText: async () => '',
    },
  }
}

afterEach(() => cleanup())

describe('OpenPanel application module', () => {
  test('publishes a validated manifest and lifecycle-safe mount surface', async () => {
    validateOpenPanelApplicationManifest()
    expect(OPEN_PANEL_APPLICATION_MANIFEST.id).toBe('openpanel')
    expect(OPEN_PANEL_APPLICATION_MANIFEST.moduleVersion).toBe('1.0.0')
    expect(OPEN_PANEL_APPLICATION_MANIFEST.applicationContractVersion).toBe('0.1.0-bootstrap')
    expect(OPEN_PANEL_APPLICATION_MANIFEST.runtimeContractVersion).toBe('0.1.0-bootstrap')
    expect(OPEN_PANEL_APPLICATION_MANIFEST.uiContractVersion).toBe('0.1.0-bootstrap')
    expect(OPEN_PANEL_APPLICATION_MANIFEST.uiContractVersion).toBe(OPEN_PANEL_UI_CONTRACT_VERSION)
    expect(OPEN_PANEL_APPLICATION_MANIFEST.entrypoints).toEqual({
      application: './openpanel.js',
      stylesheet: './openpanel.css',
    })
    expect(OPEN_PANEL_APPLICATION_MANIFEST.assetManifest).toBe('./asset-manifest.json')
    expect(OPEN_PANEL_APPLICATION_MANIFEST.dependenciesManifest).toBe('./dependencies.json')
    expect(OPEN_PANEL_APPLICATION_MANIFEST.sourceCommit).toMatch(/^(dev|[0-9a-f]{40})$/)

    const exit = vi.fn()
    const container = document.createElement('section')
    const module = createOpenPanelModule(services(exit))
    module.mount(container, { mode: 'embedded', projectId: 'embedded-panel' })

    expect(module.getLifecycleState()).toMatchObject({
      status: 'mounted',
      context: { mode: 'embedded', projectId: 'embedded-panel' },
    })
    await waitFor(() => expect(container.querySelector('[data-testid="mock-openpanel-app"]')).not.toBeNull())
    expect(container.querySelector('.openpanel-module-root')).toMatchObject({
      dataset: expect.objectContaining({
        openpanelMode: 'embedded',
        openpanelTheme: 'light',
        openpanelDensity: 'compact',
        openpanelUiContract: OPEN_PANEL_UI_CONTRACT_VERSION,
      }),
    })

    module.suspend()
    expect(module.getLifecycleState().status).toBe('suspended')
    await waitFor(() => expect(container.querySelector('[data-openpanel-module-root="true"]')?.hasAttribute('hidden')).toBe(true))
    module.resume()
    expect(module.getLifecycleState().status).toBe('mounted')

    await expect(module.requestClose()).resolves.toEqual({ kind: 'allowed' })
    expect(exit).toHaveBeenCalledTimes(1)
    module.unmount()
    expect(module.getLifecycleState().status).toBe('unmounted')
    expect(container.childElementCount).toBe(0)

    module.mount(container)
    await waitFor(() => expect(container.querySelector('[data-testid="mock-openpanel-app"]')).not.toBeNull())
    expect(container.querySelector('[data-openpanel-module-root="true"]')?.hasAttribute('hidden')).toBe(false)
    module.unmount()
  })

  test('rejects unsupported manifests and duplicate mounts', () => {
    const invalid = { ...OPEN_PANEL_APPLICATION_MANIFEST, schemaVersion: 2 }
    expect(() => validateOpenPanelApplicationManifest(invalid as typeof OPEN_PANEL_APPLICATION_MANIFEST)).toThrow(/schema version/)

    const module = createOpenPanelModule(services())
    const container = document.createElement('section')
    module.mount(container)
    expect(() => module.mount(container)).toThrow(/already mounted/)
    module.unmount()
  })

  test('normalizes and validates host-owned UI context', () => {
    const context = normalizeOpenPanelApplicationContext({
      mode: 'embedded',
      theme: 'dark',
      ownership: { globalChrome: true, theme: true, windowClose: true },
    })
    expect(context).toMatchObject({
      mode: 'embedded',
      theme: 'dark',
      density: 'compact',
      uiContractVersion: OPEN_PANEL_UI_CONTRACT_VERSION,
    })
    expect(openPanelHostOwns(context, 'globalChrome')).toBe(true)
    expect(openPanelHostOwns(context, 'theme')).toBe(true)
    expect(openPanelHostOwns({ mode: 'embedded' }, 'globalChrome')).toBe(false)
    expect(openPanelHostOwns({ mode: 'embedded' }, 'windowClose')).toBe(false)
    expect(openPanelHostOwns({ ...context, ownership: { windowClose: false } }, 'windowClose')).toBe(false)
    expect(openPanelHostOwns({ mode: 'standalone' }, 'theme')).toBe(false)
    expect(() => validateOpenPanelApplicationContext({ uiContractVersion: '9.9.9' })).toThrow(/unsupported/)
  })
})
