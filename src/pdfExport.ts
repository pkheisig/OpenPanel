import { jsPDF } from 'jspdf'
import { responseProvenanceForPayload, responseProvenanceWarningForPayload } from './panelBuilderShared'
import { createOpenSuiteProvenance, portableJson } from './provenance'
import type { DetectorInfo, NumericRow, PanelPayload } from './panelBuilderShared'

type PanelReportRow = {
  fluor: string
  marker: string
}

function numeric(row: NumericRow, detector: string): number {
  const value = Number(row[detector])
  return Number.isFinite(value) ? value : 0
}

function densityColor(value: number): [number, number, number] {
  const stops: Array<[number, [number, number, number]]> = [
    [0, [0, 0, 255]],
    [0.25, [0, 255, 255]],
    [0.5, [0, 255, 0]],
    [0.75, [255, 255, 0]],
    [1, [255, 0, 0]],
  ]
  const bounded = Math.max(0, Math.min(1, value))
  const upperIndex = Math.max(1, stops.findIndex(([position]) => bounded <= position))
  const [lowerPosition, lowerColor] = stops[upperIndex - 1]
  const [upperPosition, upperColor] = stops[upperIndex]
  const interpolation = (bounded - lowerPosition) / Math.max(0.0001, upperPosition - lowerPosition)
  return lowerColor.map((channel, index) => (
    Math.round(channel + (upperColor[index] - channel) * interpolation)
  )) as [number, number, number]
}

function reportLabel(row: PanelReportRow, used: Map<string, number>): string {
  const base = row.marker.trim() ? `${row.marker.trim()} / ${row.fluor}` : row.fluor
  const count = used.get(base) ?? 0
  used.set(base, count + 1)
  return count === 0 ? base : `${base} ${count}`
}

function addSimilarityPage(document: jsPDF, payload: PanelPayload, rows: PanelReportRow[]): void {
  const width = document.internal.pageSize.getWidth()
  const responseProvenance = responseProvenanceForPayload(
    payload.cytometer,
    payload.measurement_mode,
    payload.response_provenance,
  )
  const responseProvenanceWarning = responseProvenanceWarningForPayload(
    payload.cytometer,
    payload.measurement_mode,
    payload.response_provenance,
  )
  const title = responseProvenance.class === 'synthetic_filter_proxy'
    ? 'Fluorophore Detector-Overlap Planning Proxy'
    : responseProvenance.class === 'measured_detector_response'
      ? 'Fluorophore Detector-Response Similarity'
      : 'Fluorophore Spectral Similarity'
  const complexityLabel = responseProvenance.class === 'synthetic_filter_proxy'
    ? 'Planning-proxy complexity'
    : responseProvenance.class === 'measured_detector_response'
      ? 'Detector-response complexity'
      : 'Complexity Index'
  document.setFont('helvetica', 'bold')
  document.setFontSize(18)
  document.text(title, 12, 14)
  document.setFont('helvetica', 'normal')
  document.setFontSize(9)
  const cytometer = payload.libraries.find((item) => item.id === payload.cytometer)?.label ?? payload.cytometer
  const configuration = payload.configurations.find((item) => item.id === payload.configuration)?.label ?? payload.configuration
  document.text(`${cytometer} | ${configuration} | ${rows.length} fluorophore(s)`, 12, 21)
  document.setFont('helvetica', 'bold')
  document.text(`${complexityLabel}: ${payload.complexity_index?.toFixed(2) ?? 'NA'}`, width - 12, 14, { align: 'right' })
  document.setFont('helvetica', 'bold')
  document.setFontSize(8)
  const provenanceWidth = width - 24
  const lineHeight = () => document.getLineHeight() / document.internal.scaleFactor
  const sourceLines = document.splitTextToSize(
    `${responseProvenance.label} · ${responseProvenance.method} · Source: ${responseProvenance.source}`,
    provenanceWidth,
  )
  let contentY = 27
  document.text(sourceLines, 12, contentY)
  contentY += sourceLines.length * lineHeight() + 1
  document.setFont('helvetica', 'normal')
  document.setFontSize(7)
  const limitationLines = document.splitTextToSize(responseProvenance.limitation, provenanceWidth)
  document.text(limitationLines, 12, contentY)
  contentY += limitationLines.length * lineHeight() + 1
  if (responseProvenanceWarning) {
    document.setTextColor(180, 40, 30)
    const warningLines = document.splitTextToSize(`Warning: ${responseProvenanceWarning}`, provenanceWidth)
    document.text(warningLines, 12, contentY)
    contentY += warningLines.length * lineHeight() + 1
    document.setTextColor(0)
  }

  const contentStartY = Math.max(45, contentY)

  if (rows.length < 2) {
    document.text(
      responseProvenance.class === 'synthetic_filter_proxy'
        ? 'Add at least two fluorophores to calculate pairwise detector-peak planning-proxy similarity.'
        : responseProvenance.class === 'measured_detector_response'
          ? 'Add at least two fluorophores to calculate pairwise detector-response similarity.'
          : 'Add at least two fluorophores to calculate pairwise spectral similarity.',
      12,
      contentStartY,
    )
    return
  }

  const names = rows.map((row) => row.fluor)
  const byName = new Map(payload.similarity.map((row) => [row.fluorophore, row]))
  const labelWidth = 42
  const availableWidth = width - 24 - labelWidth
  const cell = Math.min(15, availableWidth / names.length, 120 / names.length)
  const startX = 12 + labelWidth
  const startY = contentStartY
  const fontSize = Math.max(4, Math.min(8, cell * 0.55))

  names.forEach((name, rowIndex) => {
    document.setFont('helvetica', 'normal')
    document.setFontSize(fontSize)
    document.setTextColor(25, 35, 42)
    document.text(name, startX - 2, startY + rowIndex * cell + cell * 0.68, { align: 'right', maxWidth: labelWidth - 3 })
    names.forEach((columnName, columnIndex) => {
      if (columnIndex > rowIndex) return
      const value = rowIndex === columnIndex ? 1 : Number(byName.get(name)?.[columnName] ?? 0)
      if (rowIndex === columnIndex) {
        document.setFillColor(230, 232, 235)
      } else {
        const intensity = Math.max(0, Math.min(1, value))
        document.setFillColor(255 - intensity * 52, 255 - intensity * 218, 255 - intensity * 226)
      }
      const x = startX + columnIndex * cell
      const y = startY + rowIndex * cell
      document.rect(x, y, cell, cell, 'F')
      document.setTextColor(value > 0.8 && rowIndex !== columnIndex ? 255 : 20)
      document.text(value === 1 ? '1' : value.toFixed(2), x + cell / 2, y + cell * 0.65, { align: 'center' })
    })
  })
}

function addReportProvenanceNote(document: jsPDF, payload: PanelPayload): void {
  const width = document.internal.pageSize.getWidth()
  const responseProvenance = responseProvenanceForPayload(
    payload.cytometer,
    payload.measurement_mode,
    payload.response_provenance,
  )
  const responseProvenanceWarning = responseProvenanceWarningForPayload(
    payload.cytometer,
    payload.measurement_mode,
    payload.response_provenance,
  )
  document.setFont('helvetica', 'bold')
  document.setFontSize(7)
  document.setTextColor(20, 30, 35)
  document.text(responseProvenance.label, 12, 9)
  document.setFont('helvetica', 'normal')
  document.text(
    `${responseProvenance.method}. Source: ${responseProvenance.source}. ${responseProvenance.limitation}${responseProvenanceWarning ? ` Warning: ${responseProvenanceWarning}` : ''}`,
    12,
    13,
    { maxWidth: width - 24 },
  )
  document.setTextColor(0)
}

function addSignatureChart(
  document: jsPDF,
  detectorInfo: DetectorInfo[],
  spectrum: NumericRow,
  title: string,
  top: number,
): void {
  const pageWidth = document.internal.pageSize.getWidth()
  const left = 18
  const chartWidth = pageWidth - left - 10
  const chartHeight = 70
  const baseline = top + chartHeight
  document.setFont('helvetica', 'bold')
  document.setFontSize(12)
  document.setTextColor(20, 30, 35)
  document.text(title, pageWidth / 2, top - 4, { align: 'center' })
  document.setDrawColor(210)
  document.rect(left, top, chartWidth, chartHeight)

  const values = detectorInfo.map((detector) => Math.max(0, Math.min(1, numeric(spectrum, detector.detector))))
  const columnWidth = chartWidth / Math.max(1, values.length)
  document.setFont('helvetica', 'normal')
  document.setFontSize(5)
  document.setTextColor(85)
  for (let tick = 0; tick <= 6; tick += 1) {
    const transformed = Math.pow(tick, 1.5)
    const y = baseline - (transformed / Math.pow(6.35, 1.5)) * chartHeight
    document.setDrawColor(235)
    document.line(left, y, left + chartWidth, y)
    document.text(`10^${tick}`, left - 1.5, y + 0.8, { align: 'right' })
  }

  values.forEach((value, index) => {
    const centerX = left + (index + 0.5) * columnWidth
    for (let bin = 0; bin < 37; bin += 1) {
      const offset = -0.42 + (bin / 36) * 0.84
      const relative = -1 + (bin / 36) * 2
      const centerWeight = Math.max(0.08, 1 - Math.pow(Math.abs(relative), 1.6))
      const centerLog = 0.35 + Math.pow(value, 0.72) * 5.65
      const originalY = Math.max(0.05, Math.min(6, centerLog + offset))
      const y = baseline - (Math.pow(originalY, 1.5) / Math.pow(6.35, 1.5)) * chartHeight
      const density = Math.min(1, centerWeight * Math.max(0.12, Math.sqrt(value)) * 1.35)
      document.setFillColor(...densityColor(density))
      document.rect(centerX - columnWidth * 0.38, y - 0.18, Math.max(0.18, columnWidth * 0.76), 0.36, 'F')
    }
  })

  document.setFontSize(5)
  document.setTextColor(70)
  const labelStep = Math.max(1, Math.ceil(detectorInfo.length / 28))
  detectorInfo.forEach((detector, index) => {
    if (index % labelStep !== 0) return
    const x = left + (index / Math.max(1, detectorInfo.length - 1)) * chartWidth
    document.text(detector.label.replace(/-A$/i, ''), x, baseline + 3, { angle: 90 })
  })
}

// Exported for focused coverage of the report-page rendering contract; the public
// builder below remains the normal entry point used by the UI.
export { addSimilarityPage }

function panelProvenancePayload(payload: PanelPayload, rows: PanelReportRow[]): Record<string, unknown> {
  return {
    cytometer: payload.cytometer,
    configuration: payload.configuration,
    measurement_mode: payload.measurement_mode,
    selected: payload.selected,
    detectors: payload.detectors,
    fluorophores: payload.fluorophores,
    response_provenance: payload.response_provenance,
    rows: rows.map((row) => ({ fluor: row.fluor, marker: row.marker })),
    complexity_index: payload.complexity_index,
    spectralLibraryRows: payload.spectra.length,
  }
}

export function createPanelOverviewPdf(payload: PanelPayload, rows: PanelReportRow[]): Blob {
  const document = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter', compress: true })
  const provenance = createOpenSuiteProvenance({
    artifactType: 'pdf',
    artifactName: 'Export OpenPanel panel overview PDF',
    payload: panelProvenancePayload(payload, rows),
    configurationId: `${payload.cytometer}:${payload.configuration}`,
    responseProvenance: payload.response_provenance,
    extensions: {
      payloadDefinition: 'Bounded panel descriptor; spectral response is identified by response provenance and row count.',
    },
  })
  document.setProperties({
    title: 'OpenPanel panel overview',
    creator: 'OpenPanel',
    subject: `OpenSuite provenance ${provenance.artifact.id}`,
    keywords: portableJson(provenance),
  })
  if (rows.length >= 2) addSimilarityPage(document, payload, rows)

  const spectra = new Map(payload.spectra.map((row) => [row.fluorophore, row]))
  const usedLabels = new Map<string, number>()
  rows.forEach((row, index) => {
    if (index % 2 === 0) {
      if (index > 0 || rows.length >= 2) document.addPage('letter', 'landscape')
      addReportProvenanceNote(document, payload)
    }
    const spectrum = spectra.get(row.fluor)
    if (!spectrum) return
    addSignatureChart(document, payload.detectors, spectrum, reportLabel(row, usedLabels), index % 2 === 0 ? 28 : 120)
  })
  return document.output('blob')
}
