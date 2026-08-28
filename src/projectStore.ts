import { openDB } from 'idb'
import {
  readLocalStorage,
  readLocalStorageResult,
  removeLocalStorage,
  removeLocalStorageChecked,
  writeLocalStorageChecked,
} from './browserStorage'
import { canonicalizeFluorophoreName } from './fluorophoreNames'
import {
  resolveConfiguration,
  resolvePersistedConfiguration,
  resolvePersistedCytometer,
} from './spectralEngine'
import type { TabId } from './panelBuilderShared'
import type {
  AntigenDensity,
  WizardPanelResult,
  WizardProjectState,
  WizardResults,
} from './panelWizardEngine'

export const PROJECT_FILE_KIND = 'OpenPanel project'
export const PROJECT_FILE_VERSION = 1
export const DEFAULT_PLOT_SCALE = 80
export const MIN_PLOT_SCALE = 40
export const MAX_PLOT_SCALE = 180

export type CytometerPanelState = {
  configuration: string
  slots: string[]
  markers: Record<number, string>
  wizard: WizardProjectState | null
}

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
  plotScaleMode: 'fit-width'
  wizard: WizardProjectState | null
  cytometerPanels: Record<string, CytometerPanelState>
}

export type ProjectState = Omit<OpenPanelProject, 'kind' | 'version' | 'savedAt'>

export type StoredPanelProject = {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  archivedAt?: string
  state: ProjectState
}

export class ProjectPersistenceError extends Error {
  constructor(operation: string) {
    super(`Could not ${operation} because browser storage rejected the change. Your current-session edits remain available; try again after freeing browser storage or enabling IndexedDB/localStorage.`)
    this.name = 'ProjectPersistenceError'
  }
}

const DATABASE_NAME = 'openpanel'
const DATABASE_VERSION = 1
const PROJECT_STORE = 'projects'
const ACTIVE_PROJECT_KEY = 'active'
const LEGACY_STORAGE_KEY = 'openpanel.panel-builder.state.v1'
const PANEL_KEY_PREFIX = 'panel:'
const PANEL_LIBRARY_STORAGE_KEY = 'openpanel.panel-library.v1'
const ACTIVE_PANEL_ID_STORAGE_KEY = 'openpanel.active-panel-id'
const PANEL_TOMBSTONE_PREFIX = 'deleted:'
const PANEL_TOMBSTONES_STORAGE_KEY = 'openpanel.panel-library.tombstones.v1'
const ACTIVE_RECORD_KIND = 'OpenPanel active project'
const ACTIVE_RECORD_VERSION = 1
let latestIssuedTimestamp = 0

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function isAntigenDensity(value: unknown): value is AntigenDensity {
  return value === 'low' || value === 'medium' || value === 'high'
}

export function normalizeWizardPanelResult(value: unknown): WizardPanelResult | null {
  if (!isRecord(value)) return null
  if (value.kind !== 'recommended' && value.kind !== 'best-fit') return null
  if (!Array.isArray(value.rows) || !Array.isArray(value.alternatives)) return null
  const validRows = value.rows.every((row) => (
    isRecord(row)
    && typeof row.markerId === 'string'
    && typeof row.markerName === 'string'
    && typeof row.slotIndex === 'number'
    && (isAntigenDensity(row.antigenDensity) || isAntigenDensity(row.frequency))
    && typeof row.fluorophore === 'string'
  ))
  const validAlternatives = value.alternatives.every((row) => (
    isRecord(row) && typeof row.fluorophore === 'string'
  ))
  if (!validRows || !validAlternatives) return null

  return {
    ...value,
    rows: value.rows.map((row) => {
      const record = row as Record<string, unknown>
      const current = { ...record }
      delete current.frequency
      return {
        ...current,
        antigenDensity: isAntigenDensity(record.antigenDensity)
          ? record.antigenDensity
          : record.frequency as AntigenDensity,
      }
    }),
  } as unknown as WizardPanelResult
}

export function normalizeWizardResults(value: unknown): WizardResults | null {
  if (!isRecord(value)) return null
  const recommended = normalizeWizardPanelResult(value.recommended)
  const bestFit = normalizeWizardPanelResult(value.bestFit)
  return recommended && bestFit ? { recommended, bestFit } : null
}

function normalizeWizardState(value: unknown): WizardProjectState | null {
  if (!isRecord(value) || !Array.isArray(value.markers)) return null
  const markers = value.markers
    .filter(isRecord)
    .map((marker, index) => ({
      id: typeof marker.id === 'string' && marker.id ? marker.id : `marker-${index}`,
      slotIndex: Number.isFinite(Number(marker.slotIndex)) ? Math.max(0, Math.round(Number(marker.slotIndex))) : index,
      name: typeof marker.name === 'string' ? marker.name : '',
      antigenDensity: isAntigenDensity(marker.antigenDensity)
        ? marker.antigenDensity
        : isAntigenDensity(marker.frequency) ? marker.frequency : 'medium',
      currentFluorophore: typeof marker.currentFluorophore === 'string'
        ? canonicalizeFluorophoreName(marker.currentFluorophore)
        : '',
    }))
  if (markers.length === 0) return null

  const rawCoexpression = isRecord(value.coexpression) ? value.coexpression : {}
  const coexpression = Object.fromEntries(
    Object.entries(rawCoexpression)
      .map(([key, level]) => [key, Number(level)] as const)
      .filter(([, level]) => Number.isInteger(level) && level >= 0 && level <= 4),
  ) as WizardProjectState['coexpression']
  const rawContext = isRecord(value.coexpressionContext) ? value.coexpressionContext : null
  const coexpressionContext = rawContext
    && (rawContext.species === 'human' || rawContext.species === 'mouse')
    && ['peripheral-blood', 'pbmc', 'bone-marrow', 'spleen', 'tumor'].includes(String(rawContext.tissue))
    && ['all', 't-cells', 'b-cells', 'nk-cells', 'myeloid', 'tumor-stroma'].includes(String(rawContext.population))
    && ['baseline', 'inflammatory', 'tumor'].includes(String(rawContext.condition))
    ? rawContext as WizardProjectState['coexpressionContext']
    : undefined
  const rawResults = normalizeWizardResults(value.results)
  const activeTab = value.activeTab === 'coexpression' || value.activeTab === 'recommendations'
    ? value.activeTab
    : 'frequency'
  const resultMode = value.resultMode === 'bestFit' ? 'bestFit' : 'recommended'
  const allowedSorts = new Set(['recommended', 'spectral', 'availability', 'similarity', 'complexity', 'marker'])
  const resultSort = typeof value.resultSort === 'string' && allowedSorts.has(value.resultSort)
    ? value.resultSort as WizardProjectState['resultSort']
    : 'recommended'

  return {
    desiredSize: Math.max(1, Math.round(Number(value.desiredSize) || markers.length)),
    markers,
    coexpression,
    ...(value.coexpressionScale === 5 ? { coexpressionScale: 5 as const } : {}),
    ...(coexpressionContext ? { coexpressionContext } : {}),
    coexpressionVisited: value.coexpressionVisited === true,
    coexpressionCompleted: value.coexpressionCompleted === true,
    ...(typeof value.inputsChanged === 'boolean' ? { inputsChanged: value.inputsChanged } : {}),
    activeTab,
    results: rawResults,
    resultMode,
    resultSort,
  }
}

function normalizeSlots(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((slot) => canonicalizeFluorophoreName(String(scalar(slot) ?? '')))
    : Array(18).fill('')
}

function normalizeMarkers(value: unknown): Record<number, string> {
  const rawMarkers = isRecord(value) ? value : {}
  return Object.fromEntries(
    Object.entries(rawMarkers).map(([key, marker]) => [Number(key), String(scalar(marker) ?? '')]),
  )
}

function normalizeCytometerPanel(
  value: unknown,
  cytometer: string,
  fallbackConfiguration?: string,
): CytometerPanelState {
  if (!isRecord(value)) {
    throw new Error(`Persisted panel for cytometer '${cytometer}' is not a valid object.`)
  }
  const savedConfiguration = hasOwn(value, 'configuration') ? scalar(value.configuration) : undefined
  const configuration = savedConfiguration === undefined
    ? fallbackConfiguration
    : resolvePersistedConfiguration(cytometer, savedConfiguration)
  if (!configuration) {
    throw new Error(`Persisted panel for cytometer '${cytometer}' is missing a configuration.`)
  }
  return {
    configuration,
    slots: normalizeSlots(value.slots),
    markers: normalizeMarkers(value.markers),
    wizard: normalizeWizardState(value.wizard),
  }
}

export function serializeProject(state: ProjectState, savedAt = new Date().toISOString()): string {
  const project: OpenPanelProject = {
    kind: PROJECT_FILE_KIND,
    version: PROJECT_FILE_VERSION,
    savedAt,
    ...state,
    markers: Object.fromEntries(Object.entries(state.markers).map(([key, value]) => [Number(key), String(value)])),
  }
  return `${JSON.stringify(project, null, 2)}\n`
}

function normalizeState(value: Record<string, unknown>): ProjectState {
  const savedTab = scalar(value.tab)
  const tab = savedTab === 'similarity' || savedTab === 'signatures' ? savedTab : 'panel'
  const theme = scalar(value.theme) === 'dark' ? 'dark' : 'light'
  const savedCytometer = hasOwn(value, 'cytometer') ? scalar(value.cytometer) : undefined
  const cytometer = savedCytometer === undefined
    ? 'aurora'
    : resolvePersistedCytometer(savedCytometer)
  const savedConfiguration = hasOwn(value, 'configuration') ? scalar(value.configuration) : undefined
  const configuration = savedConfiguration === undefined
    ? resolveConfiguration(cytometer)
    : resolvePersistedConfiguration(cytometer, savedConfiguration)
  const legacyPanel: CytometerPanelState = {
    configuration,
    slots: normalizeSlots(value.slots),
    markers: normalizeMarkers(value.markers),
    wizard: normalizeWizardState(value.wizard),
  }
  const rawCytometerPanels = hasOwn(value, 'cytometerPanels')
    ? value.cytometerPanels
    : {}
  if (!isRecord(rawCytometerPanels)) {
    throw new Error('Persisted cytometerPanels must be an object when present.')
  }
  const cytometerPanels: Record<string, CytometerPanelState> = {}
  Object.entries(rawCytometerPanels).forEach(([key, panel]) => {
    const panelCytometer = resolvePersistedCytometer(key)
    if (cytometerPanels[panelCytometer]) {
      throw new Error(`Persisted cytometerPanels contains duplicate entries for '${panelCytometer}'.`)
    }
    const normalizedPanel = normalizeCytometerPanel(
      panel,
      panelCytometer,
      panelCytometer === cytometer ? configuration : undefined,
    )
    if (panelCytometer === cytometer && normalizedPanel.configuration !== configuration) {
      throw new Error(`Persisted active panel configuration '${normalizedPanel.configuration}' does not match '${configuration}'.`)
    }
    cytometerPanels[panelCytometer] = normalizedPanel
  })
  cytometerPanels[cytometer] = legacyPanel
  const activePanel = cytometerPanels[cytometer]
  const savedSidebarWidth = Number(scalar(value.sidebarWidth))
  const savedPlotScale = Number(scalar(value.plotScale))
  const legacyPlotHeight = Number(scalar(value.plotHeight))
  const normalizedPlotScale = Number.isFinite(savedPlotScale)
    ? savedPlotScale
    : Number.isFinite(legacyPlotHeight)
      ? (legacyPlotHeight / 230) * 100
      : DEFAULT_PLOT_SCALE
  return {
    cytometer,
    configuration: activePanel.configuration || configuration,
    slots: activePanel.slots,
    markers: activePanel.markers,
    tab,
    theme,
    sidebarWidth: Number.isFinite(savedSidebarWidth)
      ? Math.min(440, Math.max(180, savedSidebarWidth))
      : 214,
    sidebarCollapsed: scalar(value.sidebarCollapsed) === true,
    plotScale: scalar(value.plotScaleMode) === 'fit-width'
      ? Math.min(MAX_PLOT_SCALE, Math.max(MIN_PLOT_SCALE, Math.round(normalizedPlotScale)))
      : DEFAULT_PLOT_SCALE,
    plotScaleMode: 'fit-width',
    wizard: activePanel.wizard,
    cytometerPanels,
  }
}

export function isProjectStateUsable(value: unknown): boolean {
  if (!isRecord(value)) return false
  try {
    normalizeState(value)
    return true
  } catch {
    return false
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
  const [indexedDb, fallback] = await Promise.all([indexedDbSnapshot(), Promise.resolve(fallbackSnapshot())])
  return latestActive(indexedDb, fallback)?.state ?? null
}

export async function saveActiveProject(state: ProjectState): Promise<void> {
  const normalized = normalizeState(state as unknown as Record<string, unknown>)
  const updatedAt = nextPersistenceTimestamp()
  const results = await Promise.all([
    writeIndexedDbActive(normalized, updatedAt),
    Promise.resolve(writeFallbackActive(normalized, updatedAt)),
  ])
  if (!results.some(Boolean)) throw new ProjectPersistenceError('save the active panel')
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
  rememberPersistenceTimestamp(updatedAt)
  let state: ProjectState
  try {
    state = normalizeState(record.state as Record<string, unknown>)
  } catch {
    // Keep incompatible records available for export, rename, archive, and
    // deletion. Strict validation happens at the builder handoff instead.
    state = record.state as ProjectState
  }
  return {
    id: record.id,
    name: normalizePanelName(record.name),
    createdAt,
    updatedAt,
    archivedAt: typeof record.archivedAt === 'string' ? record.archivedAt : undefined,
    state,
  }
}

function createPanelId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `panel-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

type ActiveProjectRecord = {
  kind: typeof ACTIVE_RECORD_KIND
  version: typeof ACTIVE_RECORD_VERSION
  updatedAt: string
  state: ProjectState
}

type FallbackActiveRecord = {
  kind: typeof ACTIVE_RECORD_KIND
  version: typeof ACTIVE_RECORD_VERSION
  updatedAt: string
  state: OpenPanelProject
}

type PanelTombstone = {
  kind: 'OpenPanel panel tombstone'
  version: 1
  id: string
  deletedAt: string
}

type ActiveProjectValue = {
  state: ProjectState
  updatedAt: string
  source: 'indexeddb' | 'fallback'
  legacy?: boolean
}

type DeleteBackendResult = {
  available: boolean
  removed: boolean
  tombstoned: boolean
}

type ProjectSnapshot = {
  available: boolean
  panels: StoredPanelProject[]
  tombstones: Map<string, string>
  active: ActiveProjectValue | null
}

type FallbackSnapshot = ProjectSnapshot & {
  libraryAvailable: boolean
  tombstonesAvailable: boolean
  activeAvailable: boolean
}

function timestamp(value: string): number {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function rememberPersistenceTimestamp(value: string): void {
  latestIssuedTimestamp = Math.max(latestIssuedTimestamp, timestamp(value))
}

function nextPersistenceTimestamp(...knownValues: Array<string | undefined>): string {
  const known = knownValues.reduce((latest, value) => Math.max(latest, timestamp(value ?? '')), latestIssuedTimestamp)
  const next = Math.max(Date.now(), known + 1)
  latestIssuedTimestamp = next
  return new Date(next).toISOString()
}

function compareTimestamp(left: string, right: string): number {
  return timestamp(left) - timestamp(right) || left.localeCompare(right)
}

function parseTombstones(value: string | null): Map<string, string> {
  if (!value) return new Map()
  try {
    const parsed: unknown = JSON.parse(value)
    if (!isRecord(parsed)) return new Map()
    const result = new Map<string, string>()
    Object.entries(parsed).forEach(([id, deletedAt]) => {
      if (typeof deletedAt !== 'string' || timestamp(deletedAt) <= 0) return
      result.set(id, deletedAt)
      rememberPersistenceTimestamp(deletedAt)
    })
    return result
  } catch {
    return new Map()
  }
}

function serializeTombstones(tombstones: Map<string, string>): string {
  return JSON.stringify(Object.fromEntries(tombstones))
}

function parseFallbackActive(value: string | null): ActiveProjectValue | null {
  if (!value) return null
  try {
    const parsed: unknown = JSON.parse(value)
    const isEnvelope = isRecord(parsed)
      && parsed.kind === ACTIVE_RECORD_KIND
      && parsed.version === ACTIVE_RECORD_VERSION
      && isRecord(parsed.state)
    const rawState = isEnvelope ? parsed.state : parsed
    const savedAt = isEnvelope && typeof parsed.updatedAt === 'string'
      ? parsed.updatedAt
      : isRecord(parsed) && typeof parsed.savedAt === 'string'
        ? parsed.savedAt
        : new Date(0).toISOString()
    const updatedAt = timestamp(savedAt) > 0 ? savedAt : new Date(0).toISOString()
    rememberPersistenceTimestamp(updatedAt)
    return {
      state: isEnvelope ? normalizeState(rawState as Record<string, unknown>) : parseProject(value),
      updatedAt,
      source: 'fallback',
      ...(isEnvelope ? {} : { legacy: true }),
    }
  } catch {
    return null
  }
}

function parseIndexedDbActive(value: unknown): ActiveProjectValue | null {
  if (!isRecord(value)) return null
  const isEnvelope = value.kind === ACTIVE_RECORD_KIND && value.version === ACTIVE_RECORD_VERSION
  const rawState = isEnvelope ? value.state : value
  if (!isRecord(rawState)) return null
  try {
    const updatedAt = isEnvelope && typeof value.updatedAt === 'string' && timestamp(value.updatedAt) > 0
      ? value.updatedAt
      : new Date(0).toISOString()
    rememberPersistenceTimestamp(updatedAt)
    return {
      state: normalizeState(rawState),
      updatedAt,
      source: 'indexeddb',
      ...(isEnvelope ? {} : { legacy: true }),
    }
  } catch {
    return null
  }
}

function fallbackSnapshot(): FallbackSnapshot {
  const library = readLocalStorageResult(PANEL_LIBRARY_STORAGE_KEY)
  const tombstones = readLocalStorageResult(PANEL_TOMBSTONES_STORAGE_KEY)
  const active = readLocalStorageResult(LEGACY_STORAGE_KEY)
  let panels: StoredPanelProject[] = []
  if (library.available) {
    try {
      const parsed: unknown = JSON.parse(library.value || '[]')
      panels = Array.isArray(parsed)
        ? parsed.map(normalizeStoredPanel).filter((panel): panel is StoredPanelProject => panel !== null)
        : []
    } catch {
      panels = []
    }
  }
  return {
    available: library.available || tombstones.available || active.available,
    libraryAvailable: library.available,
    tombstonesAvailable: tombstones.available,
    activeAvailable: active.available,
    panels,
    tombstones: tombstones.available ? parseTombstones(tombstones.value) : new Map(),
    active: active.available ? parseFallbackActive(active.value) : null,
  }
}

async function indexedDbSnapshot(): Promise<ProjectSnapshot> {
  try {
    const db = await database()
    const keys = await db.getAllKeys(PROJECT_STORE)
    const values = await db.getAll(PROJECT_STORE)
    const panels: StoredPanelProject[] = []
    const tombstones = new Map<string, string>()
    let active: ActiveProjectValue | null = null
    keys.forEach((key, index) => {
      const keyText = String(key)
      const value = values[index]
      if (keyText.startsWith(PANEL_KEY_PREFIX)) {
        const panel = normalizeStoredPanel(value)
        if (panel) panels.push(panel)
      } else if (keyText.startsWith(PANEL_TOMBSTONE_PREFIX)) {
        if (isRecord(value) && typeof value.id === 'string' && typeof value.deletedAt === 'string' && timestamp(value.deletedAt) > 0) {
          tombstones.set(value.id, value.deletedAt)
        }
      } else if (keyText === ACTIVE_PROJECT_KEY) {
        active = parseIndexedDbActive(value)
      }
    })
    return { available: true, panels, tombstones, active }
  } catch {
    return { available: false, panels: [], tombstones: new Map(), active: null }
  }
}

function mergeTombstones(...snapshots: ProjectSnapshot[]): Map<string, string> {
  const merged = new Map<string, string>()
  snapshots.forEach((snapshot) => {
    snapshot.tombstones.forEach((deletedAt, id) => {
      const current = merged.get(id)
      if (!current || compareTimestamp(deletedAt, current) > 0) merged.set(id, deletedAt)
    })
  })
  return merged
}

function mergePanels(...snapshots: ProjectSnapshot[]): StoredPanelProject[] {
  const latest = new Map<string, StoredPanelProject>()
  snapshots.forEach((snapshot) => {
    snapshot.panels.forEach((panel) => {
      const current = latest.get(panel.id)
      if (!current || compareTimestamp(panel.updatedAt, current.updatedAt) > 0) latest.set(panel.id, panel)
    })
  })
  const tombstones = mergeTombstones(...snapshots)
  return [...latest.values()]
    .filter((panel) => {
      const deletedAt = tombstones.get(panel.id)
      return !deletedAt || compareTimestamp(panel.updatedAt, deletedAt) > 0
    })
    .sort((left, right) => compareTimestamp(right.updatedAt, left.updatedAt) || left.id.localeCompare(right.id))
}

function latestActive(...snapshots: ProjectSnapshot[]): ActiveProjectValue | null {
  const activeValues = snapshots
    .map((snapshot) => snapshot.active)
    .filter((active): active is ActiveProjectValue => active !== null)
  // Before timestamped envelopes existed, IndexedDB was the authoritative
  // active-project store. Preserve that migration precedence rather than
  // treating the legacy record as older than every valid localStorage copy.
  const legacyIndexedDb = activeValues.find((active) => active.source === 'indexeddb' && active.legacy)
  const currentValues = activeValues.filter((active) => !active.legacy)
  const latest = (currentValues.length > 0
    ? [...currentValues].sort((left, right) => compareTimestamp(right.updatedAt, left.updatedAt))[0]
    : legacyIndexedDb ?? [...activeValues].sort((left, right) => compareTimestamp(right.updatedAt, left.updatedAt))[0])
    ?? null
  if (latest) rememberPersistenceTimestamp(latest.updatedAt)
  return latest
}

async function writeIndexedDbPanel(panel: StoredPanelProject): Promise<boolean> {
  try {
    const db = await database()
    const transaction = db.transaction(PROJECT_STORE, 'readwrite')
    const tombstoneKey = `${PANEL_TOMBSTONE_PREFIX}${panel.id}`
    const tombstone = await transaction.store.get(tombstoneKey) as PanelTombstone | undefined
    await transaction.store.put(panel, `${PANEL_KEY_PREFIX}${panel.id}`)
    if (!tombstone || compareTimestamp(panel.updatedAt, tombstone.deletedAt) > 0) {
      await transaction.store.delete(tombstoneKey)
    }
    await transaction.done
    return true
  } catch {
    return false
  }
}

function writeFallbackPanel(panel: StoredPanelProject): boolean {
  const snapshot = fallbackSnapshot()
  if (!snapshot.libraryAvailable) return false
  const libraryWritten = writeLocalStorageChecked(
    PANEL_LIBRARY_STORAGE_KEY,
    JSON.stringify([panel, ...snapshot.panels.filter((candidate) => candidate.id !== panel.id)]),
  )
  if (!libraryWritten) return false
  const currentSnapshot = fallbackSnapshot()
  const tombstone = currentSnapshot.tombstones.get(panel.id)
  if (!tombstone || compareTimestamp(panel.updatedAt, tombstone) <= 0) return true
  const nextTombstones = new Map(currentSnapshot.tombstones)
  nextTombstones.delete(panel.id)
  return currentSnapshot.tombstonesAvailable
    && writeLocalStorageChecked(PANEL_TOMBSTONES_STORAGE_KEY, serializeTombstones(nextTombstones))
}

async function writeIndexedDbActive(state: ProjectState, updatedAt: string): Promise<boolean> {
  try {
    const db = await database()
    const record: ActiveProjectRecord = {
      kind: ACTIVE_RECORD_KIND,
      version: ACTIVE_RECORD_VERSION,
      updatedAt,
      state,
    }
    await db.put(PROJECT_STORE, record, ACTIVE_PROJECT_KEY)
    return true
  } catch {
    return false
  }
}

function writeFallbackActive(state: ProjectState, updatedAt: string): boolean {
  const record: FallbackActiveRecord = {
    kind: ACTIVE_RECORD_KIND,
    version: ACTIVE_RECORD_VERSION,
    updatedAt,
    state: JSON.parse(serializeProject(state, updatedAt)) as OpenPanelProject,
  }
  return writeLocalStorageChecked(LEGACY_STORAGE_KEY, JSON.stringify(record))
}

async function publishPanel(panel: StoredPanelProject, includeActiveState: boolean): Promise<void> {
  const panelResults = await Promise.all([
    writeIndexedDbPanel(panel),
    Promise.resolve(writeFallbackPanel(panel)),
  ])
  const panelPublished = panelResults.some(Boolean)
  if (includeActiveState) {
    const state = panel.state
    const updatedAt = panel.updatedAt
    await Promise.all([
      writeIndexedDbActive(state, updatedAt),
      Promise.resolve(writeFallbackActive(state, updatedAt)),
    ])
  }
  if (!panelPublished) {
    throw new ProjectPersistenceError(includeActiveState ? 'save this panel' : 'update this panel')
  }
}

async function deleteIndexedDbPanel(id: string, deletedAt: string): Promise<DeleteBackendResult> {
  try {
    const db = await database()
    let removed = false
    let tombstoned = false
    try {
      await db.delete(PROJECT_STORE, `${PANEL_KEY_PREFIX}${id}`)
      removed = true
    } catch {
      // A tombstone still makes a failed physical delete safe to read.
    }
    try {
      const tombstone: PanelTombstone = {
        kind: 'OpenPanel panel tombstone',
        version: 1,
        id,
        deletedAt,
      }
      await db.put(PROJECT_STORE, tombstone, `${PANEL_TOMBSTONE_PREFIX}${id}`)
      tombstoned = true
    } catch {
      // A successful physical delete is already sufficient for this backend.
    }
    return { available: true, removed, tombstoned }
  } catch {
    return { available: false, removed: false, tombstoned: false }
  }
}

function deleteFallbackPanel(id: string, deletedAt: string): DeleteBackendResult {
  const snapshot = fallbackSnapshot()
  if (!snapshot.libraryAvailable && !snapshot.tombstonesAvailable) {
    return { available: false, removed: false, tombstoned: false }
  }
  const libraryWritten = snapshot.libraryAvailable
    ? writeLocalStorageChecked(
      PANEL_LIBRARY_STORAGE_KEY,
      JSON.stringify(snapshot.panels.filter((panel) => panel.id !== id)),
    )
    : false
  const tombstones = new Map(snapshot.tombstones)
  const current = tombstones.get(id)
  if (!current || compareTimestamp(deletedAt, current) > 0) tombstones.set(id, deletedAt)
  const tombstoneWritten = snapshot.tombstonesAvailable
    ? writeLocalStorageChecked(PANEL_TOMBSTONES_STORAGE_KEY, serializeTombstones(tombstones))
    : false
  return { available: true, removed: libraryWritten, tombstoned: tombstoneWritten }
}

export async function listPanelProjects(): Promise<StoredPanelProject[]> {
  const [indexedDb, fallback] = await Promise.all([indexedDbSnapshot(), Promise.resolve(fallbackSnapshot())])
  return mergePanels(indexedDb, fallback)
}

export async function loadPanelProject(id: string): Promise<StoredPanelProject | null> {
  const panels = await listPanelProjects()
  return panels.find((panel) => panel.id === id) ?? null
}

export function setActivePanelProject(id: string): boolean {
  return writeLocalStorageChecked(ACTIVE_PANEL_ID_STORAGE_KEY, id)
}

export async function createPanelProject(
  name: string,
  state: ProjectState,
): Promise<StoredPanelProject> {
  const now = nextPersistenceTimestamp()
  const panel: StoredPanelProject = {
    id: createPanelId(),
    name: normalizePanelName(name),
    createdAt: now,
    updatedAt: now,
    state: normalizeState(state as unknown as Record<string, unknown>),
  }
  await publishPanel(panel, true)
  setActivePanelProject(panel.id)
  return panel
}

export async function savePanelProject(
  id: string,
  name: string,
  state: ProjectState,
): Promise<StoredPanelProject> {
  const existing = await loadPanelProject(id)
  const now = nextPersistenceTimestamp(existing?.updatedAt, existing?.createdAt)
  const panel: StoredPanelProject = {
    id,
    name: normalizePanelName(name),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    archivedAt: existing?.archivedAt,
    state: normalizeState(state as unknown as Record<string, unknown>),
  }
  await publishPanel(panel, true)
  setActivePanelProject(id)
  return panel
}

export async function loadLastPanelProject(): Promise<StoredPanelProject | null> {
  const activeId = readLocalStorage(ACTIVE_PANEL_ID_STORAGE_KEY)
  if (activeId) {
    const active = await loadPanelProject(activeId)
    if (active && !active.archivedAt && isProjectStateUsable(active.state)) return active
    removeLocalStorage(ACTIVE_PANEL_ID_STORAGE_KEY)
  }

  const panels = await listPanelProjects()
  const latestActivePanel = panels.find((panel) => !panel.archivedAt && isProjectStateUsable(panel.state))
  if (latestActivePanel) {
    setActivePanelProject(latestActivePanel.id)
    return latestActivePanel
  }

  // A populated library is authoritative, even when every project is archived.
  // Legacy single-state recovery must never resurrect an explicitly archived panel.
  if (panels.length > 0) return null

  const legacy = await loadActiveProject()
  if (!legacy || !legacy.slots.some(Boolean)) return null
  try {
    return await createPanelProject('Recovered panel', legacy)
  } catch (error) {
    if (!(error instanceof ProjectPersistenceError)) throw error
    // Keep startup recovery usable: the editor can hold this state in memory
    // while its normal persistence error feedback explains the durable failure.
    const now = nextPersistenceTimestamp()
    return {
      id: createPanelId(),
      name: 'Recovered panel',
      createdAt: now,
      updatedAt: now,
      state: legacy,
    }
  }
}

async function writeStoredPanel(panel: StoredPanelProject): Promise<StoredPanelProject> {
  const results = await Promise.all([
    writeIndexedDbPanel(panel),
    Promise.resolve(writeFallbackPanel(panel)),
  ])
  if (!results.some(Boolean)) throw new ProjectPersistenceError('update this panel')
  return panel
}

export async function renamePanelProject(
  id: string,
  name: string,
): Promise<StoredPanelProject | null> {
  const panel = await loadPanelProject(id)
  if (!panel) return null
  return writeStoredPanel({
    ...panel,
    name: normalizePanelName(name),
    updatedAt: nextPersistenceTimestamp(panel.updatedAt),
  })
}

export async function duplicatePanelProject(
  id: string,
): Promise<StoredPanelProject | null> {
  const panel = await loadPanelProject(id)
  if (!panel) return null
  const now = nextPersistenceTimestamp(panel.updatedAt, panel.createdAt)
  const duplicate: StoredPanelProject = {
    ...panel,
    id: createPanelId(),
    name: normalizePanelName(`${panel.name} copy`),
    createdAt: now,
    updatedAt: now,
    archivedAt: undefined,
    state: panel.state,
  }
  return writeStoredPanel(duplicate)
}

export async function archivePanelProject(
  id: string,
): Promise<StoredPanelProject | null> {
  const panel = await loadPanelProject(id)
  if (!panel) return null
  const archivedAt = nextPersistenceTimestamp(panel.updatedAt, panel.archivedAt)
  const archived = await writeStoredPanel({
    ...panel,
    updatedAt: archivedAt,
    archivedAt,
  })
  if (readLocalStorage(ACTIVE_PANEL_ID_STORAGE_KEY) === id) {
    removeLocalStorageChecked(ACTIVE_PANEL_ID_STORAGE_KEY)
  }
  return archived
}

export async function restorePanelProject(
  id: string,
): Promise<StoredPanelProject | null> {
  const panel = await loadPanelProject(id)
  if (!panel) return null
  const restored = { ...panel }
  delete restored.archivedAt
  return writeStoredPanel({
    ...restored,
    updatedAt: nextPersistenceTimestamp(panel.updatedAt, panel.archivedAt),
  })
}

export async function deletePanelProject(id: string): Promise<void> {
  const existing = await loadPanelProject(id)
  const deletedAt = nextPersistenceTimestamp(existing?.updatedAt, existing?.archivedAt)
  const [indexedDbBefore, fallbackBefore] = await Promise.all([
    indexedDbSnapshot(),
    Promise.resolve(fallbackSnapshot()),
  ])
  const results = await Promise.all([
    deleteIndexedDbPanel(id, deletedAt),
    Promise.resolve(deleteFallbackPanel(id, deletedAt)),
  ])
  const [indexedDbResult, fallbackResult] = results
  const backends = [
    { result: indexedDbResult, hadPanel: indexedDbBefore.panels.some((panel) => panel.id === id) },
    { result: fallbackResult, hadPanel: fallbackBefore.panels.some((panel) => panel.id === id) },
  ]
  const hasDurableChange = backends.some(({ result }) => (
    result.available && (result.removed || result.tombstoned)
  ))
  const hasDurableTombstone = backends.some(({ result }) => result.available && result.tombstoned)
  const everyBackendIsSafe = backends.every(({ result, hadPanel }) => (
    result.available
      ? !hadPanel || result.removed || result.tombstoned
      : hasDurableTombstone
  ))
  if (!hasDurableChange || !everyBackendIsSafe) {
    throw new ProjectPersistenceError('delete this panel')
  }
  if (readLocalStorage(ACTIVE_PANEL_ID_STORAGE_KEY) === id) {
    removeLocalStorageChecked(ACTIVE_PANEL_ID_STORAGE_KEY)
  }
}
