import { Matrix, SingularValueDecomposition } from 'ml-matrix'
import type {
  ConfigurationInfo,
  DetectorInfo,
  FluorInfo,
  LibraryInfo,
  NumericRow,
  PanelPayload,
} from './panelBuilderShared'

type CytometerId = 'aurora' | 'discover' | 'id7000' | 'xenith'

type CsvRow = Record<string, string>

type SpectralLibrary = {
  detectors: string[]
  fluorophores: string[]
  values: number[][]
}

const LIBRARIES: LibraryInfo[] = [
  { id: 'aurora', label: 'Cytek Aurora' },
  { id: 'discover', label: 'BD FACSDiscover' },
  { id: 'id7000', label: 'Sony ID7000' },
  { id: 'xenith', label: 'Thermo Fisher Attune Xenith' },
]

const LIBRARY_FILES: Record<CytometerId, string> = {
  aurora: 'aurora_spectra.csv',
  discover: 'discover_spectra.csv',
  id7000: 'id7000_spectra.csv',
  xenith: 'xenith_spectra.csv',
}

const CYTOMETER_ALIASES: Record<string, CytometerId> = {
  aurora: 'aurora',
  cytekaurora: 'aurora',
  discover: 'discover',
  facsdiscover: 'discover',
  bdfacsdiscover: 'discover',
  discovers8: 'discover',
  discovera8: 'discover',
  id7000: 'id7000',
  sonyid7000: 'id7000',
  xenith: 'xenith',
  attunexenith: 'xenith',
  thermofisherxenith: 'xenith',
  thermofisherattunexenith: 'xenith',
  thermoscientificxenith: 'xenith',
  thermoscientificattunexenith: 'xenith',
}

const CONFIGURATIONS: Record<CytometerId, ConfigurationInfo[]> = {
  aurora: [
    { id: '5l_uv_v_b_yg_r', label: 'Aurora 5L: UV/V/B/YG/R', description: '16UV-16V-14B-10YG-8R' },
    { id: '4l_uv_v_b_r', label: 'Aurora 4L: UV/V/B/R', description: '16UV-16V-14B-8R' },
    { id: '4l_v_b_yg_r', label: 'Aurora 4L: V/B/YG/R', description: '16V-14B-10YG-8R' },
    { id: '3l_v_b_r', label: 'Aurora 3L: V/B/R', description: '16V-14B-8R' },
  ],
  discover: [
    { id: 'discover_s8', label: 'FACSDiscover S8: UV/V/B/YG/R', description: '22UV-20V-16B-12YG-8R' },
    { id: 'discover_a8', label: 'FACSDiscover A8: UV/V/B/YG/R', description: '22UV-20V-16B-12YG-8R' },
  ],
  id7000: [
    { id: 'id7000_5l', label: 'ID7000 5L: UV/V/B/YG/R', description: '147 fluorescence detectors' },
    { id: 'id7000_4l', label: 'ID7000 4L: V/B/YG/R', description: '112 fluorescence detectors' },
    { id: 'id7000_3l', label: 'ID7000 3L: V/B/R', description: '86 fluorescence detectors' },
  ],
  xenith: [
    { id: 'full', label: 'Thermo Fisher Attune Xenith full detector set', description: 'All packaged detectors' },
  ],
}

const CONFIGURATION_ALIASES: Record<string, string> = {
  full: 'full',
  discovers8: 'discover_s8',
  facsdiscovers8: 'discover_s8',
  bdfacsdiscovers8: 'discover_s8',
  discovera8: 'discover_a8',
  facsdiscovera8: 'discover_a8',
  bdfacsdiscovera8: 'discover_a8',
  id7000: 'id7000_5l',
  id70005l: 'id7000_5l',
  id70005laser: 'id7000_5l',
  id70005lcompact: 'id7000_5l',
  id70004l: 'id7000_4l',
  id70004laser: 'id7000_4l',
  id70003l: 'id7000_3l',
  id70003laser: 'id7000_3l',
  aurora5l: '5l_uv_v_b_yg_r',
  aurora5laser: '5l_uv_v_b_yg_r',
  '5l': '5l_uv_v_b_yg_r',
  '5laser': '5l_uv_v_b_yg_r',
  '5luvvbygr': '5l_uv_v_b_yg_r',
  aurora4luv: '4l_uv_v_b_r',
  aurora4luvvbr: '4l_uv_v_b_r',
  '4luv': '4l_uv_v_b_r',
  '4luvvbr': '4l_uv_v_b_r',
  aurora4lyg: '4l_v_b_yg_r',
  aurora4lvbygr: '4l_v_b_yg_r',
  '4lyg': '4l_v_b_yg_r',
  '4lvbygr': '4l_v_b_yg_r',
  aurora3l: '3l_v_b_r',
  aurora3laser: '3l_v_b_r',
  '3l': '3l_v_b_r',
  '3laser': '3l_v_b_r',
  '3lvbr': '3l_v_b_r',
}

const CONFIGURATION_LASERS: Record<string, string[] | undefined> = {
  '5l_uv_v_b_yg_r': ['UV', 'Violet', 'Blue', 'YellowGreen', 'Red'],
  '4l_uv_v_b_r': ['UV', 'Violet', 'Blue', 'Red'],
  '4l_v_b_yg_r': ['Violet', 'Blue', 'YellowGreen', 'Red'],
  '3l_v_b_r': ['Violet', 'Blue', 'Red'],
  discover_s8: ['UV', 'Violet', 'Blue', 'YellowGreen', 'Red'],
  discover_a8: ['UV', 'Violet', 'Blue', 'YellowGreen', 'Red'],
  id7000_5l: ['UV', 'Violet', 'Blue', 'YellowGreen', 'Red'],
  id7000_4l: ['Violet', 'Blue', 'YellowGreen', 'Red'],
  id7000_3l: ['Violet', 'Blue', 'Red'],
}

const LASER_PALETTE: Record<string, string> = {
  DeepUV: '#4c1d95',
  UV: '#6f006f',
  Violet: '#9d00d8',
  Blue: '#0757f2',
  YellowGreen: '#9acd2f',
  Red: '#ff140f',
  IR: '#7f1d1d',
  Other: '#64748b',
}

const LASER_ORDER = ['DeepUV', 'UV', 'Violet', 'Blue', 'YellowGreen', 'Red', 'IR', 'Other']

let initialization: Promise<void> | null = null
const libraries = new Map<CytometerId, SpectralLibrary>()
let cytometerDictionary: CsvRow[] = []
let fluorophoreDictionary: CsvRow[] = []

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    const next = text[index + 1]
    if (character === '"') {
      if (quoted && next === '"') {
        cell += '"'
        index += 1
      } else {
        quoted = !quoted
      }
    } else if (character === ',' && !quoted) {
      row.push(cell)
      cell = ''
    } else if ((character === '\n' || character === '\r') && !quoted) {
      row.push(cell)
      cell = ''
      if (row.some((value) => value.length > 0)) rows.push(row)
      row = []
      if (character === '\r' && next === '\n') index += 1
    } else {
      cell += character
    }
  }
  row.push(cell)
  if (row.some((value) => value.length > 0)) rows.push(row)
  if (rows[0]?.[0]) rows[0][0] = rows[0][0].replace(/^\uFEFF/, '')
  return rows
}

function rowsToObjects(rows: string[][]): CsvRow[] {
  const headers = rows[0] ?? []
  return rows.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])))
}

function dataUrl(filename: string): string {
  const origin = typeof window === 'undefined' ? 'http://localhost' : window.location.origin
  return new URL(`data/${filename}`, new URL(import.meta.env.BASE_URL, origin)).toString()
}

async function loadCsv(filename: string): Promise<string[][]> {
  const response = await fetch(dataUrl(filename))
  if (!response.ok) throw new Error(`Could not load bundled data file ${filename} (${response.status}).`)
  return parseCsv(await response.text())
}

function parseLibrary(rows: string[][]): SpectralLibrary {
  const headers = rows[0] ?? []
  if (headers.length < 2) throw new Error('A bundled spectral library has no detector columns.')
  const detectors = headers.slice(1)
  const seen = new Set<string>()
  const fluorophores: string[] = []
  const values: number[][] = []

  rows.slice(1).forEach((row) => {
    const fluorophore = (row[0] ?? '').trim()
    if (!fluorophore || seen.has(fluorophore)) return
    seen.add(fluorophore)
    fluorophores.push(fluorophore)
    values.push(detectors.map((_, index) => {
      const value = Number(row[index + 1])
      return Number.isFinite(value) ? value : 0
    }))
  })
  return { detectors, fluorophores, values }
}

export function initializeSpectralEngine(): Promise<void> {
  if (initialization) return initialization
  initialization = (async () => {
    const [aurora, discover, id7000, xenith, cytometers, fluorophores] = await Promise.all([
      loadCsv(LIBRARY_FILES.aurora),
      loadCsv(LIBRARY_FILES.discover),
      loadCsv(LIBRARY_FILES.id7000),
      loadCsv(LIBRARY_FILES.xenith),
      loadCsv('cytometer_dictionary.csv'),
      loadCsv('fluorophore_dictionary.csv'),
    ])
    libraries.set('aurora', parseLibrary(aurora))
    libraries.set('discover', parseLibrary(discover))
    libraries.set('id7000', parseLibrary(id7000))
    libraries.set('xenith', parseLibrary(xenith))
    cytometerDictionary = rowsToObjects(cytometers)
    fluorophoreDictionary = rowsToObjects(fluorophores)
  })()
  return initialization
}

function normalizeToken(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function normalizeDetectorToken(value: unknown): string {
  return String(value ?? '').trim().toUpperCase().replace(/\s+/g, '').replace(/([A-Z]+)-([0-9])/g, '$1$2')
}

function detectorKeys(detector: string): string[] {
  const noParentheses = detector.trim().replace(/\s*\([^)]*\)/g, '')
  const base = noParentheses.replace(/-A$/i, '')
  return Array.from(new Set([
    normalizeDetectorToken(detector),
    normalizeDetectorToken(noParentheses),
    normalizeDetectorToken(base),
    normalizeDetectorToken(base ? `${base}-A` : ''),
  ].filter(Boolean)))
}

export function resolveCytometer(value: unknown = 'aurora'): CytometerId {
  const key = normalizeToken(value || 'aurora')
  const match = CYTOMETER_ALIASES[key]
  if (!match) throw new Error('Spectral panel builder supports: aurora, discover, id7000, xenith.')
  return match
}

export function resolveConfiguration(cytometer: unknown, value?: unknown): string {
  const id = resolveCytometer(cytometer)
  const configs = CONFIGURATIONS[id]
  const key = normalizeToken(value)
  if (!key) return configs[0].id
  const direct = configs.find((config) => normalizeToken(config.id) === key)
  if (direct) return direct.id
  const alias = CONFIGURATION_ALIASES[key]
  return configs.some((config) => config.id === alias) ? alias : configs[0].id
}

function dictionaryCandidates(cytometer: CytometerId): CsvRow[] {
  const ids = cytometer === 'discover' ? new Set(['discover', 'discover_s8', 'discover_a8']) : new Set([cytometer])
  return cytometerDictionary.filter((row) => ids.has(row.cytometer))
}

function matchingDictionaryRow(cytometer: CytometerId, detector: string): CsvRow | undefined {
  const requested = new Set(detectorKeys(detector))
  return dictionaryCandidates(cytometer).find((row) => detectorKeys(row.detector ?? '').some((key) => requested.has(key)))
}

function detectorLaser(cytometer: CytometerId, detector: string): string {
  const dictionaryLaser = matchingDictionaryRow(cytometer, detector)?.laser
  if (dictionaryLaser) return dictionaryLaser
  if (/^320/i.test(detector)) return 'DeepUV'
  if (/^(UV|355)/i.test(detector)) return 'UV'
  if (/^(V|405)/i.test(detector)) return 'Violet'
  if (/^(B|488)/i.test(detector)) return 'Blue'
  if (/^(YG|Y|561)/i.test(detector)) return 'YellowGreen'
  if (/^(R|637|640)/i.test(detector)) return 'Red'
  if (/^(IR|808|781)/i.test(detector)) return 'IR'
  return 'Other'
}

const AURORA_EMISSIONS: Record<string, number[]> = {
  UV: [370, 395, 420, 440, 450, 480, 480, 500, 520, 550, 570, 580, 600, 660, 750, 800],
  V: [420, 440, 450, 480, 480, 500, 550, 570, 580, 600, 660, 680, 690, 700, 730, 780],
  B: [500, 520, 550, 550, 570, 580, 600, 600, 660, 680, 690, 700, 750, 780],
  YG: [570, 580, 600, 600, 660, 680, 700, 730, 750, 780],
  R: [660, 680, 700, 730, 730, 750, 780, 800],
}

function id7000Emission(detector: string): number | null {
  const match = detector.trim().toUpperCase().replace(/-A$/, '').match(/^(320|355|405|488|561|637|808)CH(\d+)$/)
  if (!match) return null
  const startChannel: Record<string, number> = { 320: 1, 355: 1, 405: 1, 488: 4, 561: 10, 637: 17, 808: 36 }
  const startEmission: Record<string, number> = { 320: 350, 355: 370, 405: 420, 488: 500, 561: 570, 637: 660, 808: 810 }
  return startEmission[match[1]] + (Number(match[2]) - startChannel[match[1]]) * 15
}

function detectorEmission(cytometer: CytometerId, detector: string): number {
  const description = matchingDictionaryRow(cytometer, detector)?.description ?? ''
  const descriptionMatch = description.match(/(\d{3})(?=\/|\/LP|-A)/)
  if (descriptionMatch) return Number(descriptionMatch[1])
  const parenthetical = detector.match(/\((\d{3})\)/)
  if (parenthetical) return Number(parenthetical[1])
  const embedded = detector.match(/.(\d{3})(?=-A$)/)
  if (embedded) return Number(embedded[1])

  if (cytometer === 'aurora') {
    const match = detector.trim().toUpperCase().replace(/-A$/, '').match(/^([A-Z]+)(\d+)$/)
    const emissions = match ? AURORA_EMISSIONS[match[1]] : undefined
    const emission = emissions?.[Number(match?.[2]) - 1]
    if (emission) return emission
  }
  if (cytometer === 'id7000') {
    const emission = id7000Emission(detector)
    if (emission) return emission
  }

  const laser = detectorLaser(cytometer, detector)
  const offset = Number(detector.match(/(\d+)(?=(?:-A)?$)/)?.[1] ?? 1)
  const starts: Record<string, number> = {
    DeepUV: 350,
    UV: 370,
    Violet: 420,
    Blue: 500,
    YellowGreen: 570,
    Red: 660,
    IR: 810,
    Other: 400,
  }
  return (starts[laser] ?? starts.Other) + (offset - 1) * 15
}

function detectorChannelIndex(detector: string): number {
  const clean = detector.trim().toUpperCase().replace(/\s*\([^)]*\)/g, '').replace(/-A$/, '')
  return Number(clean.match(/(?:CH)?(\d+)$/)?.[1] ?? 0)
}

function detectorMetadata(cytometer: CytometerId, detectors: string[]): DetectorInfo[] {
  return detectors.map((detector) => {
    const laser = detectorLaser(cytometer, detector)
    const description = matchingDictionaryRow(cytometer, detector)?.description?.trim() ?? ''
    return {
      detector,
      label: cytometer === 'aurora' ? detector : (description || detector),
      laser,
      emission: detectorEmission(cytometer, detector),
      color: LASER_PALETTE[laser] ?? LASER_PALETTE.Other,
    }
  }).sort((left, right) => {
    const laserDifference = LASER_ORDER.indexOf(left.laser) - LASER_ORDER.indexOf(right.laser)
    if (laserDifference) return laserDifference
    if (left.emission !== right.emission) return left.emission - right.emission
    const channelDifference = detectorChannelIndex(left.detector) - detectorChannelIndex(right.detector)
    return channelDifference || left.detector.localeCompare(right.detector)
  })
}

function normalizeRow(values: number[]): number[] {
  let denominator = 0
  values.forEach((value) => { denominator = Math.max(denominator, Math.abs(value)) })
  if (!Number.isFinite(denominator) || denominator <= 0) denominator = 1
  return values.map((value) => value / denominator)
}

function configurationDetectorIndices(library: SpectralLibrary, cytometer: CytometerId, configuration: string): number[] {
  const requestedLasers = CONFIGURATION_LASERS[configuration]
  const metadata = detectorMetadata(cytometer, library.detectors)
  const included = requestedLasers ? metadata.filter((detector) => requestedLasers.includes(detector.laser)) : metadata
  const indexByDetector = new Map(library.detectors.map((detector, index) => [detector, index]))
  return included.map((detector) => indexByDetector.get(detector.detector)).filter((index): index is number => index !== undefined)
}

function fluorophoreLookup(library: SpectralLibrary): Map<string, number> {
  const lookup = new Map<string, number>()
  library.fluorophores.forEach((fluorophore, index) => lookup.set(normalizeToken(fluorophore), index))
  fluorophoreDictionary.forEach((row) => {
    const canonicalIndex = lookup.get(normalizeToken(row.fluorophore))
    if (canonicalIndex === undefined) return
    const aliases = [row.fluorophore, ...(row.aliases ?? '').split(';')]
    aliases.forEach((alias) => {
      const key = normalizeToken(alias)
      if (key && !lookup.has(key)) lookup.set(key, canonicalIndex)
    })
  })
  return lookup
}

export function calculateSimilarityMatrix(values: number[][]): number[][] {
  const norms = values.map((row) => Math.sqrt(row.reduce((sum, value) => sum + value * value, 0)) || 1e-6)
  return values.map((row, rowIndex) => values.map((column, columnIndex) => {
    const dot = row.reduce((sum, value, index) => sum + value * column[index], 0)
    return Math.max(0, Math.min(1, dot / (norms[rowIndex] * norms[columnIndex])))
  }))
}

export function calculatePanelComplexity(values: number[][]): number | null {
  if (values.length === 0 || values[0]?.length === 0) return null
  if (values.length < 2) return 1
  const decomposition = new SingularValueDecomposition(new Matrix(values), { autoTranspose: true })
  const singularValues = decomposition.diagonal.filter((value) => Number.isFinite(value) && value > 0)
  if (singularValues.length === 0) return null
  const condition = Math.max(...singularValues) / Math.min(...singularValues)
  return Number.isFinite(condition) ? Math.round(condition * 100) / 100 : null
}

function namedRows(names: string[], detectors: string[], values: number[][]): NumericRow[] {
  return values.map((row, rowIndex) => ({
    fluorophore: names[rowIndex],
    ...Object.fromEntries(detectors.map((detector, detectorIndex) => [detector, row[detectorIndex]])),
  }))
}

export async function buildPanelPayload(
  cytometer: unknown = 'aurora',
  configuration?: unknown,
  requestedFluorophores: string[] = [],
): Promise<PanelPayload> {
  await initializeSpectralEngine()
  const id = resolveCytometer(cytometer)
  const config = resolveConfiguration(id, configuration)
  const library = libraries.get(id)
  if (!library) throw new Error(`Spectral library file is missing for cytometer '${id}'.`)

  const detectorIndices = configurationDetectorIndices(library, id, config)
  if (detectorIndices.length === 0) throw new Error('Selected spectral panel configuration has no matching detectors.')
  const detectors = detectorIndices.map((index) => library.detectors[index])
  const detectorInfo = detectorMetadata(id, detectors)
  const sortedDetectorIndex = new Map(detectors.map((detector, index) => [detector, index]))
  const outputIndices = detectorInfo.map((detector) => detectorIndices[sortedDetectorIndex.get(detector.detector) ?? 0])

  const retainedSignal = library.values.map((row) => outputIndices.reduce(
    (maximum, detectorIndex) => Math.max(maximum, Math.abs(row[detectorIndex])),
    0,
  ))
  const availableIndices = library.fluorophores
    .map((_, index) => index)
    .filter((index) => retainedSignal[index] >= 0.02)

  const availableRows = availableIndices.map((index) => normalizeRow(outputIndices.map((detectorIndex) => library.values[index][detectorIndex])))
  const fluorophores: FluorInfo[] = availableIndices.map((libraryIndex, availableIndex) => {
    const peakIndex = availableRows[availableIndex].reduce(
      (best, value, index, row) => value > row[best] ? index : best,
      0,
    )
    const peak = detectorInfo[peakIndex]
    return {
      fluorophore: library.fluorophores[libraryIndex],
      peak_detector: peak.detector,
      peak_laser: peak.laser,
      peak_color: peak.color,
      retained_signal: retainedSignal[libraryIndex],
    }
  }).sort((left, right) => left.peak_laser.localeCompare(right.peak_laser) || left.fluorophore.localeCompare(right.fluorophore))

  const lookup = fluorophoreLookup(library)
  const uniqueRequested = Array.from(new Set(requestedFluorophores.map((value) => value.trim()).filter(Boolean)))
  const selectedLabels: string[] = []
  const selectedValues: number[][] = []
  uniqueRequested.forEach((requested) => {
    const libraryIndex = lookup.get(normalizeToken(requested))
    if (libraryIndex === undefined || retainedSignal[libraryIndex] < 0.02) return
    selectedLabels.push(requested)
    selectedValues.push(normalizeRow(outputIndices.map((detectorIndex) => library.values[libraryIndex][detectorIndex])))
  })

  const similarityValues = calculateSimilarityMatrix(selectedValues)
  const similarity = namedRows(selectedLabels, selectedLabels, similarityValues)
  const peaks = selectedValues.map((row) => detectorInfo[row.reduce(
    (best, value, index, values) => value > values[best] ? index : best,
    0,
  )]?.detector ?? '')

  return {
    cytometer: id,
    configuration: config,
    libraries: LIBRARIES,
    configurations: CONFIGURATIONS[id],
    detectors: detectorInfo,
    fluorophores,
    selected: selectedLabels,
    spectra: namedRows(selectedLabels, detectorInfo.map((detector) => detector.detector), selectedValues),
    similarity,
    complexity_index: calculatePanelComplexity(selectedValues),
    peak_detectors: peaks,
  }
}

export function resetSpectralEngineForTests(): void {
  initialization = null
  libraries.clear()
  cytometerDictionary = []
  fluorophoreDictionary = []
}
