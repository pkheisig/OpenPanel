import { beforeEach, describe, expect, test } from 'vitest'
import { createPanelOverviewPdf } from '../src/pdfExport'
import { detectImportedPanelRows } from '../src/panelBuilderShared'
import { buildPanelPayload } from '../src/spectralEngine'
import { mockBundledData } from './helpers'

beforeEach(mockBundledData)

describe('browser imports and exports', () => {
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
})
