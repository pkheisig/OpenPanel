import { createContext, createElement, useContext, useEffect, useState, type ReactNode } from 'react'
import type { SaveFileOptions } from '../browserFiles'
import type {
  ProjectState,
  StoredPanelProject,
} from '../projectStore'
import type { AppTheme } from '../themePreference'
import { createDefaultOpenPanelHostServices } from '../standalone/standaloneHost'

export const OPEN_PANEL_UI_CONTRACT_VERSION = '0.1.0-bootstrap' as const

export type OpenPanelHostOwnership = {
  globalChrome?: boolean
  theme?: boolean
  updater?: boolean
  windowClose?: boolean
}

export type OpenPanelStorage = {
  getItem(key: string): string | null
  setItem(key: string, value: string): boolean
  removeItem(key: string): void
}

export type OpenPanelFileServices = {
  openTextFile(
    options: Omit<SaveFileOptions, 'suggestedName'>,
    fallbackInput: HTMLInputElement | null,
  ): Promise<File | null>
  readTextFileWithinLimit(file: File, maxBytes: number, description: string): Promise<string>
  saveBlob(blob: Blob, options: SaveFileOptions): Promise<void>
}

export type OpenPanelAssetResolver = {
  isDefault?: boolean
  resolveDataUrl(filename: string): string
  loadText(filename: string): Promise<string>
}

export type OpenPanelProjectRepository = {
  listPanelProjects(): Promise<StoredPanelProject[]>
  loadLastPanelProject(): Promise<StoredPanelProject | null>
  createPanelProject(name: string, state: ProjectState): Promise<StoredPanelProject>
  savePanelProject(id: string, name: string, state: ProjectState): Promise<StoredPanelProject>
  saveActiveProject(state: ProjectState): Promise<void>
  renamePanelProject(id: string, name: string): Promise<StoredPanelProject | null>
  duplicatePanelProject(id: string): Promise<StoredPanelProject | null>
  archivePanelProject(id: string): Promise<StoredPanelProject | null>
  restorePanelProject(id: string): Promise<StoredPanelProject | null>
  deletePanelProject(id: string): Promise<void>
  setActivePanelProject(id: string): void
}

export type OpenPanelThemeServices = {
  read(fallback?: AppTheme): AppTheme
  save(theme: AppTheme): void
}

export type OpenPanelNavigationServices = {
  requestExit?(): void | Promise<void>
}

export type OpenPanelHostServices = {
  storage: OpenPanelStorage
  projects: OpenPanelProjectRepository
  files: OpenPanelFileServices
  theme: OpenPanelThemeServices
  assets?: OpenPanelAssetResolver
  navigation?: OpenPanelNavigationServices
}

export type OpenPanelApplicationContext = {
  mode?: 'standalone' | 'embedded'
  theme?: AppTheme
  density?: 'compact' | 'comfortable'
  uiContractVersion?: string
  ownership?: OpenPanelHostOwnership
  /** @deprecated Use ownership. Kept for hosts during the bootstrap contract. */
  hostOwnership?: OpenPanelHostOwnership
  projectPath?: string
  projectRevision?: string
  initialCytometer?: string
  initialConfiguration?: string
  initialProject?: ProjectState
  projectId?: string
  projectName?: string
  onRequestExit?: () => void | Promise<void>
}

export function normalizeOpenPanelApplicationContext(
  context: OpenPanelApplicationContext = {},
): OpenPanelApplicationContext {
  return {
    mode: 'standalone',
    uiContractVersion: OPEN_PANEL_UI_CONTRACT_VERSION,
    density: 'compact',
    ...context,
  }
}

export function validateOpenPanelApplicationContext(
  context: OpenPanelApplicationContext,
): void {
  if (context.uiContractVersion && context.uiContractVersion !== OPEN_PANEL_UI_CONTRACT_VERSION) {
    throw new Error(`OpenPanel UI contract version is unsupported: ${context.uiContractVersion}.`)
  }
  if (context.density && !['compact', 'comfortable'].includes(context.density)) {
    throw new Error(`OpenPanel density is unsupported: ${context.density}.`)
  }
}

export function openPanelHostOwns(
  context: OpenPanelApplicationContext,
  ownership: keyof OpenPanelHostOwnership,
): boolean {
  const declared = context.ownership ?? context.hostOwnership
  if (declared && declared[ownership] !== undefined) return declared[ownership] === true
  return context.mode === 'embedded'
}

export type OpenPanelLifecycleState = {
  status: 'created' | 'mounted' | 'suspended' | 'unmounted'
  activeProjectId: string | null
  activeWorkspace: string | null
  dirty: boolean
  persistenceInFlight: boolean
  busy: boolean
  context: OpenPanelApplicationContext
}

export type OpenPanelLifecycleReporter = {
  getState(): OpenPanelLifecycleState
  report(patch: Partial<Omit<OpenPanelLifecycleState, 'status' | 'context'>>): void
  updateContext(context: OpenPanelApplicationContext): void
  setStatus(status: OpenPanelLifecycleState['status']): void
  subscribe(listener: (state: OpenPanelLifecycleState) => void): () => void
}

export function createOpenPanelLifecycleReporter(
  context: OpenPanelApplicationContext = {},
): OpenPanelLifecycleReporter {
  let state: OpenPanelLifecycleState = {
    status: 'created',
    activeProjectId: null,
    activeWorkspace: null,
    dirty: false,
    persistenceInFlight: false,
    busy: false,
    context,
  }
  const listeners = new Set<(nextState: OpenPanelLifecycleState) => void>()
  const publish = (): void => {
    listeners.forEach((listener) => listener(state))
  }
  return {
    getState: () => state,
    report: (patch) => {
      state = { ...state, ...patch }
      publish()
    },
    updateContext: (nextContext) => {
      state = { ...state, context: nextContext }
      publish()
    },
    setStatus: (status) => {
      state = { ...state, status }
      publish()
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

type OpenPanelHostContextValue = {
  services: OpenPanelHostServices
  applicationContext: OpenPanelApplicationContext
  lifecycle: OpenPanelLifecycleReporter
}

const OpenPanelContext = createContext<OpenPanelHostContextValue | null>(null)

export function OpenPanelHostProvider({
  services,
  applicationContext = {},
  lifecycle,
  children,
}: {
  services: OpenPanelHostServices
  applicationContext?: OpenPanelApplicationContext
  lifecycle?: OpenPanelLifecycleReporter
  children: ReactNode
}) {
  validateOpenPanelApplicationContext(applicationContext)
  const [providerLifecycle] = useState<OpenPanelLifecycleReporter>(
    () => lifecycle ?? createOpenPanelLifecycleReporter(applicationContext),
  )
  useEffect(() => {
    providerLifecycle.updateContext(applicationContext)
  }, [applicationContext, providerLifecycle])
  return createElement(
    OpenPanelContext.Provider,
    { value: {
      services,
      applicationContext,
      lifecycle: providerLifecycle,
    } },
    children,
  )
}

export function useOpenPanelHostContext(): OpenPanelHostContextValue {
  const inherited = useContext(OpenPanelContext)
  const [fallback] = useState<OpenPanelHostContextValue>(() => {
    const applicationContext: OpenPanelApplicationContext = { mode: 'standalone' }
    return {
      services: createDefaultOpenPanelHostServices(),
      applicationContext,
      lifecycle: createOpenPanelLifecycleReporter(applicationContext),
    }
  })
  return inherited ?? fallback
}

export function useOpenPanelHostServices(): OpenPanelHostServices {
  return useOpenPanelHostContext().services
}

export function useOpenPanelApplicationContext(): OpenPanelApplicationContext {
  return useOpenPanelHostContext().applicationContext
}

export function useOpenPanelLifecycle(): OpenPanelLifecycleReporter {
  return useOpenPanelHostContext().lifecycle
}
