/* eslint-disable react-refresh/only-export-components -- module entrypoint exports its manifest and lifecycle factory. */
import { StrictMode, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import App from '../App'
import {
  OPEN_PANEL_UI_CONTRACT_VERSION,
  OpenPanelHostProvider,
  createOpenPanelLifecycleReporter,
  normalizeOpenPanelApplicationContext,
  validateOpenPanelApplicationContext,
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
  moduleVersion: import.meta.env.VITE_MODULE_VERSION || '1.0.0',
  sourceCommit: import.meta.env.VITE_GIT_COMMIT_SHA || 'dev',
  applicationContractVersion: '0.1.0-bootstrap',
  runtimeContractVersion: '0.1.0-bootstrap',
  uiContractVersion: OPEN_PANEL_UI_CONTRACT_VERSION,
  entrypoints: {
    application: './openpanel.js',
    stylesheet: './openpanel.css',
  },
  assetManifest: './asset-manifest.json',
  types: './index.d.ts',
  dependenciesManifest: './dependencies.json',
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
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(manifest.moduleVersion)) {
    throw new Error('OpenPanel module manifest version is invalid.')
  }
  if (!manifest.applicationContractVersion || !manifest.runtimeContractVersion) {
    throw new Error('OpenPanel module manifest contract versions are required.')
  }
  if (manifest.uiContractVersion !== OPEN_PANEL_UI_CONTRACT_VERSION) {
    throw new Error('OpenPanel module manifest UI contract version is unsupported.')
  }
  if (!manifest.entrypoints.application || !manifest.entrypoints.stylesheet) {
    throw new Error('OpenPanel module manifest entrypoints are required.')
  }
  if (!manifest.assetManifest || !manifest.types || !manifest.dependenciesManifest) {
    throw new Error('OpenPanel module manifest asset, type, and dependency manifests are required.')
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
  const normalizedContext = normalizeOpenPanelApplicationContext(applicationContext)
  validateOpenPanelApplicationContext(normalizedContext)
  return (
    <OpenPanelHostProvider services={services} applicationContext={normalizedContext}>
      <div
        className="openpanel-module-root"
        data-openpanel-module-root="true"
        data-openpanel-mode={normalizedContext.mode}
        data-openpanel-theme={normalizedContext.theme ?? 'light'}
        data-openpanel-density={normalizedContext.density}
        data-openpanel-ui-contract={normalizedContext.uiContractVersion}
      >
        {children ?? <App />}
      </div>
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
  let currentContext: OpenPanelApplicationContext = normalizeOpenPanelApplicationContext()
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
          <div
            className="openpanel-module-root"
            data-openpanel-module-root="true"
            data-openpanel-mode={currentContext.mode}
            data-openpanel-theme={currentContext.theme ?? 'light'}
            data-openpanel-density={currentContext.density}
            data-openpanel-ui-contract={currentContext.uiContractVersion}
            data-suspended={suspended ? 'true' : 'false'}
            hidden={suspended}
          >
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
      currentContext = normalizeOpenPanelApplicationContext(initialContext)
      validateOpenPanelApplicationContext(currentContext)
      lifecycle.updateContext(currentContext)
      moduleRoot = document.createElement('div')
      moduleRoot.dataset.openpanelModule = 'true'
      container.appendChild(moduleRoot)
      root = createRoot(moduleRoot)
      lifecycle.setStatus('mounted')
      render()
    },
    updateContext: (contextPatch) => {
      currentContext = normalizeOpenPanelApplicationContext({ ...currentContext, ...contextPatch })
      validateOpenPanelApplicationContext(currentContext)
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
