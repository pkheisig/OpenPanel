import { openDB } from 'idb'
import { readLocalStorage, removeLocalStorage, writeLocalStorage } from './browserStorage'
import { canonicalizeFluorophoreName, fluorophoreIdentity } from './fluorophoreNames'
import {
  responseMeasurementModeForCytometer,
  responseProvenanceMatchesPayload,
  WIZARD_SCORING_VERSION,
} from './panelBuilderShared'
import type { TabId } from './panelBuilderShared'
import type {
  AntigenDensity,
  WizardPanelResult,
  WizardProjectState,
  WizardResponseContext,
  WizardResults,
} from './panelWizardEngine'

export const PROJECT_FILE_KIND = 'OpenPanel project'
export const PROJECT_FILE_VERSION = 1
export const DEFAULT_PLOT_SCALE = 80
export const MIN_PLOT_SCALE = 40
export const MAX_PLOT_SCALE = 180

export const PROJECT_RESOURCE_LIMITS = {
  maxProjectFileBytes: 5 * 1024 * 1024,
  maxStringLength: 8192,
  maxArrayItems: 4096,
  maxObjectEntries: 4096,
  maxResourceNodes: 100000,
  maxSlots: 256,
  maxMarkers: 256,
  maxCytometerPanels: 64,
  maxWizardMarkers: 256,
  maxCoexpressionEntries: 16384,
  maxWizardResultRows: 512,
  maxWizardAlternatives: 512,
} as const

export class ProjectResourceLimitError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProjectResourceLimitError'
  }
}

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
  loadError?: string
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isAntigenDensity(value: unknown): value is AntigenDensity {
  return value === 'low' || value === 'medium' || value === 'high'
}

function utf8ByteLength(text: string): number {
  return typeof TextEncoder === 'undefined' ? new Blob([text]).size : new TextEncoder().encode(text).byteLength
}

export function assertProjectTextWithinLimit(text: string): void {
  if (utf8ByteLength(text) > PROJECT_RESOURCE_LIMITS.maxProjectFileBytes) {
    throw new ProjectResourceLimitError(
      `OpenPanel project is too large. Maximum size is ${PROJECT_RESOURCE_LIMITS.maxProjectFileBytes / (1024 * 1024)} MB.`,
    )
  }
}

type ResourceTraversalState = { nodes: number }

function assertProjectResourceTree(
  value: unknown,
  path = 'project',
  seen = new WeakSet<object>(),
  traversal: ResourceTraversalState = { nodes: 0 },
): void {
  traversal.nodes += 1
  if (traversal.nodes > PROJECT_RESOURCE_LIMITS.maxResourceNodes) {
    throw new ProjectResourceLimitError(`OpenPanel project contains too many nested values near ${path}.`)
  }
  if (typeof value === 'string') {
    if (value.length > PROJECT_RESOURCE_LIMITS.maxStringLength) {
      throw new ProjectResourceLimitError(`${path} exceeds the maximum string length.`)
    }
    return
  }
  if (!value || typeof value !== 'object') return
  if (seen.has(value)) return
  seen.add(value)
  if (Array.isArray(value)) {
    if (value.length > PROJECT_RESOURCE_LIMITS.maxArrayItems) {
      throw new ProjectResourceLimitError(`${path} contains too many items.`)
    }
    value.forEach((item, index) => assertProjectResourceTree(item, `${path}[${index}]`, seen, traversal))
    return
  }
  const record = value as Record<string, unknown>
  const entries = Object.entries(record)
  if (entries.length > PROJECT_RESOURCE_LIMITS.maxObjectEntries) {
    throw new ProjectResourceLimitError(`${path} contains too many entries.`)
  }
  entries.forEach(([key, item]) => assertProjectResourceTree(item, `${path}.${key}`, seen, traversal))
}

function assertArrayLimit(value: unknown, limit: number, label: string): void {
  if (Array.isArray(value) && value.length > limit) {
    throw new ProjectResourceLimitError(`${label} contains ${value.length} items; maximum is ${limit}.`)
  }
}

function assertRecordLimit(value: unknown, limit: number, label: string): void {
  if (isRecord(value) && Object.keys(value).length > limit) {
    throw new ProjectResourceLimitError(`${label} contains ${Object.keys(value).length} entries; maximum is ${limit}.`)
  }
}

function assertWizardResourceLimits(value: unknown, path: string, rejectOversizedResults = true): void {
  if (!isRecord(value)) return
  assertArrayLimit(value.markers, PROJECT_RESOURCE_LIMITS.maxWizardMarkers, `${path}.markers`)
  assertRecordLimit(value.coexpression, PROJECT_RESOURCE_LIMITS.maxCoexpressionEntries, `${path}.coexpression`)
  const desiredSize = Number(value.desiredSize)
  if (Number.isFinite(desiredSize) && desiredSize > PROJECT_RESOURCE_LIMITS.maxSlots) {
    throw new ProjectResourceLimitError(
      `${path}.desiredSize exceeds the maximum of ${PROJECT_RESOURCE_LIMITS.maxSlots}.`,
    )
  }
  if (!rejectOversizedResults || !isRecord(value.results)) return
  for (const [resultName, result] of [['recommended', value.results.recommended], ['bestFit', value.results.bestFit]] as const) {
    if (!isRecord(result)) continue
    assertArrayLimit(result.rows, PROJECT_RESOURCE_LIMITS.maxWizardResultRows, `${path}.results.${resultName}.rows`)
    assertArrayLimit(result.alternatives, PROJECT_RESOURCE_LIMITS.maxWizardAlternatives, `${path}.results.${resultName}.alternatives`)
  }
}

function assertPanelStateResourceLimits(value: unknown, path: string, rejectOversizedResults = true): void {
  if (!isRecord(value)) return
  assertArrayLimit(value.slots, PROJECT_RESOURCE_LIMITS.maxSlots, `${path}.slots`)
  assertRecordLimit(value.markers, PROJECT_RESOURCE_LIMITS.maxMarkers, `${path}.markers`)
  assertWizardResourceLimits(value.wizard, `${path}.wizard`, rejectOversizedResults)
}

function assertProjectResourceLimits(
  value: unknown,
  rejectOversizedWizardResults = true,
  traverseResourceTree = true,
): void {
  if (traverseResourceTree) assertProjectResourceTree(value)
  if (!isRecord(value)) return
  assertArrayLimit(value.slots, PROJECT_RESOURCE_LIMITS.maxSlots, 'project.slots')
  assertRecordLimit(value.markers, PROJECT_RESOURCE_LIMITS.maxMarkers, 'project.markers')
  assertRecordLimit(value.cytometerPanels, PROJECT_RESOURCE_LIMITS.maxCytometerPanels, 'project.cytometerPanels')
  assertWizardResourceLimits(value.wizard, 'project.wizard', rejectOversizedWizardResults)
  if (isRecord(value.cytometerPanels)) {
    Object.entries(value.cytometerPanels).forEach(([key, panel]) => assertPanelStateResourceLimits(panel, `project.cytometerPanels.${key}`, rejectOversizedWizardResults))
  }
}

export function normalizeWizardPanelResult(value: unknown): WizardPanelResult | null {
  if (!isRecord(value)) return null
  if (value.kind !== 'recommended' && value.kind !== 'best-fit') return null
  if (!Array.isArray(value.rows) || !Array.isArray(value.alternatives)) return null
  try {
    assertArrayLimit(value.rows, PROJECT_RESOURCE_LIMITS.maxWizardResultRows, 'wizard result rows')
    assertArrayLimit(value.alternatives, PROJECT_RESOURCE_LIMITS.maxWizardAlternatives, 'wizard result alternatives')
  } catch (error) {
    if (error instanceof ProjectResourceLimitError) return null
    throw error
  }
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

function isWizardResponseContext(value: unknown): value is WizardResponseContext {
  return isRecord(value)
    && typeof value.cytometer === 'string'
    && typeof value.configuration === 'string'
    && (value.measurement_mode === 'spectral' || value.measurement_mode === 'conventional')
}

export function normalizeWizardResults(
  value: unknown,
  expectedContext?: WizardResponseContext,
): WizardResults | null {
  if (!isRecord(value)) return null
  if (value.scoring_version !== WIZARD_SCORING_VERSION) return null
  const responseContext = value.response_context
  if (!isWizardResponseContext(responseContext)) return null
  if (!responseProvenanceMatchesPayload(
    responseContext.cytometer,
    responseContext.measurement_mode,
    value.response_provenance,
  )) return null
  if (expectedContext && (
    responseContext.cytometer !== expectedContext.cytometer
    || responseContext.configuration !== expectedContext.configuration
    || responseContext.measurement_mode !== expectedContext.measurement_mode
  )) return null
  const recommended = normalizeWizardPanelResult(value.recommended)
  const bestFit = normalizeWizardPanelResult(value.bestFit)
  return recommended && bestFit
    ? {
      scoring_version: WIZARD_SCORING_VERSION,
      response_provenance: value.response_provenance,
      response_context: responseContext,
      recommended,
      bestFit,
    }
    : null
}

function normalizeWizardState(
  value: unknown,
  expectedContext?: WizardResponseContext,
): WizardProjectState | null {
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
  const rawResults = normalizeWizardResults(value.results, expectedContext)
  const resultsInvalidated = value.resultsInvalidated === true || (isRecord(value.results) && rawResults === null)
  if (import.meta.env.DEV && isRecord(value.results) && rawResults === null) {
    const rawProvenance = isRecord(value.results.response_provenance)
      ? value.results.response_provenance
      : undefined
    console.info('OpenPanel discarded incompatible Wizard results during restore.', {
      scoringVersion: value.results.scoring_version,
      provenanceVersion: rawProvenance?.version,
    })
  }
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
    ...(resultsInvalidated ? { resultsInvalidated: true } : {}),
    activeTab,
    results: rawResults,
    resultMode,
    resultSort,
  }
}

function normalizeProjectSlot(value: unknown): string {
  return canonicalizeFluorophoreName(String(scalar(value) ?? '')).trim()
}

function projectSlotIdentity(value: string): string { return fluorophoreIdentity(value) }

function assertNoDuplicateSlots(value: Record<string, unknown>): void {
  const check = (slots: unknown, path: string) => {
    if (!Array.isArray(slots)) return
    const firstIndexByFluorophore = new Map<string, number>()
    slots.forEach((slot, index) => {
      const fluorophore = normalizeProjectSlot(slot)
      if (!fluorophore) return
      const identity = projectSlotIdentity(fluorophore)
      const firstIndex = firstIndexByFluorophore.get(identity)
      if (firstIndex !== undefined) {
        throw new Error(
          `OpenPanel project contains duplicate fluorophore ${JSON.stringify(fluorophore)} at ${path}[${index}] (first used at ${path}[${firstIndex}]).`,
        )
      }
      firstIndexByFluorophore.set(identity, index)
    })
  }

  check(value.slots, 'project.slots')
  if (isRecord(value.cytometerPanels)) {
    Object.entries(value.cytometerPanels).forEach(([key, panel]) => {
      if (isRecord(panel)) check(panel.slots, `project.cytometerPanels.${key}.slots`)
    })
  }
}

function normalizeSlots(value: unknown): string[] {
  if (!Array.isArray(value)) return Array(18).fill('')
  const seen = new Set<string>()
  return value.map((slot) => {
    const fluorophore = normalizeProjectSlot(slot)
    const identity = projectSlotIdentity(fluorophore)
    if (!fluorophore || seen.has(identity)) return ''
    seen.add(identity)
    return fluorophore
  })
}

function normalizeMarkers(value: unknown): Record<number, string> {
  const rawMarkers = isRecord(value) ? value : {}
  return Object.fromEntries(
    Object.entries(rawMarkers).map(([key, marker]) => [Number(key), String(scalar(marker) ?? '')]),
  )
}

function normalizeCytometerPanel(
  value: unknown,
  fallbackConfiguration: string,
  cytometer: string,
): CytometerPanelState | null {
  if (!isRecord(value)) return null
  const configuration = scalar(value.configuration)
  const effectiveConfiguration = typeof configuration === 'string' && configuration
    ? configuration
    : fallbackConfiguration
  const expectedContext = {
    cytometer,
    configuration: effectiveConfiguration,
    measurement_mode: responseMeasurementModeForCytometer(cytometer),
  }
  return {
    configuration: effectiveConfiguration,
    slots: normalizeSlots(value.slots),
    markers: normalizeMarkers(value.markers),
    wizard: normalizeWizardState(value.wizard, expectedContext),
  }
}

export function serializeProject(state: ProjectState): string {
  assertNoDuplicateSlots(state as unknown as Record<string, unknown>)
  const normalizedState = normalizeState(state as unknown as Record<string, unknown>)
  assertProjectResourceLimits(normalizedState)
  const serialized = serializeNormalizedProject(normalizedState)
  assertProjectTextWithinLimit(serialized)
  return serialized
}

function serializeNormalizedProject(normalizedState: ProjectState): string {
  const project: OpenPanelProject = {
    kind: PROJECT_FILE_KIND,
    version: PROJECT_FILE_VERSION,
    savedAt: new Date().toISOString(),
    ...normalizedState,
    markers: Object.fromEntries(Object.entries(normalizedState.markers).map(([key, value]) => [Number(key), String(value)])),
  }
  return `${JSON.stringify(project, null, 2)}\n`
}

function normalizeState(value: Record<string, unknown>, traverseResourceTree = true): ProjectState {
  assertProjectResourceLimits(value, false, traverseResourceTree)
  const savedTab = scalar(value.tab)
  const tab = savedTab === 'similarity' || savedTab === 'signatures' ? savedTab : 'panel'
  const theme = scalar(value.theme) === 'dark' ? 'dark' : 'light'
  const savedCytometer = scalar(value.cytometer)
  const savedConfiguration = scalar(value.configuration)
  const cytometer = typeof savedCytometer === 'string' ? savedCytometer : 'aurora'
  const configuration = typeof savedConfiguration === 'string' ? savedConfiguration : '5l_uv_v_b_yg_r'
  const legacyPanel: CytometerPanelState = {
    configuration,
    slots: normalizeSlots(value.slots),
    markers: normalizeMarkers(value.markers),
    wizard: normalizeWizardState(value.wizard, {
      cytometer,
      configuration,
      measurement_mode: responseMeasurementModeForCytometer(cytometer),
    }),
  }
  const rawCytometerPanels = isRecord(value.cytometerPanels) ? value.cytometerPanels : {}
  const cytometerPanels = Object.fromEntries(
    Object.entries(rawCytometerPanels)
      .map(([key, panel]) => [
        key,
        normalizeCytometerPanel(panel, key === cytometer ? configuration : '', key),
      ] as const)
      .filter((entry): entry is [string, CytometerPanelState] => entry[1] !== null),
  )
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

function parseProjectText(text: string, rejectDuplicateSlots: boolean): ProjectState {
  assertProjectTextWithinLimit(text)
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error('This project file is not valid JSON.')
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('This project file does not contain an OpenPanel project.')
  }
  assertProjectResourceLimits(value, false)
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
  if (rejectDuplicateSlots) assertNoDuplicateSlots(legacyConfig)
  const normalized = normalizeState(legacyConfig, false)
  assertProjectTextWithinLimit(serializeNormalizedProject(normalized))
  return normalized
}

export function parseProject(text: string): ProjectState {
  return parseProjectText(text, true)
}

export async function loadActiveProject(): Promise<ProjectState | null> {
  try {
    const db = await database()
    const stored = await db.get(PROJECT_STORE, ACTIVE_PROJECT_KEY) as ProjectState | undefined
    if (stored) {
      const normalized = normalizeState(stored as unknown as Record<string, unknown>)
      try {
        if (JSON.stringify(stored) !== JSON.stringify(normalized)) {
          await db.put(PROJECT_STORE, normalized, ACTIVE_PROJECT_KEY)
        }
      } catch {
        // A read remains usable even when a best-effort healing write fails.
      }
      return normalized
    }
  } catch (error) {
    if (error instanceof ProjectResourceLimitError) throw error
    // IndexedDB can be unavailable in hardened/private contexts; migrate from localStorage below.
  }
  try {
    const legacy = readLocalStorage(LEGACY_STORAGE_KEY)
    return legacy ? parseProjectText(legacy, false) : null
  } catch (error) {
    if (error instanceof ProjectResourceLimitError) throw error
    return null
  }
}

export async function saveActiveProject(state: ProjectState): Promise<void> {
  const normalizedState = normalizeState(state as unknown as Record<string, unknown>)
  try {
    await (await database()).put(PROJECT_STORE, normalizedState, ACTIVE_PROJECT_KEY)
  } catch {
    writeLocalStorage(LEGACY_STORAGE_KEY, serializeProject(normalizedState))
  }
}

function normalizePanelName(name: string): string {
  return name.trim().replace(/\s+/g, ' ') || 'Untitled panel'
}

function safeStoredProjectState(value: Record<string, unknown>): ProjectState {
  const safeString = (candidate: unknown, fallback: string): string => (
    typeof candidate === 'string' && candidate.length <= PROJECT_RESOURCE_LIMITS.maxStringLength
      ? candidate
      : fallback
  )
  return {
    cytometer: safeString(scalar(value.cytometer), 'aurora'),
    configuration: safeString(scalar(value.configuration), '5l_uv_v_b_yg_r'),
    slots: Array(18).fill(''),
    markers: {},
    tab: 'panel',
    theme: 'light',
    sidebarWidth: 214,
    sidebarCollapsed: false,
    plotScale: DEFAULT_PLOT_SCALE,
    plotScaleMode: 'fit-width',
    wizard: null,
    cytometerPanels: {},
  }
}

function recoverStoredProjectState(value: Record<string, unknown>): ProjectState {
  const safeString = (candidate: unknown, fallback: string): string => (
    typeof candidate === 'string' && candidate.length <= PROJECT_RESOURCE_LIMITS.maxStringLength
      ? candidate
      : fallback
  )
  const safeSlots = (candidate: unknown): string[] => (
    Array.isArray(candidate) && candidate.length <= PROJECT_RESOURCE_LIMITS.maxSlots
      ? candidate.map((slot) => typeof slot === 'string' && slot.length <= PROJECT_RESOURCE_LIMITS.maxStringLength ? slot : '')
      : Array(18).fill('')
  )
  const safeMarkers = (candidate: unknown): Record<string, string> => {
    if (!isRecord(candidate) || Object.keys(candidate).length > PROJECT_RESOURCE_LIMITS.maxMarkers) return {}
    return Object.fromEntries(
      Object.entries(candidate).map(([key, marker]) => [
        key,
        typeof marker === 'string' && marker.length <= PROJECT_RESOURCE_LIMITS.maxStringLength ? marker : '',
      ]),
    )
  }
  const safeCytometerPanels: Record<string, Record<string, unknown>> = {}
  if (isRecord(value.cytometerPanels)
    && Object.keys(value.cytometerPanels).length <= PROJECT_RESOURCE_LIMITS.maxCytometerPanels) {
    Object.entries(value.cytometerPanels).forEach(([key, panel]) => {
      if (!isRecord(panel)) return
      safeCytometerPanels[key] = {
        configuration: safeString(panel.configuration, ''),
        slots: safeSlots(panel.slots),
        markers: safeMarkers(panel.markers),
        wizard: null,
      }
    })
  }
  return normalizeState({
    cytometer: safeString(value.cytometer, 'aurora'),
    configuration: safeString(value.configuration, '5l_uv_v_b_yg_r'),
    slots: safeSlots(value.slots),
    markers: safeMarkers(value.markers),
    tab: safeString(value.tab, 'panel'),
    theme: safeString(value.theme, 'light'),
    sidebarWidth: 214,
    sidebarCollapsed: false,
    plotScale: DEFAULT_PLOT_SCALE,
    plotScaleMode: 'fit-width',
    wizard: null,
    cytometerPanels: safeCytometerPanels,
  })
}

function normalizeStoredPanel(value: unknown): StoredPanelProject | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (typeof record.id !== 'string' || typeof record.name !== 'string') return null
  if (!record.state || typeof record.state !== 'object' || Array.isArray(record.state)) return null
  const createdAt = typeof record.createdAt === 'string' ? record.createdAt : new Date(0).toISOString()
  const updatedAt = typeof record.updatedAt === 'string' ? record.updatedAt : createdAt
  let state: ProjectState
  let loadError: string | undefined
  try {
    state = normalizeState(record.state as Record<string, unknown>)
  } catch (error) {
    try {
      state = recoverStoredProjectState(record.state as Record<string, unknown>)
    } catch {
      state = safeStoredProjectState(record.state as Record<string, unknown>)
    }
    loadError = error instanceof Error ? error.message : 'Saved panel state could not be restored.'
  }
  return {
    id: record.id,
    name: normalizePanelName(record.name),
    createdAt,
    updatedAt,
    archivedAt: typeof record.archivedAt === 'string' ? record.archivedAt : undefined,
    state,
    ...(loadError ? { loadError } : {}),
  }
}

function fallbackLibrary(): StoredPanelProject[] {
  try {
    const parsed = JSON.parse(readLocalStorage(PANEL_LIBRARY_STORAGE_KEY) || '[]')
    return Array.isArray(parsed)
      ? parsed.map(normalizeStoredPanel).filter((panel): panel is StoredPanelProject => panel !== null)
      : []
  } catch {
    return []
  }
}

function writeFallbackLibrary(panels: StoredPanelProject[]): void {
  writeLocalStorage(PANEL_LIBRARY_STORAGE_KEY, JSON.stringify(panels))
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
  writeLocalStorage(ACTIVE_PANEL_ID_STORAGE_KEY, id)
}

export async function createPanelProject(
  name: string,
  state: ProjectState,
): Promise<StoredPanelProject> {
  assertNoDuplicateSlots(state as unknown as Record<string, unknown>)
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
    writeLocalStorage(LEGACY_STORAGE_KEY, serializeProject(panel.state))
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
  if (existing?.loadError) return existing
  assertNoDuplicateSlots(state as unknown as Record<string, unknown>)
  const now = new Date().toISOString()
  const panel: StoredPanelProject = {
    id,
    name: normalizePanelName(name),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    archivedAt: existing?.archivedAt,
    state: normalizeState(state as unknown as Record<string, unknown>),
  }
  try {
    const db = await database()
    await db.put(PROJECT_STORE, panel, `${PANEL_KEY_PREFIX}${id}`)
    await db.put(PROJECT_STORE, panel.state, ACTIVE_PROJECT_KEY)
  } catch {
    writeFallbackLibrary([panel, ...fallbackLibrary().filter((candidate) => candidate.id !== id)])
    writeLocalStorage(LEGACY_STORAGE_KEY, serializeProject(panel.state))
  }
  setActivePanelProject(id)
  return panel
}

export async function loadLastPanelProject(): Promise<StoredPanelProject | null> {
  const activeId = readLocalStorage(ACTIVE_PANEL_ID_STORAGE_KEY)
  if (activeId) {
    const active = await loadPanelProject(activeId)
    if (active && !active.archivedAt) return active
    removeLocalStorage(ACTIVE_PANEL_ID_STORAGE_KEY)
  }

  const panels = await listPanelProjects()
  const latestActivePanel = panels.find((panel) => !panel.archivedAt)
  if (latestActivePanel) {
    setActivePanelProject(latestActivePanel.id)
    return latestActivePanel
  }

  // A populated library is authoritative, even when every project is archived.
  // Legacy single-state recovery must never resurrect an explicitly archived panel.
  if (panels.length > 0) return null

  let legacy: ProjectState | null
  try {
    legacy = await loadActiveProject()
  } catch (error) {
    if (!(error instanceof ProjectResourceLimitError)) return null
    return {
      id: ACTIVE_PROJECT_KEY,
      name: 'Recovered panel',
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
      state: safeStoredProjectState({}),
      loadError: error.message,
    }
  }
  if (!legacy || !legacy.slots.some(Boolean)) return null
  return createPanelProject('Recovered panel', legacy)
}

async function writeStoredPanel(panel: StoredPanelProject): Promise<StoredPanelProject> {
  try {
    await (await database()).put(PROJECT_STORE, panel, `${PANEL_KEY_PREFIX}${panel.id}`)
  } catch {
    writeFallbackLibrary([panel, ...fallbackLibrary().filter((candidate) => candidate.id !== panel.id)])
  }
  return panel
}

export async function renamePanelProject(
  id: string,
  name: string,
): Promise<StoredPanelProject | null> {
  const panel = await loadPanelProject(id)
  if (!panel) return null
  if (panel.loadError) return panel
  return writeStoredPanel({
    ...panel,
    name: normalizePanelName(name),
    updatedAt: new Date().toISOString(),
  })
}

export async function duplicatePanelProject(
  id: string,
): Promise<StoredPanelProject | null> {
  const panel = await loadPanelProject(id)
  if (!panel) return null
  if (panel.loadError) return null
  const now = new Date().toISOString()
  const duplicate: StoredPanelProject = {
    ...panel,
    id: createPanelId(),
    name: normalizePanelName(`${panel.name} copy`),
    createdAt: now,
    updatedAt: now,
    archivedAt: undefined,
    state: normalizeState(panel.state as unknown as Record<string, unknown>),
  }
  return writeStoredPanel(duplicate)
}

export async function archivePanelProject(
  id: string,
): Promise<StoredPanelProject | null> {
  const panel = await loadPanelProject(id)
  if (!panel) return null
  if (panel.loadError) return panel
  const archived = await writeStoredPanel({
    ...panel,
    archivedAt: new Date().toISOString(),
  })
  if (readLocalStorage(ACTIVE_PANEL_ID_STORAGE_KEY) === id) {
    removeLocalStorage(ACTIVE_PANEL_ID_STORAGE_KEY)
  }
  return archived
}

export async function restorePanelProject(
  id: string,
): Promise<StoredPanelProject | null> {
  const panel = await loadPanelProject(id)
  if (!panel) return null
  if (panel.loadError) return panel
  const restored = { ...panel }
  delete restored.archivedAt
  return writeStoredPanel({
    ...restored,
    updatedAt: new Date().toISOString(),
  })
}

export async function deletePanelProject(id: string): Promise<void> {
  if (id === ACTIVE_PROJECT_KEY) {
    try {
      await (await database()).delete(PROJECT_STORE, ACTIVE_PROJECT_KEY)
    } catch {
      // Continue below so deletion clears both storage backends.
    }
    removeLocalStorage(LEGACY_STORAGE_KEY)
    removeLocalStorage(ACTIVE_PANEL_ID_STORAGE_KEY)
    return
  }
  try {
    await (await database()).delete(PROJECT_STORE, `${PANEL_KEY_PREFIX}${id}`)
  } catch {
    writeFallbackLibrary(fallbackLibrary().filter((panel) => panel.id !== id))
  }
  if (readLocalStorage(ACTIVE_PANEL_ID_STORAGE_KEY) === id) {
    removeLocalStorage(ACTIVE_PANEL_ID_STORAGE_KEY)
  }
}
