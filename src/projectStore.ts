import { openDB } from 'idb'
import type { TabId } from './panelBuilderShared'

export const PROJECT_FILE_KIND = 'OpenPanel project'
export const PROJECT_FILE_VERSION = 1

export type OpenPanelProject = {
  kind: typeof PROJECT_FILE_KIND
  version: typeof PROJECT_FILE_VERSION
  savedAt: string
  cytometer: string
  configuration: string
  slots: string[]
  markers: Record<number, string>
  tab: TabId
  theme: 'light' | 'dark'
  sidebarWidth: number
  sidebarCollapsed: boolean
}

export type ProjectState = Omit<OpenPanelProject, 'kind' | 'version' | 'savedAt'>

const DATABASE_NAME = 'openpanel'
const DATABASE_VERSION = 1
const PROJECT_STORE = 'projects'
const ACTIVE_PROJECT_KEY = 'active'
const LEGACY_STORAGE_KEY = 'openpanel.panel-builder.state.v1'

function database() {
  return openDB(DATABASE_NAME, DATABASE_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(PROJECT_STORE)) db.createObjectStore(PROJECT_STORE)
    },
  })
}

function scalar(value: unknown): unknown {
  let current = value
  while (Array.isArray(current) && current.length === 1) current = current[0]
  return current
}

export function serializeProject(state: ProjectState): string {
  const project: OpenPanelProject = {
    kind: PROJECT_FILE_KIND,
    version: PROJECT_FILE_VERSION,
    savedAt: new Date().toISOString(),
    ...state,
    markers: Object.fromEntries(Object.entries(state.markers).map(([key, value]) => [Number(key), String(value)])),
  }
  return `${JSON.stringify(project, null, 2)}\n`
}

function normalizeState(value: Record<string, unknown>): ProjectState {
  const savedTab = scalar(value.tab)
  const tab = savedTab === 'similarity' || savedTab === 'signatures' ? savedTab : 'panel'
  const theme = scalar(value.theme) === 'dark' ? 'dark' : 'light'
  const rawMarkers = value.markers && typeof value.markers === 'object' && !Array.isArray(value.markers)
    ? value.markers as Record<string, unknown>
    : {}
  const savedCytometer = scalar(value.cytometer)
  const savedConfiguration = scalar(value.configuration)
  const savedSidebarWidth = Number(scalar(value.sidebarWidth))
  return {
    cytometer: typeof savedCytometer === 'string' ? savedCytometer : 'aurora',
    configuration: typeof savedConfiguration === 'string' ? savedConfiguration : '5l_uv_v_b_yg_r',
    slots: Array.isArray(value.slots) ? value.slots.map((slot) => String(scalar(slot) ?? '')) : Array(18).fill(''),
    markers: Object.fromEntries(Object.entries(rawMarkers).map(([key, marker]) => [Number(key), String(scalar(marker) ?? '')])),
    tab,
    theme,
    sidebarWidth: Number.isFinite(savedSidebarWidth)
      ? Math.min(440, Math.max(180, savedSidebarWidth))
      : 214,
    sidebarCollapsed: scalar(value.sidebarCollapsed) === true,
  }
}

export function parseProject(text: string): ProjectState {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error('This project file is not valid JSON.')
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('This project file does not contain an OpenPanel project.')
  }
  const record = value as Record<string, unknown>
  if (record.kind !== undefined && record.kind !== PROJECT_FILE_KIND) {
    throw new Error('This JSON file belongs to a different application.')
  }
  if (record.version !== undefined && record.version !== PROJECT_FILE_VERSION) {
    throw new Error(`OpenPanel project version ${String(record.version)} is not supported.`)
  }
  const legacyConfig = record.config && typeof record.config === 'object' && !Array.isArray(record.config)
    ? record.config as Record<string, unknown>
    : record
  return normalizeState(legacyConfig)
}

export async function loadActiveProject(): Promise<ProjectState | null> {
  try {
    const stored = await (await database()).get(PROJECT_STORE, ACTIVE_PROJECT_KEY) as ProjectState | undefined
    if (stored) return normalizeState(stored as unknown as Record<string, unknown>)
  } catch {
    // IndexedDB can be unavailable in hardened/private contexts; migrate from localStorage below.
  }
  try {
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY)
    return legacy ? parseProject(legacy) : null
  } catch {
    return null
  }
}

export async function saveActiveProject(state: ProjectState): Promise<void> {
  try {
    await (await database()).put(PROJECT_STORE, state, ACTIVE_PROJECT_KEY)
  } catch {
    localStorage.setItem(LEGACY_STORAGE_KEY, serializeProject(state))
  }
}
