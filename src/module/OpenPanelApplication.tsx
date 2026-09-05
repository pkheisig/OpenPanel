/* eslint-disable react-refresh/only-export-components -- module entrypoint exports its manifest and lifecycle factory. */
import { StrictMode, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import App from '../App'
import {
  OpenPanelHostProvider,
  createOpenPanelLifecycleReporter,
} from './hostServices'
import type {
  OpenPanelApplicationContext,
  OpenPanelHostServices,
  OpenPanelLifecycleState,
  OpenPanelLifecycleReporter,
} from './hostServices'

export const OPEN_PANEL_APPLICATION_MANIFEST = {
  schemaVersion: 1,
  id: 'openpanel',
  displayName: 'OpenPanel',
  moduleVersion: '0.1.0',
  sourceCommit: import.meta.env.VITE_GIT_COMMIT_SHA || 'dev',
  applicationContractVersion: '0.1.0-bootstrap',
  runtimeContractVersion: '0.1.0-bootstrap',
  uiContractVersion: '0.1.0-bootstrap',
  entrypoints: {
    application: './module/OpenPanelApplication.tsx',
    stylesheet: './index.css',
  },
  assetManifest: './data/',
  peerDependencies: {
    react: '^19.2.0',
    'react-dom': '^19.2.0',
  },
  capabilities: [
    'projects',
    'files',
    'storage',
    'theme',
    'assets',
    'navigation',
    'lifecycle',
  ],
  fileExtensions: ['.openpanel.json', '.json'],
} as const

export type OpenPanelApplicationManifest = typeof OPEN_PANEL_APPLICATION_MANIFEST

export function validateOpenPanelApplicationManifest(
  manifest: OpenPanelApplicationManifest = OPEN_PANEL_APPLICATION_MANIFEST,
): void {
  if (manifest.schemaVersion !== 1) throw new Error('OpenPanel module manifest schema version is unsupported.')
  if (manifest.id !== 'openpanel') throw new Error('OpenPanel module manifest identity is invalid.')
  if (!manifest.applicationContractVersion || !manifest.runtimeContractVersion) {
    throw new Error('OpenPanel module manifest contract versions are required.')
  }
  if (!manifest.entrypoints.application || !manifest.entrypoints.stylesheet) {
    throw new Error('OpenPanel module manifest entrypoints are required.')
  }
  if (manifest.peerDependencies.react !== '^19.2.0' || manifest.peerDependencies['react-dom'] !== '^19.2.0') {
    throw new Error('OpenPanel module manifest must declare React and ReactDOM as peer dependencies.')
  }
}

export type OpenPanelCloseResult =
  | { kind: 'allowed' }
  | { kind: 'blocked'; reason: 'busy' }
  | { kind: 'requires-confirmation'; reason: 'unsaved-changes' }

export type OpenPanelModule = {
  manifest: OpenPanelApplicationManifest
  mount(container: Element, initialContext?: OpenPanelApplicationContext): void
  updateContext(contextPatch: OpenPanelApplicationContext): void
  getLifecycleState(): OpenPanelLifecycleState
  suspend(): void
  resume(): void
  requestClose(): Promise<OpenPanelCloseResult>
  unmount(): void
}

export function OpenPanelApplication({
  services,
  applicationContext = {},
  children,
}: {
  services: OpenPanelHostServices
  applicationContext?: OpenPanelApplicationContext
  children?: ReactNode
}) {
  return (
    <OpenPanelHostProvider services={services} applicationContext={applicationContext}>
      {children ?? <App />}
    </OpenPanelHostProvider>
  )
}

export function createOpenPanelModule(
  services: OpenPanelHostServices,
  manifest: OpenPanelApplicationManifest = OPEN_PANEL_APPLICATION_MANIFEST,
): OpenPanelModule {
  validateOpenPanelApplicationManifest(manifest)
  let root: Root | null = null
  let moduleRoot: HTMLDivElement | null = null
  let currentContext: OpenPanelApplicationContext = { mode: 'standalone' }
  let suspended = false
  const lifecycle: OpenPanelLifecycleReporter = createOpenPanelLifecycleReporter(currentContext)

  const render = (): void => {
    if (!root) return
    root.render(
      <StrictMode>
        <OpenPanelHostProvider
          services={services}
          applicationContext={currentContext}
          lifecycle={lifecycle}
        >
          <div data-openpanel-module-root="true" data-suspended={suspended ? 'true' : 'false'} hidden={suspended}>
            <App />
          </div>
        </OpenPanelHostProvider>
      </StrictMode>,
    )
  }

  return {
    manifest,
    mount: (container, initialContext = {}) => {
      if (root) throw new Error('OpenPanel module is already mounted.')
      suspended = false
      currentContext = { mode: 'standalone', ...initialContext }
      lifecycle.updateContext(currentContext)
      moduleRoot = document.createElement('div')
      moduleRoot.dataset.openpanelModule = 'true'
      container.appendChild(moduleRoot)
      root = createRoot(moduleRoot)
      lifecycle.setStatus('mounted')
      render()
    },
    updateContext: (contextPatch) => {
      currentContext = { ...currentContext, ...contextPatch }
      lifecycle.updateContext(currentContext)
      render()
    },
    getLifecycleState: () => lifecycle.getState(),
    suspend: () => {
      suspended = true
      lifecycle.setStatus('suspended')
      render()
    },
    resume: () => {
      suspended = false
      lifecycle.setStatus('mounted')
      render()
    },
    requestClose: async () => {
      const state = lifecycle.getState()
      if (state.busy || state.persistenceInFlight) return { kind: 'blocked', reason: 'busy' }
      if (state.dirty) return { kind: 'requires-confirmation', reason: 'unsaved-changes' }
      await (currentContext.onRequestExit ?? services.navigation?.requestExit)?.()
      return { kind: 'allowed' }
    },
    unmount: () => {
      if (!root) return
      root.unmount()
      root = null
      moduleRoot?.remove()
      moduleRoot = null
      suspended = false
      lifecycle.setStatus('unmounted')
    },
  }
}
