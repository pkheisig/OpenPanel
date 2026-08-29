import { BundledDataValidationError, parseCsv, validateBundledDataRows } from './spectralEngine'
import { buildMarkerOptions } from './panelWizardKnowledge'
import type { UiSelectOption } from './UiSelect'

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
function dataUrl(filename: string): string {
  const origin = typeof window === 'undefined' ? 'http://localhost' : window.location.origin
  return new URL(`data/${filename}`, new URL(import.meta.env.BASE_URL, origin)).toString()
}

async function loadCsv(filename: string): Promise<string[][]> {
  let response: Response
  try {
    response = await fetch(dataUrl(filename))
  } catch {
    return []
  }
  if (!response.ok) return []
  let rows: string[][]
  try {
    rows = parseCsv(await response.text())
  } catch (error) {
    if (error instanceof BundledDataValidationError) throw error
    throw new BundledDataValidationError(`${filename}: ${error instanceof Error ? error.message : String(error)}`)
  }
  validateBundledDataRows(filename, rows)
  return rows
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, '')
}

export function antigenDensityKey(cellType: string, antigen: string): string {
  return `${normalize(cellType)}::${normalize(antigen)}`
}

export function fluorophoreBrightnessKey(fluorophore: string): string {
  return normalize(fluorophore)
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
): Promise<WizardReferenceData> {
  if (!referenceRowsPromise) {
    const pending = Promise.all([
      loadCsv('panel_wizard_brightness.csv'),
      loadCsv('panel_wizard_antigen_density.csv'),
      loadCsv('marker_dictionary.csv'),
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
  const brightnessByFluorophore: Record<string, number> = {}
  rowsToRecords(rows.brightness).forEach((row) => {
    if (row.cytometer !== '*' && normalize(row.cytometer) !== normalize(cytometer)) return
    if (row.configuration !== '*' && normalize(row.configuration) !== normalize(configuration)) return
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
