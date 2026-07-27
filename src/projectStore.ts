import { openDB } from 'idb'
import type { TabId } from './panelBuilderShared'

export const PROJECT_FILE_KIND = 'OpenPanel project'
export const PROJECT_FILE_VERSION = 1
export const DEFAULT_PLOT_SCALE = 80
export const MIN_PLOT_SCALE = 40
export const MAX_PLOT_SCALE = 180

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
  plotScale: number
}

export type ProjectState = Omit<OpenPanelProject, 'kind' | 'version' | 'savedAt'>

export type StoredPanelProject = {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  state: ProjectState
}

const DATABASE_NAME = 'openpanel'
const DATABASE_VERSION = 1
const PROJECT_STORE = 'projects'
const ACTIVE_PROJECT_KEY = 'active'
const LEGACY_STORAGE_KEY = 'openpanel.panel-builder.state.v1'
const PANEL_KEY_PREFIX = 'panel:'
const PANEL_LIBRARY_STORAGE_KEY = 'openpanel.panel-library.v1'
const ACTIVE_PANEL_ID_STORAGE_KEY = 'openpanel.active-panel-id'

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
  const savedPlotScale = Number(scalar(value.plotScale))
  const legacyPlotHeight = Number(scalar(value.plotHeight))
  const normalizedPlotScale = Number.isFinite(savedPlotScale)
    ? savedPlotScale
    : Number.isFinite(legacyPlotHeight)
      ? (legacyPlotHeight / 230) * 100
      : DEFAULT_PLOT_SCALE
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
    plotScale: Math.min(MAX_PLOT_SCALE, Math.max(MIN_PLOT_SCALE, Math.round(normalizedPlotScale))),
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

function normalizePanelName(name: string): string {
  return name.trim().replace(/\s+/g, ' ') || 'Untitled panel'
}

function normalizeStoredPanel(value: unknown): StoredPanelProject | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (typeof record.id !== 'string' || typeof record.name !== 'string') return null
  if (!record.state || typeof record.state !== 'object' || Array.isArray(record.state)) return null
  const createdAt = typeof record.createdAt === 'string' ? record.createdAt : new Date(0).toISOString()
  const updatedAt = typeof record.updatedAt === 'string' ? record.updatedAt : createdAt
  return {
    id: record.id,
    name: normalizePanelName(record.name),
    createdAt,
    updatedAt,
    state: normalizeState(record.state as Record<string, unknown>),
  }
}

function fallbackLibrary(): StoredPanelProject[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(PANEL_LIBRARY_STORAGE_KEY) || '[]')
    return Array.isArray(parsed)
      ? parsed.map(normalizeStoredPanel).filter((panel): panel is StoredPanelProject => panel !== null)
      : []
  } catch {
    return []
  }
}

function writeFallbackLibrary(panels: StoredPanelProject[]): void {
  localStorage.setItem(PANEL_LIBRARY_STORAGE_KEY, JSON.stringify(panels))
}

function createPanelId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `panel-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export async function listPanelProjects(): Promise<StoredPanelProject[]> {
  try {
    const db = await database()
    const keys = await db.getAllKeys(PROJECT_STORE)
    const values = await db.getAll(PROJECT_STORE)
    return values
      .map((value, index) => String(keys[index]).startsWith(PANEL_KEY_PREFIX)
        ? normalizeStoredPanel(value)
        : null)
      .filter((panel): panel is StoredPanelProject => panel !== null)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  } catch {
    return fallbackLibrary().sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  }
}

export async function loadPanelProject(id: string): Promise<StoredPanelProject | null> {
  try {
    const stored = await (await database()).get(PROJECT_STORE, `${PANEL_KEY_PREFIX}${id}`)
    return normalizeStoredPanel(stored)
  } catch {
    return fallbackLibrary().find((panel) => panel.id === id) ?? null
  }
}

export function setActivePanelProject(id: string): void {
  localStorage.setItem(ACTIVE_PANEL_ID_STORAGE_KEY, id)
}

export async function createPanelProject(
  name: string,
  state: ProjectState,
): Promise<StoredPanelProject> {
  const now = new Date().toISOString()
  const panel: StoredPanelProject = {
    id: createPanelId(),
    name: normalizePanelName(name),
    createdAt: now,
    updatedAt: now,
    state: normalizeState(state as unknown as Record<string, unknown>),
  }
  try {
    const db = await database()
    await db.put(PROJECT_STORE, panel, `${PANEL_KEY_PREFIX}${panel.id}`)
    await db.put(PROJECT_STORE, panel.state, ACTIVE_PROJECT_KEY)
  } catch {
    writeFallbackLibrary([panel, ...fallbackLibrary().filter((candidate) => candidate.id !== panel.id)])
    localStorage.setItem(LEGACY_STORAGE_KEY, serializeProject(panel.state))
  }
  setActivePanelProject(panel.id)
  return panel
}

export async function savePanelProject(
  id: string,
  name: string,
  state: ProjectState,
): Promise<StoredPanelProject> {
  const existing = await loadPanelProject(id)
  const now = new Date().toISOString()
  const panel: StoredPanelProject = {
    id,
    name: normalizePanelName(name),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    state: normalizeState(state as unknown as Record<string, unknown>),
  }
  try {
    const db = await database()
    await db.put(PROJECT_STORE, panel, `${PANEL_KEY_PREFIX}${id}`)
    await db.put(PROJECT_STORE, panel.state, ACTIVE_PROJECT_KEY)
  } catch {
    writeFallbackLibrary([panel, ...fallbackLibrary().filter((candidate) => candidate.id !== id)])
    localStorage.setItem(LEGACY_STORAGE_KEY, serializeProject(panel.state))
  }
  setActivePanelProject(id)
  return panel
}

export async function loadLastPanelProject(): Promise<StoredPanelProject | null> {
  const activeId = localStorage.getItem(ACTIVE_PANEL_ID_STORAGE_KEY)
  if (activeId) {
    const active = await loadPanelProject(activeId)
    if (active) return active
  }

  const panels = await listPanelProjects()
  if (panels[0]) {
    setActivePanelProject(panels[0].id)
    return panels[0]
  }

  const legacy = await loadActiveProject()
  if (!legacy || !legacy.slots.some(Boolean)) return null
  return createPanelProject('Recovered panel', legacy)
}
