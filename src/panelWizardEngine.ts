import {
  calculateCollinearityDiagnostic,
  calculatePanelComplexity,
  calculateSimilarityMatrix,
} from './spectralEngine'
import {
  fluorophoreBrightnessKey,
} from './panelWizardReferences'
import {
  responseProvenanceForPayload,
  responseMatrixProvenance,
  WIZARD_SCORING_VERSION,
} from './panelBuilderShared'
import type {
  NumericRow,
  PanelMeasurementMode,
  PanelPayload,
  CollinearityDiagnostic,
  ResponseMatrixProvenance,
} from './panelBuilderShared'
import type { WizardReferenceData } from './panelWizardReferences'

export type CoexpressionLevel = 0 | 1 | 2 | 3 | 4
export type AntigenDensity = 'low' | 'medium' | 'high'

export { WIZARD_SCORING_VERSION }

export const ANTIGEN_DENSITY_SCORES: Record<AntigenDensity, number> = {
  low: 20,
  medium: 55,
  high: 90,
}

export type WizardMarker = {
  id: string
  slotIndex: number
  name: string
  antigenDensity: AntigenDensity
  currentFluorophore: string
}

export type AvailabilityTier = 'Very common' | 'Common' | 'Limited' | 'Rare'

export type WizardRecommendation = {
  markerId: string
  markerName: string
  slotIndex: number
  antigenDensity: AntigenDensity
  fluorophore: string
  brightnessLevel: number | null
  isExisting: boolean
  peakLaser: string
  spectralFit: number
  recommendedScore: number
  maxSimilarity: number
  closestFluorophore: string
  complexityDelta: number
  availabilityScore: number
  availabilityTier: AvailabilityTier
  availabilityConfidence: 'Curated' | 'Estimated'
  sifDelta?: number | null
}

export type WizardAlternative = Omit<
  WizardRecommendation,
  'markerId' | 'markerName' | 'slotIndex' | 'antigenDensity'
>

export type WizardPanelResult = {
  kind: 'recommended' | 'best-fit'
  rows: WizardRecommendation[]
  alternatives: WizardAlternative[]
  complexity: number
  previousComplexity: number
  maxSimilarity: number
  maxSif?: number | null
  spectralRisk: number
  averageAvailability: number
}

export type WizardResponseContext = {
  cytometer: string
  configuration: string
  measurement_mode: PanelMeasurementMode
}

export type WizardResults = {
  scoring_version?: typeof WIZARD_SCORING_VERSION
  response_provenance?: ResponseMatrixProvenance
  response_context?: WizardResponseContext
  recommended: WizardPanelResult
  bestFit: WizardPanelResult
}

export type WizardTab = 'frequency' | 'coexpression' | 'recommendations'
export type WizardResultMode = 'recommended' | 'bestFit'
export type WizardResultSort = 'recommended' | 'spectral' | 'availability' | 'similarity' | 'complexity' | 'marker'

export type WizardProjectState = {
  desiredSize: number
  markers: WizardMarker[]
  coexpression: Record<string, CoexpressionLevel>
  coexpressionScale?: 5
  coexpressionContext?: {
    species: 'human' | 'mouse'
    tissue: 'peripheral-blood' | 'pbmc' | 'bone-marrow' | 'spleen' | 'tumor'
    population: 'all' | 't-cells' | 'b-cells' | 'nk-cells' | 'myeloid' | 'tumor-stroma'
    condition: 'baseline' | 'inflammatory' | 'tumor'
  }
  coexpressionVisited: boolean
  coexpressionCompleted: boolean
  inputsChanged?: boolean
  resultsInvalidated?: boolean
  activeTab: WizardTab
  results: WizardResults | null
  resultMode: WizardResultMode
  resultSort: WizardResultSort
}

type PanelMetrics = {
  complexity: number
  maxSimilarity: number
  topSimilarityMean: number
  maxSif: number | null
  collinearity: CollinearityDiagnostic
  spectralRisk: number
}

const SYNTHETIC_RESPONSE_PROVENANCE = responseMatrixProvenance('synthetic_filter_proxy')

type Availability = {
  score: number
  tier: AvailabilityTier
  confidence: 'Curated' | 'Estimated'
}

const CURATED_AVAILABILITY: Record<string, number> = {
  FITC: 100,
  PE: 100,
  APC: 100,
  PerCP: 94,
  'PerCP-Cy5.5': 94,
  'PE-Cy7': 94,
  'APC-Cy7': 92,
  BV421: 92,
  BV510: 88,
  BV605: 84,
  BV650: 82,
  BV711: 82,
  BV786: 82,
  BB515: 84,
  BUV395: 82,
  'Alexa Fluor 488': 88,
  'Alexa Fluor 594': 78,
  'Alexa Fluor 647': 88,
  'Alexa Fluor 700': 80,
  'PE-CF594': 82,
  'PE-Dazzle 594': 80,
  'APC-Fire 750': 76,
  'APC-Fire 810': 74,
  'PE-Fire 640': 72,
  'PE-Fire 700': 72,
  'PE-Fire 810': 70,
  'Pacific Blue': 80,
  V450: 76,
  V500: 72,
  'eFluor 450': 74,
  'eFluor 780': 72,
  'Zombie NIR': 70,
  '7-AAD': 86,
}

const FLUORESCENT_PROTEINS = new Set([
  'amcyan',
  'bfp',
  'cerulean',
  'cfp',
  'dsred',
  'dsredexpress',
  'ebfp',
  'ebfp2',
  'ecfp',
  'egfp',
  'eyfp',
  'gfp',
  'irfp670',
  'irfp720',
  'lssmorange',
  'mapple',
  'mcerulean',
  'mcerulean3',
  'mcherry',
  'mcitrine',
  'mKate',
  'mkate2',
  'mneongreen',
  'morange',
  'morange2',
  'mplum',
  'mraspberry',
  'mruby',
  'mruby2',
  'mruby3',
  'mscarlet',
  'mtagbfp',
  'mtagbfp2',
  'mturquoise',
  'mturquoise2',
  'mirfp670',
  'mirfp703',
  'rfp',
  'sapphire',
  'tdtomato',
  'tsapphire',
  'turquoise',
  'venus',
  'vexgfp',
  'yfp',
].map((name) => name.toLocaleLowerCase()))

const NON_ANTIBODY_PROBE_PATTERNS = [
  /^celltrace\b/i,
  /^celltracker\b/i,
  /^chromomycin\b/i,
  /^cfse$/i,
  /^draq5$/i,
  /^hoechst\b/i,
  /^mitosox\b/i,
  /^mitospy\b/i,
  /^mitotracker\b/i,
  /^monochlorobimane$/i,
  /^nucview\b/i,
  /^rhod-?2\b/i,
  /^tag-it\b/i,
  /^thiazole orange$/i,
  /^tmre$/i,
  /^tmrm$/i,
]

function normalizedFluorophoreName(name: string): string {
  return name.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '')
}

export function isFluorescentProtein(fluorophore: string): boolean {
  return FLUORESCENT_PROTEINS.has(normalizedFluorophoreName(fluorophore))
}

export function isViabilityMarkerName(markerName: string): boolean {
  const normalized = markerName.trim().toLocaleLowerCase()
  return /live[\s/_-]*dead/.test(normalized)
    || /viab/.test(normalized)
    || /(?:^|[^a-z])(?:live|dead|via)(?:[^a-z]|$)/.test(normalized)
}

export function isViabilityDye(fluorophore: string): boolean {
  return /^(?:7-?aad|dapi|draq7|efluor 780|fixable viability|fvs\b|ghost dye|kiravia|live[ /-]?dead|live-or-dye|propidium iodide|sytox|via(?:dye|krome)|zombie)/i
    .test(fluorophore.trim())
}

export function isWizardFluorophoreAllowed(
  fluorophore: string,
  markerName: string,
): boolean {
  if (isFluorescentProtein(fluorophore)) return false
  const viabilityMarker = isViabilityMarkerName(markerName)
  if (viabilityMarker) return isViabilityDye(fluorophore)
  if (isViabilityDye(fluorophore)) return false
  return !NON_ANTIBODY_PROBE_PATTERNS.some((pattern) => pattern.test(fluorophore.trim()))
}

function clamp(value: number, minimum = 0, maximum = 100): number {
  return Math.min(maximum, Math.max(minimum, value))
}

export function coexpressionKey(leftId: string, rightId: string): string {
  return [leftId, rightId].sort().join('::')
}

export function antigenDensityScore(density: AntigenDensity): number {
  return ANTIGEN_DENSITY_SCORES[density]
}

function brightnessDemand(density: AntigenDensity): number {
  if (density === 'low') return 5
  if (density === 'medium') return 3
  return 1
}

export function markerFluorophoreBrightnessScore(
  marker: WizardMarker,
  fluorophore: string,
  references?: WizardReferenceData,
): number | null {
  if (!references) return null
  const brightness = references.brightnessByFluorophore[fluorophoreBrightnessKey(fluorophore)]
  if (!Number.isFinite(brightness)) return null
  const demand = brightnessDemand(marker.antigenDensity)
  const underpowered = Math.max(0, demand - brightness)
  const overpowered = Math.max(0, brightness - demand)
  return Math.round(clamp(100 - underpowered ** 2 * 22 - overpowered ** 2 * 5))
}

export function fluorophoreBrightnessLevel(
  fluorophore: string,
  references?: WizardReferenceData,
): number | null {
  const brightness = references?.brightnessByFluorophore[fluorophoreBrightnessKey(fluorophore)]
  return typeof brightness === 'number' && Number.isFinite(brightness)
    ? Math.max(1, Math.min(5, Math.round(brightness)))
    : null
}

function brightnessCoverageRisk(
  selection: string[],
  locked: string[],
  markers: WizardMarker[],
  references?: WizardReferenceData,
): number {
  if (!references) return 0
  const demands = markers
    .filter((marker) => !marker.currentFluorophore)
    .sort((left, right) => (
      brightnessDemand(right.antigenDensity) - brightnessDemand(left.antigenDensity)
    ))
  const available = selection
    .filter((fluorophore) => !locked.includes(fluorophore))
    .map((fluorophore) => ({
      fluorophore,
      brightness: references.brightnessByFluorophore[fluorophoreBrightnessKey(fluorophore)],
    }))
    .filter(({ brightness }) => Number.isFinite(brightness))
    .sort((left, right) => right.brightness - left.brightness)
  const pairCount = Math.min(demands.length, available.length)
  if (pairCount === 0) return 0
  return demands.slice(0, pairCount).reduce((sum, marker, index) => {
    const score = markerFluorophoreBrightnessScore(marker, available[index].fluorophore, references)
    return sum + (score === null ? 0 : (100 - score) / 100)
  }, 0) / pairCount
}

function combinedSelectionRisk(
  selection: string[],
  locked: string[],
  markers: WizardMarker[],
  spectra: Map<string, number[]>,
  references?: WizardReferenceData,
  responseProvenance?: ResponseMatrixProvenance,
): number {
  return panelMetrics(selection, spectra, responseProvenance).spectralRisk
    + brightnessCoverageRisk(selection, locked, markers, references) * 12
}

export function fluorophoreAvailability(fluorophore: string): Availability {
  const curated = CURATED_AVAILABILITY[fluorophore]
  if (curated !== undefined) {
    return {
      score: curated,
      tier: availabilityTier(curated),
      confidence: 'Curated',
    }
  }

  let estimated = 38
  if (/^BV\d+$/i.test(fluorophore)) estimated = 76
  else if (/^BUV\d+$/i.test(fluorophore)) estimated = 70
  else if (/^BB\d+$/i.test(fluorophore)) estimated = 68
  else if (/^Alexa Fluor/i.test(fluorophore)) estimated = 72
  else if (/^(PE|APC)-/i.test(fluorophore)) estimated = 66
  else if (/^PerCP/i.test(fluorophore)) estimated = 64
  else if (/^(Super Bright|eFluor)/i.test(fluorophore)) estimated = 58
  else if (/^(Spark|NovaFluor|SBUV|SBV|SBY)/i.test(fluorophore)) estimated = 46
  else if (/^(RB|RY|R)\d+/i.test(fluorophore)) estimated = 42

  return {
    score: estimated,
    tier: availabilityTier(estimated),
    confidence: 'Estimated',
  }
}

export function recommendationScore(
  spectralFit: number,
  availabilityScore: number,
  brightnessMatch: number | null,
): number {
  return Math.round(clamp(brightnessMatch === null
    ? spectralFit * 0.4 + availabilityScore * 0.6
    : spectralFit * 0.3 + availabilityScore * 0.5 + brightnessMatch * 0.2))
}

function availabilityTier(score: number): AvailabilityTier {
  if (score >= 88) return 'Very common'
  if (score >= 68) return 'Common'
  if (score >= 45) return 'Limited'
  return 'Rare'
}

function spectrumVector(row: NumericRow, detectors: string[]): number[] {
  return detectors.map((detector) => {
    const value = Number(row[detector])
    return Number.isFinite(value) ? value : 0
  })
}

function sifForEndmember(metrics: PanelMetrics, fluorophore: string): number | null {
  if (metrics.collinearity.status !== 'ok') return null
  const index = metrics.collinearity.endmembers.indexOf(fluorophore)
  const value = index >= 0 ? metrics.collinearity.sifByEndmember[index] : null
  return value !== undefined && Number.isFinite(value) ? value : null
}

function sifDeltaBetween(full: PanelMetrics, baseline: PanelMetrics): number | null {
  if (full.collinearity.status !== 'ok' || baseline.collinearity.status !== 'ok') return null
  if (full.maxSif === null || baseline.maxSif === null) return null
  return Math.max(0, full.maxSif - baseline.maxSif)
}

function sifPenalty(value: number | null): number {
  return value === null ? 0 : Math.log2(Math.max(1, value)) * 10
}

function collinearityStatusPenalty(status: CollinearityDiagnostic['status']): number {
  return status === 'ok' || status === 'not_applicable' ? 0 : 100
}

function panelMetrics(
  names: string[],
  spectra: Map<string, number[]>,
  // Direct callers must opt into measured-response separation; the safe default
  // keeps an unspecified metric from claiming instrument-response evidence.
  responseProvenance: ResponseMatrixProvenance = SYNTHETIC_RESPONSE_PROVENANCE,
): PanelMetrics {
  const available = names
    .map((name) => ({ name, value: spectra.get(name) }))
    .filter((item): item is { name: string; value: number[] } => item.value !== undefined)
  const availableNames = available.map((item) => item.name)
  const values = available.map((item) => item.value)
  const complexity = calculatePanelComplexity(values) ?? Number.POSITIVE_INFINITY
  const similarities = calculateSimilarityMatrix(values)
  const pairs: number[] = []
  similarities.forEach((row, rowIndex) => {
    row.forEach((value, columnIndex) => {
      if (columnIndex > rowIndex) pairs.push(value)
    })
  })
  pairs.sort((left, right) => right - left)
  const maxSimilarity = pairs[0] ?? 0
  const topCount = Math.max(1, Math.ceil(pairs.length * 0.1))
  const topSimilarityMean = pairs.length === 0
    ? 0
    : pairs.slice(0, topCount).reduce((sum, value) => sum + value, 0) / topCount
  const collinearity = calculateCollinearityDiagnostic(values, availableNames, responseProvenance)
  const maxSif = collinearity.maxSif
  const complexityRisk = Number.isFinite(complexity) ? Math.log2(Math.max(1, complexity)) * 18 : 1000
  const collinearityRisk = values.length === 0
    ? 0
    : collinearity.status === 'ok'
    ? Math.log2(Math.max(1, maxSif ?? 1)) * 28
    : collinearity.status === 'not_applicable' ? 0 : 1000
  const similarityGuardrail = maxSimilarity >= 0.98
    ? 90 + (maxSimilarity - 0.98) * 500
    : maxSimilarity >= 0.9
      ? 35 + (maxSimilarity - 0.9) * 300
      : 0
  return {
    complexity,
    maxSimilarity,
    topSimilarityMean,
    maxSif,
    collinearity,
    spectralRisk: complexityRisk + collinearityRisk + maxSimilarity * 42 + topSimilarityMean * 22 + similarityGuardrail,
  }
}

function panelSimilarityRisk(
  names: string[],
  spectra: Map<string, number[]>,
): number {
  // This is only a cheap pairwise-similarity prefilter; final ranking uses the
  // provenance-aware panelMetrics path above.
  const values = names.map((name) => spectra.get(name)).filter((value): value is number[] => value !== undefined)
  const similarities = calculateSimilarityMatrix(values)
  const pairs: number[] = []
  similarities.forEach((row, rowIndex) => {
    row.forEach((value, columnIndex) => {
      if (columnIndex > rowIndex) pairs.push(value)
    })
  })
  pairs.sort((left, right) => right - left)
  const maximum = pairs[0] ?? 0
  const topCount = Math.max(1, Math.ceil(pairs.length * 0.1))
  const topMean = pairs.length === 0
    ? 0
    : pairs.slice(0, topCount).reduce((sum, value) => sum + value, 0) / topCount
  const guardrail = maximum >= 0.98
    ? 90 + (maximum - 0.98) * 500
    : maximum >= 0.9
      ? 35 + (maximum - 0.9) * 300
      : 0
  return maximum * 42 + topMean * 22 + guardrail
}

function optimizeBestFit(
  locked: string[],
  candidates: string[],
  additions: number,
  spectra: Map<string, number[]>,
  selectionAllowed: (selection: string[]) => boolean,
  markers: WizardMarker[],
  references?: WizardReferenceData,
  responseProvenance?: ResponseMatrixProvenance,
): string[] {
  let selected = [...locked]
  for (let index = 0; index < additions; index += 1) {
    const next = candidates
      .filter((candidate) => !selected.includes(candidate) && selectionAllowed([...selected, candidate]))
      .map((candidate) => ({
        candidate,
        quickRisk: panelSimilarityRisk([...selected, candidate], spectra)
          + brightnessCoverageRisk([...selected, candidate], locked, markers, references) * 12,
      }))
      .sort((left, right) => left.quickRisk - right.quickRisk)
      .slice(0, 14)
      .map(({ candidate }) => ({
        candidate,
        combinedRisk: combinedSelectionRisk(
          [...selected, candidate], locked, markers, spectra, references, responseProvenance,
        ),
      }))
      .sort((left, right) => (
        left.combinedRisk - right.combinedRisk
        || fluorophoreAvailability(right.candidate).score - fluorophoreAvailability(left.candidate).score
        || left.candidate.localeCompare(right.candidate)
      ))[0]
    if (!next) break
    selected.push(next.candidate)
  }

  const lockedCount = locked.length
  for (let pass = 0; pass < 3; pass += 1) {
    let improved = false
    for (let selectedIndex = lockedCount; selectedIndex < selected.length; selectedIndex += 1) {
      const currentRisk = combinedSelectionRisk(
        selected, locked, markers, spectra, references, responseProvenance,
      )
      const replacement = candidates
        .filter((candidate) => !selected.includes(candidate))
        .map((candidate) => {
          const trial = selected.map((name, index) => index === selectedIndex ? candidate : name)
          return {
            candidate,
            trial,
            quickRisk: panelSimilarityRisk(trial, spectra)
              + brightnessCoverageRisk(trial, locked, markers, references) * 12,
          }
        })
        .filter(({ trial }) => selectionAllowed(trial))
        .sort((left, right) => left.quickRisk - right.quickRisk)
        .slice(0, 10)
        .map(({ candidate, trial }) => ({
          candidate,
          trial,
          risk: combinedSelectionRisk(
            trial, locked, markers, spectra, references, responseProvenance,
          ),
        }))
        .filter((trial) => trial.risk + 1e-8 < currentRisk)
        .sort((left, right) => left.risk - right.risk)[0]
      if (replacement) {
        selected = replacement.trial
        improved = true
      }
    }
    if (!improved) break
  }
  return selected
}

function optimizeRecommended(
  bestFit: string[],
  lockedCount: number,
  candidates: string[],
  spectra: Map<string, number[]>,
  selectionAllowed: (selection: string[]) => boolean,
  locked: string[],
  markers: WizardMarker[],
  references?: WizardReferenceData,
  responseProvenance?: ResponseMatrixProvenance,
): string[] {
  let selected = [...bestFit]
  const bestMetrics = panelMetrics(bestFit, spectra, responseProvenance)
  const complexityLimit = Math.max(
    bestMetrics.complexity + 0.35,
    bestMetrics.complexity * 1.25,
  )
  const similarityLimit = Math.min(
    0.9,
    Math.max(bestMetrics.maxSimilarity + 0.15, bestMetrics.maxSimilarity * 1.5),
  )

  for (let pass = 0; pass < 8; pass += 1) {
    let bestSwap: { trial: string[]; availabilityGain: number; risk: number } | null = null
    const opportunities: Array<{ trial: string[]; availabilityGain: number; quickRisk: number }> = []
    for (let selectedIndex = lockedCount; selectedIndex < selected.length; selectedIndex += 1) {
      const currentAvailability = fluorophoreAvailability(selected[selectedIndex]).score
      for (const candidate of candidates) {
        if (selected.includes(candidate)) continue
        const availabilityGain = fluorophoreAvailability(candidate).score - currentAvailability
        if (availabilityGain <= 0) continue
        const trial = selected.map((name, index) => index === selectedIndex ? candidate : name)
        if (!selectionAllowed(trial)) continue
        opportunities.push({
          trial,
          availabilityGain,
          quickRisk: panelSimilarityRisk(trial, spectra)
            + brightnessCoverageRisk(trial, locked, markers, references) * 12,
        })
      }
    }
    const shortlisted = opportunities
      .sort((left, right) => (
        right.availabilityGain - left.availabilityGain
        || left.quickRisk - right.quickRisk
      ))
      .slice(0, 50)
    for (const opportunity of shortlisted) {
      const metrics = panelMetrics(opportunity.trial, spectra, responseProvenance)
      if (
        metrics.complexity > complexityLimit
        || metrics.maxSimilarity > similarityLimit
      ) continue
      const risk = combinedSelectionRisk(
        opportunity.trial, locked, markers, spectra, references, responseProvenance,
      )
      if (
        !bestSwap
        || opportunity.availabilityGain > bestSwap.availabilityGain
        || (opportunity.availabilityGain === bestSwap.availabilityGain && risk < bestSwap.risk)
      ) {
        bestSwap = {
          trial: opportunity.trial,
          availabilityGain: opportunity.availabilityGain,
          risk,
        }
      }
    }
    if (!bestSwap) break
    selected = bestSwap.trial
  }
  return selected
}

function closestPair(
  fluorophore: string,
  panelNames: string[],
  spectra: Map<string, number[]>,
): { name: string; similarity: number } {
  const target = spectra.get(fluorophore)
  if (!target) return { name: '', similarity: 0 }
  const others = panelNames.filter((name) => name !== fluorophore)
  if (others.length === 0) return { name: '', similarity: 0 }
  return others
    .map((name) => {
      const other = spectra.get(name)
      return {
        name,
        similarity: other ? calculateSimilarityMatrix([target, other])[0][1] : 0,
      }
    })
    .sort((left, right) => right.similarity - left.similarity)[0]
}

function markerPriority(
  marker: WizardMarker,
  markers: WizardMarker[],
  coexpression: Record<string, CoexpressionLevel>,
): number {
  const others = markers.filter((candidate) => candidate.id !== marker.id)
  const burden = others.length === 0
    ? 0
    : others.reduce((sum, candidate) => (
      sum + (coexpression[coexpressionKey(marker.id, candidate.id)] ?? 2) / 4
    ), 0) / others.length
  return antigenDensityScore(marker.antigenDensity) * 0.45 + burden * 55
}

function recommendationRows(
  selected: string[],
  locked: string[],
  markers: WizardMarker[],
  coexpression: Record<string, CoexpressionLevel>,
  spectra: Map<string, number[]>,
  payload: PanelPayload,
  references?: WizardReferenceData,
  responseProvenance?: ResponseMatrixProvenance,
): WizardRecommendation[] {
  const proposed = selected.filter((name) => !locked.includes(name))
  const fullMetrics = panelMetrics(selected, spectra, responseProvenance)
  const dyeMetric = (fluorophore: string) => {
    const without = selected.filter((name) => name !== fluorophore)
    const withoutMetrics = panelMetrics(without, spectra, responseProvenance)
    const withoutComplexity = withoutMetrics.complexity
    const pair = closestPair(fluorophore, selected, spectra)
    const complexityDelta = Number.isFinite(withoutComplexity)
      ? fullMetrics.complexity - withoutComplexity
      : 0
    const availability = fluorophoreAvailability(fluorophore)
    const sifDelta = sifDeltaBetween(fullMetrics, withoutMetrics)
    const spectralFit = Math.round(clamp(
      100
      - pair.similarity * 58
      - Math.max(0, complexityDelta) * 7
      - (sifDelta === null ? 0 : Math.log2(1 + sifDelta) * 18)
      - sifPenalty(sifForEndmember(fullMetrics, fluorophore))
      - collinearityStatusPenalty(fullMetrics.collinearity.status),
    ))
    return {
      fluorophore,
      pair,
      complexityDelta,
      availability,
      spectralFit,
      sifDelta,
      peakLaser: payload.fluorophores.find((item) => item.fluorophore === fluorophore)?.peak_laser ?? '',
    }
  }
  const dyeMetrics = proposed.map(dyeMetric).sort((left, right) => (
    right.spectralFit - left.spectralFit
    || right.availability.score - left.availability.score
  ))

  const unassignedMarkers = markers
    .filter((marker) => !marker.currentFluorophore)
    .sort((left, right) => markerPriority(right, markers, coexpression) - markerPriority(left, markers, coexpression))

  const assignedMarkers = markers
    .filter((marker) => marker.currentFluorophore)
    .map((marker) => ({ marker, fluorophore: marker.currentFluorophore }))
  const remainingDyes = [...dyeMetrics]

  const rows: WizardRecommendation[] = assignedMarkers.map(({ marker, fluorophore }) => {
    const dye = dyeMetric(fluorophore)
    const brightnessScore = markerFluorophoreBrightnessScore(marker, fluorophore, references)
    return {
      markerId: marker.id,
      markerName: marker.name,
      slotIndex: marker.slotIndex,
      antigenDensity: marker.antigenDensity,
      fluorophore,
      brightnessLevel: fluorophoreBrightnessLevel(fluorophore, references),
      isExisting: true,
      peakLaser: dye.peakLaser,
      spectralFit: dye.spectralFit,
      recommendedScore: recommendationScore(
        dye.spectralFit,
        dye.availability.score,
        brightnessScore,
      ),
      maxSimilarity: dye.pair.similarity,
      closestFluorophore: dye.pair.name,
      complexityDelta: dye.complexityDelta,
      availabilityScore: dye.availability.score,
      availabilityTier: dye.availability.tier,
      availabilityConfidence: dye.availability.confidence,
      sifDelta: dye.sifDelta,
    }
  })
  for (const marker of unassignedMarkers) {
    const allowedDyes = remainingDyes.filter((dye) => (
      isWizardFluorophoreAllowed(dye.fluorophore, marker.name)
    ))
    const viabilityDyes = isViabilityMarkerName(marker.name)
      ? allowedDyes.filter((dye) => isViabilityDye(dye.fluorophore))
      : []
    const rankedDyes = (viabilityDyes.length > 0 ? viabilityDyes : allowedDyes)
      .map((dye) => {
        const targetSpectrum = spectra.get(dye.fluorophore)
        const coexpressionPenalty = assignedMarkers.reduce((sum, assigned) => {
          const assignedSpectrum = spectra.get(assigned.fluorophore)
          if (!targetSpectrum || !assignedSpectrum) return sum
          const similarity = calculateSimilarityMatrix([targetSpectrum, assignedSpectrum])[0][1]
          const relationship = (coexpression[coexpressionKey(marker.id, assigned.marker.id)] ?? 2) / 4
          const densityWeight = 0.5 + (
            antigenDensityScore(marker.antigenDensity)
            + antigenDensityScore(assigned.marker.antigenDensity)
          ) / 200
          return sum + similarity * relationship * densityWeight
        }, 0)
        const brightnessScore = markerFluorophoreBrightnessScore(
          marker,
          dye.fluorophore,
          references,
        )
        const brightnessPenalty = brightnessScore === null ? 0 : (100 - brightnessScore) / 65
        const candidateMetrics = panelMetrics(
          [...selected, dye.fluorophore],
          spectra,
          responseProvenance,
        )
        const candidateSifPenalty = sifPenalty(sifForEndmember(candidateMetrics, dye.fluorophore))
          + collinearityStatusPenalty(candidateMetrics.collinearity.status)
        return {
          dye,
          brightnessScore,
          pairingCost: coexpressionPenalty
            + (100 - dye.spectralFit) / 250
            + brightnessPenalty
            + candidateSifPenalty / 100,
        }
      })
      .sort((left, right) => (
        left.pairingCost - right.pairingCost
        || right.dye.spectralFit - left.dye.spectralFit
      ))
    const dye = rankedDyes[0]?.dye
    if (!dye) continue
    remainingDyes.splice(remainingDyes.findIndex((candidate) => candidate.fluorophore === dye.fluorophore), 1)
    assignedMarkers.push({ marker, fluorophore: dye.fluorophore })
    const brightnessScore = markerFluorophoreBrightnessScore(marker, dye.fluorophore, references)
    const recommendedScore = recommendationScore(
      dye.spectralFit,
      dye.availability.score,
      brightnessScore,
    )
    rows.push({
      markerId: marker.id,
      markerName: marker.name,
      slotIndex: marker.slotIndex,
      antigenDensity: marker.antigenDensity,
      fluorophore: dye.fluorophore,
      brightnessLevel: fluorophoreBrightnessLevel(dye.fluorophore, references),
      isExisting: false,
      peakLaser: dye.peakLaser,
      spectralFit: dye.spectralFit,
      recommendedScore,
      maxSimilarity: dye.pair.similarity,
      closestFluorophore: dye.pair.name,
      complexityDelta: dye.complexityDelta,
      availabilityScore: dye.availability.score,
      availabilityTier: dye.availability.tier,
      availabilityConfidence: dye.availability.confidence,
      sifDelta: dye.sifDelta,
    })
  }
  return rows
}

function alternatives(
  selected: string[],
  candidates: string[],
  locked: string[],
  spectra: Map<string, number[]>,
  payload: PanelPayload,
  references?: WizardReferenceData,
  responseProvenance?: ResponseMatrixProvenance,
): WizardAlternative[] {
  const replaceable = selected.filter((name) => !locked.includes(name))
  const baseline = replaceable[replaceable.length - 1]
  return candidates
    .filter((candidate) => !selected.includes(candidate))
    .map((fluorophore) => {
      const trial = baseline
        ? selected.map((name) => name === baseline ? fluorophore : name)
        : [...selected, fluorophore]
      const metrics = panelMetrics(trial, spectra, responseProvenance)
      const pair = closestPair(fluorophore, trial, spectra)
      const availability = fluorophoreAvailability(fluorophore)
      const baselineComplexity = baseline
        ? panelMetrics(selected.filter((name) => name !== baseline), spectra, responseProvenance).complexity
        : panelMetrics(selected, spectra, responseProvenance).complexity
      const complexityDelta = Number.isFinite(baselineComplexity)
        ? metrics.complexity - baselineComplexity
        : 0
      const previousMetrics = baseline
        ? panelMetrics(selected.filter((name) => name !== baseline), spectra, responseProvenance)
        : panelMetrics(selected, spectra, responseProvenance)
      const sifDelta = sifDeltaBetween(metrics, previousMetrics)
      const spectralFit = Math.round(clamp(
        100
        - pair.similarity * 58
        - Math.max(0, complexityDelta) * 7
        - (sifDelta === null ? 0 : Math.log2(1 + sifDelta) * 18)
        - sifPenalty(sifForEndmember(metrics, fluorophore))
        - collinearityStatusPenalty(metrics.collinearity.status),
      ))
      return {
        fluorophore,
        brightnessLevel: fluorophoreBrightnessLevel(fluorophore, references),
        isExisting: false,
        peakLaser: payload.fluorophores.find((item) => item.fluorophore === fluorophore)?.peak_laser ?? '',
        spectralFit,
        sifDelta,
        recommendedScore: recommendationScore(spectralFit, availability.score, null),
        maxSimilarity: pair.similarity,
        closestFluorophore: pair.name,
        complexityDelta,
        availabilityScore: availability.score,
        availabilityTier: availability.tier,
        availabilityConfidence: availability.confidence,
      }
    })
    .sort((left, right) => right.recommendedScore - left.recommendedScore)
}

function buildResult(
  kind: WizardPanelResult['kind'],
  selected: string[],
  locked: string[],
  candidates: string[],
  markers: WizardMarker[],
  coexpression: Record<string, CoexpressionLevel>,
  spectra: Map<string, number[]>,
  payload: PanelPayload,
  references?: WizardReferenceData,
  responseProvenance?: ResponseMatrixProvenance,
): WizardPanelResult {
  const metrics = panelMetrics(selected, spectra, responseProvenance)
  const lockedMetrics = panelMetrics(locked, spectra, responseProvenance)
  const additions = selected.filter((name) => !locked.includes(name))
  const averageAvailability = additions.length === 0
    ? 0
    : additions.reduce((sum, name) => sum + fluorophoreAvailability(name).score, 0) / additions.length
  return {
    kind,
    rows: recommendationRows(
      selected, locked, markers, coexpression, spectra, payload, references, responseProvenance,
    ),
    alternatives: alternatives(
      selected, candidates, locked, spectra, payload, references, responseProvenance,
    ),
    complexity: metrics.complexity,
    previousComplexity: lockedMetrics.complexity,
    maxSimilarity: metrics.maxSimilarity,
    maxSif: metrics.maxSif,
    spectralRisk: metrics.spectralRisk,
    averageAvailability,
  }
}

export function generateWizardResults(
  payload: PanelPayload,
  markers: WizardMarker[],
  coexpression: Record<string, CoexpressionLevel>,
  desiredSize: number,
  references?: WizardReferenceData,
): WizardResults {
  const responseProvenance = responseProvenanceForPayload(
    payload.cytometer,
    payload.measurement_mode,
    payload.response_provenance,
  )
  const detectorNames = payload.detectors.map((detector) => detector.detector)
  const spectra = new Map(payload.spectra.map((row) => [
    row.fluorophore,
    spectrumVector(row, detectorNames),
  ]))
  const candidates = payload.fluorophores
    .map((item) => item.fluorophore)
    .filter((fluorophore) => (
      spectra.has(fluorophore)
      && markers.some((marker) => isWizardFluorophoreAllowed(fluorophore, marker.name))
    ))
  const eligibleMarkers = markers.map((marker) => (
    marker.currentFluorophore
      && !isWizardFluorophoreAllowed(marker.currentFluorophore, marker.name)
      ? { ...marker, currentFluorophore: '' }
      : marker
  ))
  const locked = Array.from(new Set(
    eligibleMarkers.map((marker) => marker.currentFluorophore).filter(Boolean),
  ))
  const requiredViabilityDyes = locked.filter(isViabilityDye).length
    + eligibleMarkers.filter((marker) => (
      !marker.currentFluorophore && isViabilityMarkerName(marker.name)
    )).length
  const targetSelectionSize = Math.min(desiredSize, candidates.length)
  const selectionAllowed = (selection: string[]) => (
    selection.filter(isViabilityDye).length <= requiredViabilityDyes
    && (
      selection.length < targetSelectionSize
      || selection.filter(isViabilityDye).length >= requiredViabilityDyes
    )
  )
  const additions = Math.max(0, Math.min(desiredSize - locked.length, candidates.length - locked.length))
  const bestSelection = optimizeBestFit(
    locked,
    candidates,
    additions,
    spectra,
    selectionAllowed,
    eligibleMarkers,
    references,
    responseProvenance,
  )
  const recommendedCandidates = candidates.filter((candidate) => (
    locked.includes(candidate) || fluorophoreAvailability(candidate).tier !== 'Rare'
  ))
  const addHighestAvailability = (pool: string[], minimumSize: number, viabilityOnly: boolean) => {
    candidates
      .filter((candidate) => (
        !pool.includes(candidate) && (!viabilityOnly || isViabilityDye(candidate))
      ))
      .sort((left, right) => (
        fluorophoreAvailability(right).score - fluorophoreAvailability(left).score
        || left.localeCompare(right)
      ))
      .some((candidate) => {
        pool.push(candidate)
        return pool.length >= minimumSize
      })
  }
  const missingViabilityDyes = Math.max(
    0,
    requiredViabilityDyes - recommendedCandidates.filter(isViabilityDye).length,
  )
  if (missingViabilityDyes > 0) {
    addHighestAvailability(
      recommendedCandidates,
      recommendedCandidates.length + missingViabilityDyes,
      true,
    )
  }
  if (recommendedCandidates.length < targetSelectionSize) {
    addHighestAvailability(recommendedCandidates, targetSelectionSize, false)
  }
  const recommendedBaseline = optimizeBestFit(
    locked,
    recommendedCandidates,
    additions,
    spectra,
    selectionAllowed,
    eligibleMarkers,
    references,
    responseProvenance,
  )
  const recommendedSelection = optimizeRecommended(
    recommendedBaseline,
    locked.length,
    recommendedCandidates,
    spectra,
    selectionAllowed,
    locked,
    eligibleMarkers,
    references,
    responseProvenance,
  )
  return {
    scoring_version: WIZARD_SCORING_VERSION,
    response_provenance: responseProvenance,
    response_context: {
      cytometer: payload.cytometer,
      configuration: payload.configuration,
      measurement_mode: payload.measurement_mode,
    },
    recommended: buildResult(
      'recommended',
      recommendedSelection,
      locked,
      candidates,
      eligibleMarkers,
      coexpression,
      spectra,
      payload,
      references,
      responseProvenance,
    ),
    bestFit: buildResult(
      'best-fit',
      bestSelection,
      locked,
      candidates,
      eligibleMarkers,
      coexpression,
      spectra,
      payload,
      references,
      responseProvenance,
    ),
  }
}

// These helpers remain part of the engine's deterministic surface so the
// numerical and fallback paths can be exercised without relying on a browser
// interaction to construct an otherwise unreachable state.
export {
  alternatives,
  brightnessCoverageRisk,
  closestPair,
  markerPriority,
  optimizeBestFit,
  panelMetrics,
  spectrumVector,
}
