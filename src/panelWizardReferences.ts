import {
  BundledDataValidationError,
  parseCsv,
  resolveCytometer,
  resolveConfiguration,
  resolveBundledFluorophoreKey,
  resolveKnownConfiguration,
  resolveKnownConfigurationAcrossCytometers,
  validateBundledDataRows,
} from './spectralEngine'
import { canonicalizeFluorophoreName } from './fluorophoreNames'
import { buildMarkerOptions } from './panelWizardKnowledge'
import type { UiSelectOption } from './UiSelect'
import type { OpenPanelAssetResolver } from './module/hostServices'
import { createBrowserAssetResolver } from './standalone/browserAssetResolver'

export type WizardReferenceData = {
  brightnessByFluorophore: Record<string, number>
  antigenDensityByContext: Record<string, number>
  markerOptions: UiSelectOption[]
}

type ReferenceRows = {
  brightness: string[][]
  antigenDensity: string[][]
  markerDictionary: string[][]
}

let referenceRowsPromise: Promise<ReferenceRows> | null = null
const defaultAssetResolver = createBrowserAssetResolver()
let activeAssetResolver: OpenPanelAssetResolver = defaultAssetResolver

async function loadCsv(filename: string, assetResolver?: OpenPanelAssetResolver): Promise<string[][]> {
  const resolver = assetResolver ?? defaultAssetResolver
  let text: string
  try {
    text = await resolver.loadText(filename)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    const detail = reason.startsWith('could not load bundled data file (')
      ? reason.replace('could not load bundled data file', 'could not load bundled reference data')
      : `could not load bundled reference data: ${reason}`
    throw new BundledDataValidationError(
      `${filename}: ${detail}`,
    )
  }
  let rows: string[][]
  try {
    rows = parseCsv(text)
  } catch (error) {
    if (error instanceof BundledDataValidationError) throw error
    throw new BundledDataValidationError(`${filename}: ${error instanceof Error ? error.message : String(error)}`)
  }
  validateBundledDataRows(filename, rows, { requireComplete: import.meta.env.MODE !== 'test' })
  return rows
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, '')
}

export function antigenDensityKey(cellType: string, antigen: string): string {
  return `${normalize(cellType)}::${normalize(antigen)}`
}

export function fluorophoreBrightnessKey(fluorophore: string): string {
  return resolveBundledFluorophoreKey(fluorophore)
    ?? normalize(canonicalizeFluorophoreName(fluorophore))
}

function rowsToRecords(rows: string[][]): Array<Record<string, string>> {
  const headers = rows[0] ?? []
  return rows.slice(1).map((values) => (
    Object.fromEntries(headers.map((header, index) => [header, (values[index] ?? '').trim()]))
  ))
}

export async function loadPanelWizardReferences(
  cytometer: string,
  configuration: string,
  assetResolver?: OpenPanelAssetResolver,
): Promise<WizardReferenceData> {
  const resolver = assetResolver ?? defaultAssetResolver
  if (activeAssetResolver !== resolver) {
    activeAssetResolver = resolver
    referenceRowsPromise = null
  }
  if (!referenceRowsPromise) {
    const pending = Promise.all([
      loadCsv('panel_wizard_brightness.csv', resolver),
      loadCsv('panel_wizard_antigen_density.csv', resolver),
      loadCsv('marker_dictionary.csv', resolver),
    ]).then(([brightness, antigenDensity, markerDictionary]) => ({
      brightness,
      antigenDensity,
      markerDictionary,
    }))
    referenceRowsPromise = pending.catch((error: unknown) => {
      referenceRowsPromise = null
      throw error
    })
  }
  const rows = await referenceRowsPromise
  const requestedCytometer = resolveCytometer(cytometer)
  const requestedConfiguration = resolveConfiguration(requestedCytometer, configuration)
  const brightnessByFluorophore: Record<string, number> = {}
  rowsToRecords(rows.brightness).forEach((row) => {
    const rowCytometer = row.cytometer === '*' ? '*' : resolveCytometer(row.cytometer)
    if (rowCytometer !== '*' && rowCytometer !== requestedCytometer) return
    const rowConfiguration = row.configuration === '*'
      ? '*'
      : rowCytometer === '*'
        ? resolveKnownConfigurationAcrossCytometers(row.configuration)
        : resolveKnownConfiguration(rowCytometer, row.configuration)
    if (rowConfiguration !== '*' && rowConfiguration !== requestedConfiguration) return
    const score = Number(row.brightness_score)
    if (Number.isFinite(score)) brightnessByFluorophore[fluorophoreBrightnessKey(row.fluorophore)] = score
  })
  const antigenDensityByContext: Record<string, number> = {}
  rowsToRecords(rows.antigenDensity).forEach((row) => {
    const density = Number(row.molecules_per_cell)
    if (Number.isFinite(density)) {
      antigenDensityByContext[antigenDensityKey(row.cell_type, row.antigen)] = density
    }
  })
  return {
    brightnessByFluorophore,
    antigenDensityByContext,
    markerOptions: buildMarkerOptions(rowsToRecords(rows.markerDictionary)),
  }
}

export function resetPanelWizardReferencesForTests(): void {
  referenceRowsPromise = null
}
