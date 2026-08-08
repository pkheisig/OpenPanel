import { beforeEach, describe, expect, test } from 'vitest'
import { jsPDF } from 'jspdf'
import { projectJsonFilename } from '../src/browserFiles'
import { addSimilarityPage, createPanelOverviewPdf } from '../src/pdfExport'
import { detectImportedPanelRows } from '../src/panelBuilderShared'
import { buildPanelPayload } from '../src/spectralEngine'
import { mockBundledData } from './helpers'

beforeEach(mockBundledData)

describe('browser imports and exports', () => {
  test('names project JSON files from the project name', () => {
    expect(projectJsonFilename('T cell panel')).toBe('T cell panel_OpenPanel.json')
    expect(projectJsonFilename(' Tumor: panel/1. ')).toBe('Tumor_ panel_1_OpenPanel.json')
    expect(projectJsonFilename('   ')).toBe('Untitled panel_OpenPanel.json')
  })

  test('imports CSV, TSV, semicolon, reordered columns, and quoted marker values', async () => {
    const payload = await buildPanelPayload('aurora', '5l_uv_v_b_yg_r')
    expect(detectImportedPanelRows(
      '"Notes","Fluorophore","Marker"\n"keep","Alexa Fluor 488","CD3, gamma"\n"","Alexa Fluor 647","CD19"\n',
      payload.fluorophores,
    )).toEqual([
      { fluor: 'Alexa Fluor 488', marker: 'CD3, gamma' },
      { fluor: 'Alexa Fluor 647', marker: 'CD19' },
    ])
    expect(detectImportedPanelRows(
      'Target\tDye\nCD4\tAlexa Fluor 488\n',
      payload.fluorophores,
    )).toEqual([{ fluor: 'Alexa Fluor 488', marker: 'CD4' }])
    expect(detectImportedPanelRows(
      'Alexa Fluor 488;CD8\n',
      payload.fluorophores,
    )).toEqual([{ fluor: 'Alexa Fluor 488', marker: 'CD8' }])
    expect(detectImportedPanelRows(
      'Marker,Fluorophore\nLive,LIVE/DEAD Fixable Near-IR\n',
      [{
        fluorophore: 'LIVE DEAD NIR',
        peak_detector: 'R7-A',
        peak_laser: 'Red',
        peak_color: '#ff0000',
      }],
    )).toEqual([{ fluor: 'LIVE DEAD NIR', marker: 'Live' }])
  })

  test('creates a local multi-page PDF containing the report labels', async () => {
    const payload = await buildPanelPayload(
      'aurora',
      '5l_uv_v_b_yg_r',
      ['Alexa Fluor 488', 'Alexa Fluor 647'],
    )
    const pdf = createPanelOverviewPdf(payload, [
      { fluor: 'Alexa Fluor 488', marker: 'CD3' },
      { fluor: 'Alexa Fluor 647', marker: 'CD19' },
    ])
    const bytes = new Uint8Array(await pdf.arrayBuffer())
    const text = new TextDecoder('latin1').decode(bytes)
    expect(text.startsWith('%PDF-')).toBe(true)
    expect(bytes.byteLength).toBeGreaterThan(5_000)
    expect(text.match(/\/Type \/Page\b/g)?.length).toBeGreaterThanOrEqual(2)
  })

  test('creates the single-row conventional report and skips missing spectra safely', async () => {
    const payload = await buildPanelPayload('aurora', '5l_uv_v_b_yg_r', ['Alexa Fluor 488'])
    const conventional = { ...payload, measurement_mode: 'conventional' as const }
    const pdf = createPanelOverviewPdf(conventional, [{ fluor: 'Alexa Fluor 488', marker: '' }])
    const bytes = new Uint8Array(await pdf.arrayBuffer())
    expect(bytes.byteLength).toBeGreaterThan(1_000)

    const missing = createPanelOverviewPdf(payload, [{ fluor: 'Not in spectra', marker: 'CD3' }])
    expect((await missing.arrayBuffer()).byteLength).toBeGreaterThan(500)
  })

  test('renders similarity-page empty and dense matrix branches directly', async () => {
    const payload = await buildPanelPayload('aurora', '5l_uv_v_b_yg_r', ['Alexa Fluor 488', 'Alexa Fluor 647'])
    const document = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' })
    const fallbackPayload = {
      ...payload,
      cytometer: 'unknown-cytometer',
      configuration: 'unknown-configuration',
      libraries: [],
      configurations: [],
      complexity_index: null,
      similarity: [
        { fluorophore: 'Alexa Fluor 488', 'Alexa Fluor 488': 1, 'Alexa Fluor 647': 0.95 },
        { fluorophore: 'Alexa Fluor 647', 'Alexa Fluor 488': 0.95, 'Alexa Fluor 647': 1 },
      ],
    }
    addSimilarityPage(document, fallbackPayload, [{ fluor: 'Alexa Fluor 488', marker: 'CD3' }])
    addSimilarityPage(document, fallbackPayload, [
      { fluor: 'Alexa Fluor 488', marker: 'CD3' },
      { fluor: 'Alexa Fluor 647', marker: 'CD3' },
    ])
    const spectralBytes = new Uint8Array(document.output('arraybuffer') as ArrayBuffer)
    expect(spectralBytes.byteLength).toBeGreaterThan(1_000)

    const conventionalDocument = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' })
    addSimilarityPage(
      conventionalDocument,
      { ...fallbackPayload, measurement_mode: 'conventional' },
      [{ fluor: 'Alexa Fluor 488', marker: '' }],
    )
    expect((conventionalDocument.output('arraybuffer') as ArrayBuffer).byteLength).toBeGreaterThan(500)

    const densePayload = {
      ...payload,
      complexity_index: 0,
      similarity: [],
      spectra: [{ fluorophore: 'Alexa Fluor 488', V1: 'not numeric' } as never],
    }
    const duplicateDocument = createPanelOverviewPdf(densePayload, [
      { fluor: 'Alexa Fluor 488', marker: 'CD3' },
      { fluor: 'Alexa Fluor 488', marker: 'CD3' },
    ])
    expect((await duplicateDocument.arrayBuffer()).byteLength).toBeGreaterThan(1_000)
  })
})
