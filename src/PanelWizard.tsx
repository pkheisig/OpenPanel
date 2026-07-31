import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  Eraser,
  ExternalLink,
  Info,
  LoaderCircle,
  Minus,
  Plus,
  Sparkles,
  WandSparkles,
  X,
} from 'lucide-react'
import './PanelWizard.css'
import { UiSelect } from './UiSelect'
import { buildPanelPayload } from './spectralEngine'
import { loadPanelWizardReferences } from './panelWizardReferences'
import {
  DEFAULT_COEXPRESSION_CONTEXT,
  inferCoexpression,
  markerOptionsForPanel,
  OMIP_DATABASE_URL,
  OMIP_TEMPLATES,
} from './panelWizardKnowledge'
import type {
  CoexpressionContext,
  OmipTemplate,
} from './panelWizardKnowledge'
import {
  coexpressionKey,
  generateWizardResults,
  isWizardFluorophoreAllowed,
  markerFrequencyScore,
} from './panelWizardEngine'
import type {
  CoexpressionLevel,
  MarkerFrequency,
  WizardMarker,
  WizardPanelResult,
  WizardProjectState,
  WizardRecommendation,
  WizardResultMode,
  WizardResultSort,
  WizardResults,
  WizardTab,
} from './panelWizardEngine'

export type WizardApplication = {
  markers: WizardMarker[]
  recommendations: WizardRecommendation[]
  desiredSize: number
}

type PanelWizardProps = {
  cytometer: string
  configuration: string
  configurationLabel: string
  availableFluorophores: string[]
  maxPanelSize: number
  slots: string[]
  markerNames: Record<number, string>
  theme: 'light' | 'dark'
  initialState: WizardProjectState | null
  onStateChange: (state: WizardProjectState) => void
  onClose: () => void
  onApply: (application: WizardApplication) => void | Promise<void>
}

const COEXPRESSION_LABELS: Record<CoexpressionLevel, string> = {
  0: 'None',
  1: 'Low',
  2: 'Medium',
  3: 'High',
  4: 'Very high',
}

const COEXPRESSION_SHORT_LABELS: Record<CoexpressionLevel, string> = {
  0: 'N',
  1: 'L',
  2: 'M',
  3: 'H',
  4: 'VH',
}

const SORT_OPTIONS = [
  { value: 'recommended', label: 'Recommended score' },
  { value: 'spectral', label: 'Spectral fit' },
  { value: 'availability', label: 'Availability' },
  { value: 'similarity', label: 'Lowest similarity' },
  { value: 'complexity', label: 'Lowest complexity impact' },
  { value: 'marker', label: 'Marker frequency' },
]

const FREQUENCY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
]

const CELL_TYPE_OPTIONS = [
  { value: '', label: 'Select cell type' },
  { value: 'T cells', label: 'T cells' },
  { value: 'CD4 T cells', label: 'CD4 T cells' },
  { value: 'CD8 T cells', label: 'CD8 T cells' },
  { value: 'Regulatory T cells', label: 'Regulatory T cells' },
  { value: 'B cells', label: 'B cells' },
  { value: 'Plasma cells', label: 'Plasma cells' },
  { value: 'NK cells', label: 'NK cells' },
  { value: 'NKT cells', label: 'NKT cells' },
  { value: 'Monocytes', label: 'Monocytes' },
  { value: 'Macrophages', label: 'Macrophages' },
  { value: 'Dendritic cells', label: 'Dendritic cells' },
  { value: 'Neutrophils', label: 'Neutrophils' },
  { value: 'Eosinophils', label: 'Eosinophils' },
  { value: 'Basophils', label: 'Basophils' },
  { value: 'Mast cells', label: 'Mast cells' },
  { value: 'Platelets', label: 'Platelets' },
  { value: 'Red blood cells', label: 'Red blood cells' },
  { value: 'Hematopoietic stem/progenitor cells', label: 'Hematopoietic stem/progenitor cells' },
  { value: 'Tumor cells', label: 'Tumor cells' },
  { value: 'Fibroblasts', label: 'Fibroblasts' },
  { value: 'Endothelial cells', label: 'Endothelial cells' },
  { value: 'Epithelial cells', label: 'Epithelial cells' },
  { value: 'Stromal cells', label: 'Stromal cells' },
]

const SPECIES_OPTIONS = [
  { value: 'human', label: 'Human' },
  { value: 'mouse', label: 'Mouse' },
]

const TISSUE_OPTIONS = [
  { value: 'pbmc', label: 'PBMC' },
  { value: 'peripheral-blood', label: 'Whole blood' },
  { value: 'bone-marrow', label: 'Bone marrow' },
  { value: 'spleen', label: 'Spleen' },
  { value: 'tumor', label: 'Tumor' },
]

const POPULATION_OPTIONS = [
  { value: 'all', label: 'All cells' },
  { value: 't-cells', label: 'T cells' },
  { value: 'b-cells', label: 'B cells' },
  { value: 'nk-cells', label: 'NK cells' },
  { value: 'myeloid', label: 'Myeloid cells' },
  { value: 'tumor-stroma', label: 'Tumor / stroma' },
]

const CONDITION_OPTIONS = [
  { value: 'baseline', label: 'Baseline' },
  { value: 'inflammatory', label: 'Inflammatory' },
  { value: 'tumor', label: 'Tumor' },
]

const CYTOMETER_LABELS: Record<string, string> = {
  aurora: 'Aurora',
  discover: 'FACSDiscover',
  id7000: 'ID7000',
  xenith: 'Attune Xenith',
}

function formatCytometerLabel(cytometer: string): string {
  return CYTOMETER_LABELS[cytometer.toLocaleLowerCase()]
    ?? cytometer.replace(/\b\w/g, (letter) => letter.toLocaleUpperCase())
}

function formatConfigurationLabel(configuration: string, label: string): string {
  const [instrumentPart, laserPart] = label.split(':').map((part) => part.trim())
  if (laserPart) {
    const configurationName = instrumentPart.split(/\s+/).at(-1) ?? instrumentPart
    const lasers = laserPart
      .split(/[/\s-]+/)
      .filter(Boolean)
      .map((laser) => laser.toLocaleUpperCase())
    return [configurationName.toLocaleUpperCase(), ...lasers].join('-')
  }
  if (configuration === 'full') return 'Full detector set'
  return configuration
    .split(/[_/\s-]+/)
    .filter(Boolean)
    .map((part) => part.toLocaleUpperCase())
    .join('-')
}

function initialMarkerSettings(
  desiredSize: number,
  slots: string[],
  markerNames: Record<number, string>,
): WizardMarker[] {
  const occupiedIndices = Array.from(new Set([
    ...slots.map((fluorophore, index) => fluorophore ? index : -1),
    ...Object.keys(markerNames).map(Number),
  ].filter((index) => index >= 0))).sort((left, right) => left - right)
  const indices = [...occupiedIndices]
  let candidateIndex = 0
  while (indices.length < desiredSize) {
    if (!indices.includes(candidateIndex)) indices.push(candidateIndex)
    candidateIndex += 1
  }
  return indices.slice(0, desiredSize).map((slotIndex) => {
    const name = markerNames[slotIndex]?.trim() || ''
    const currentFluorophore = slots[slotIndex] || ''
    return {
      id: `marker-${slotIndex}`,
      slotIndex,
      name,
      cellType: '',
      frequency: 'medium',
      currentFluorophore: name
        && currentFluorophore
        && !isWizardFluorophoreAllowed(currentFluorophore, name)
        ? ''
        : currentFluorophore,
    }
  })
}

function formatMetric(value: number, digits = 2): string {
  return Number.isFinite(value) ? value.toFixed(digits) : 'NA'
}

function BrightnessIndicator({ level }: { level: number | null | undefined }) {
  const normalizedLevel = Number.isFinite(level)
    ? Math.max(1, Math.min(5, Math.round(level as number)))
    : null
  if (normalizedLevel === null) {
    return (
      <span
        className="brightness-unavailable"
        role="img"
        aria-label="Brightness unavailable"
        title="Brightness unavailable"
      >
        —
      </span>
    )
  }

  return (
    <span
      className="brightness-indicator"
      role="img"
      aria-label={`Brightness ${normalizedLevel} of 5`}
      title={`Brightness ${normalizedLevel} of 5`}
    >
      {Array.from({ length: 5 }, (_, index) => (
        <span
          key={index}
          className={`brightness-dot${index < normalizedLevel ? ' is-filled' : ''}`}
          aria-hidden="true"
        />
      ))}
    </span>
  )
}

function sortRows(rows: WizardRecommendation[], sort: WizardResultSort): WizardRecommendation[] {
  return [...rows].sort((left, right) => {
    const leftIsExisting = left.isExisting === true
    const rightIsExisting = right.isExisting === true
    if (leftIsExisting !== rightIsExisting) return leftIsExisting ? -1 : 1
    if (sort === 'spectral') return right.spectralFit - left.spectralFit
    if (sort === 'availability') return right.availabilityScore - left.availabilityScore
    if (sort === 'similarity') return left.maxSimilarity - right.maxSimilarity
    if (sort === 'complexity') return left.complexityDelta - right.complexityDelta
    if (sort === 'marker') return markerFrequencyScore(right.frequency) - markerFrequencyScore(left.frequency)
    return right.recommendedScore - left.recommendedScore
  })
}

export function PanelWizard({
  cytometer,
  configuration,
  configurationLabel,
  availableFluorophores,
  maxPanelSize,
  slots,
  markerNames,
  theme,
  initialState,
  onStateChange,
  onClose,
  onApply,
}: PanelWizardProps) {
  const lockedCount = slots.filter(Boolean).length
  const defaultSize = Math.max(
    lockedCount,
    Math.min(maxPanelSize, slots.length),
  )
  const initialSize = Math.max(
    lockedCount,
    Math.min(maxPanelSize, initialState?.desiredSize ?? slots.length),
  )
  const [activeTab, setActiveTab] = useState<WizardTab>(initialState?.activeTab ?? 'frequency')
  const [desiredSize, setDesiredSize] = useState(initialSize)
  const [markers, setMarkers] = useState<WizardMarker[]>(() => (
    initialState?.markers.length
      ? initialState.markers.slice(0, initialSize).map((marker) => (
        marker.name.trim()
          && marker.currentFluorophore
          && !isWizardFluorophoreAllowed(marker.currentFluorophore, marker.name)
          ? { ...marker, currentFluorophore: '' }
          : marker
      ))
      : initialMarkerSettings(initialSize, slots, markerNames)
  ))
  const [coexpression, setCoexpression] = useState<Record<string, CoexpressionLevel>>(
    initialState?.coexpression ?? {},
  )
  const [coexpressionContext, setCoexpressionContext] = useState<CoexpressionContext>(
    initialState?.coexpressionContext ?? DEFAULT_COEXPRESSION_CONTEXT,
  )
  const [coexpressionVisited, setCoexpressionVisited] = useState(initialState?.coexpressionVisited ?? false)
  const [coexpressionCompleted, setCoexpressionCompleted] = useState(initialState?.coexpressionCompleted ?? false)
  const [calculating, setCalculating] = useState(false)
  const [results, setResults] = useState<WizardResults | null>(initialState?.results ?? null)
  const [resultMode, setResultMode] = useState<WizardResultMode>(initialState?.resultMode ?? 'recommended')
  const [resultSort, setResultSort] = useState<WizardResultSort>(initialState?.resultSort ?? 'recommended')
  const [error, setError] = useState('')
  const [applying, setApplying] = useState(false)
  const [dialog, setDialog] = useState<'coexpression' | 'templates' | null>(null)
  const [templatePreview, setTemplatePreview] = useState<OmipTemplate | null>(null)

  const frequencyReady = desiredSize > 0
    && markers.length === desiredSize
    && markers.every((marker) => marker.name.trim() && marker.frequency)
  const recommendationsUnlocked = frequencyReady && coexpressionVisited
  const activeResult: WizardPanelResult | null = results
    ? (resultMode === 'recommended' ? results.recommended : results.bestFit)
    : null
  const sortedRows = useMemo(
    () => activeResult ? sortRows(activeResult.rows, resultSort) : [],
    [activeResult, resultSort],
  )

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [onClose])

  useEffect(() => {
    onStateChange({
      desiredSize,
      markers,
      coexpression,
      coexpressionScale: 5,
      coexpressionContext,
      coexpressionVisited,
      coexpressionCompleted,
      activeTab,
      results,
      resultMode,
      resultSort,
    })
  }, [
    activeTab,
    coexpression,
    coexpressionContext,
    coexpressionCompleted,
    coexpressionVisited,
    desiredSize,
    markers,
    onStateChange,
    resultMode,
    resultSort,
    results,
  ])

  const invalidateResults = () => {
    setResults(null)
    setError('')
  }

  const updateDesiredSize = (nextValue: number) => {
    const nextSize = Math.max(
      lockedCount,
      Math.min(maxPanelSize, Math.round(nextValue || lockedCount)),
    )
    setDesiredSize(nextSize)
    setMarkers((current) => {
      if (current.length === nextSize) return current
      if (current.length > nextSize) return current.slice(0, nextSize)
      const next = [...current]
      const usedIndices = new Set(next.map((marker) => marker.slotIndex))
      let slotIndex = 0
      while (next.length < nextSize) {
        if (!usedIndices.has(slotIndex)) {
          next.push({
            id: `marker-${slotIndex}`,
            slotIndex,
            name: '',
            cellType: '',
            frequency: 'medium',
            currentFluorophore: slots[slotIndex] || '',
          })
          usedIndices.add(slotIndex)
        }
        slotIndex += 1
      }
      return next
    })
    setCoexpressionVisited(false)
    setCoexpressionCompleted(false)
    invalidateResults()
  }

  const updateMarker = (id: string, patch: Partial<WizardMarker>) => {
    setMarkers((current) => current.map((marker) => {
      if (marker.id !== id) return marker
      const next = { ...marker, ...patch }
      return next.name.trim()
        && next.currentFluorophore
        && !isWizardFluorophoreAllowed(next.currentFluorophore, next.name)
        ? { ...next, currentFluorophore: '' }
        : next
    }))
    setCoexpressionCompleted(false)
    invalidateResults()
  }

  const cycleCoexpression = (left: WizardMarker, right: WizardMarker) => {
    const key = coexpressionKey(left.id, right.id)
    const current = coexpression[key] ?? 2
    const next = ((current + 1) % 5) as CoexpressionLevel
    setCoexpression((values) => ({ ...values, [key]: next }))
    setCoexpressionCompleted(false)
    invalidateResults()
  }

  const switchTab = (nextTab: WizardTab) => {
    if (nextTab === 'recommendations' && !recommendationsUnlocked) return
    if (nextTab === 'coexpression') setCoexpressionVisited(true)
    if (nextTab === 'recommendations') setCoexpressionCompleted(true)
    setActiveTab(nextTab)
  }

  const colorOptions = (markerId: string) => {
    const selectedMarker = markers.find((marker) => marker.id === markerId)
    const usedColors = new Set(
      markers
        .filter((marker) => marker.id !== markerId)
        .map((marker) => marker.currentFluorophore)
        .filter(Boolean),
    )
    return [
      { value: '', label: 'Auto-select' },
      ...availableFluorophores
        .filter((fluorophore) => (
          !usedColors.has(fluorophore)
          && (
            fluorophore === selectedMarker?.currentFluorophore
            || isWizardFluorophoreAllowed(fluorophore, selectedMarker?.name ?? '')
          )
        ))
        .map((fluorophore) => ({ value: fluorophore, label: fluorophore })),
    ]
  }

  const markerOptions = (markerId: string) => {
    const selectedMarker = markers.find((marker) => marker.id === markerId)
    return [
      { value: '', label: 'Select marker' },
      ...markerOptionsForPanel(
        selectedMarker?.cellType ?? '',
        markers.filter((marker) => marker.id !== markerId).map((marker) => marker.name),
        coexpressionContext.species,
      ),
    ]
  }

  const autoFillCoexpression = () => {
    setCoexpression((current) => inferCoexpression(markers, coexpressionContext, current))
    setCoexpressionVisited(true)
    setCoexpressionCompleted(false)
    invalidateResults()
    setDialog(null)
  }

  const applyTemplate = (template: OmipTemplate) => {
    if (template.markers.length > maxPanelSize) return
    const templateMarkers = template.markers
    const nextSize = Math.max(lockedCount, templateMarkers.length)
    const usedColors = new Set<string>()
    const nextMarkers = Array.from({ length: nextSize }, (_, slotIndex) => {
      const templateMarker = templateMarkers[slotIndex]
      const name = templateMarker?.name ?? markerNames[slotIndex]?.trim() ?? ''
      const suggested = templateMarker?.fluorophore ?? slots[slotIndex] ?? ''
      const currentFluorophore = suggested
        && availableFluorophores.includes(suggested)
        && !usedColors.has(suggested)
        && isWizardFluorophoreAllowed(suggested, name)
        ? suggested
        : ''
      if (currentFluorophore) usedColors.add(currentFluorophore)
      return {
        id: `marker-${slotIndex}`,
        slotIndex,
        name,
        cellType: templateMarker?.cellType ?? '',
        frequency: templateMarker?.frequency ?? 'medium',
        currentFluorophore,
      } satisfies WizardMarker
    })
    setDesiredSize(nextSize)
    setMarkers(nextMarkers)
    setCoexpressionContext(template.context)
    setCoexpression(inferCoexpression(nextMarkers, template.context, {}))
    setCoexpressionVisited(false)
    setCoexpressionCompleted(false)
    setActiveTab('frequency')
    invalidateResults()
    setDialog(null)
    setTemplatePreview(null)
    setTemplatePreview(null)
  }

  const clearMarkerSetup = () => {
    setDesiredSize(defaultSize)
    setMarkers(initialMarkerSettings(defaultSize, slots, {}))
    setCoexpression({})
    setCoexpressionContext(DEFAULT_COEXPRESSION_CONTEXT)
    setCoexpressionVisited(false)
    setCoexpressionCompleted(false)
    setActiveTab('frequency')
    invalidateResults()
    setDialog(null)
  }

  const calculate = async () => {
    if (!recommendationsUnlocked) return
    setCalculating(true)
    setError('')
    setResults(null)
    await new Promise((resolve) => window.setTimeout(resolve, 30))
    try {
      const candidatePayload = await buildPanelPayload(
        cytometer,
        configuration,
        availableFluorophores,
      )
      const references = await loadPanelWizardReferences(cytometer, configuration)
      setResults(generateWizardResults(
        candidatePayload,
        markers,
        coexpression,
        desiredSize,
        references,
      ))
    } catch (calculationError) {
      setError(calculationError instanceof Error
        ? calculationError.message
        : 'The panel recommendations could not be calculated.')
    } finally {
      setCalculating(false)
    }
  }

  const applyRecommendations = async () => {
    if (!activeResult) return
    setApplying(true)
    try {
      await onApply({ markers, recommendations: activeResult.rows, desiredSize })
      onClose()
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : 'The recommendations could not be applied.')
    } finally {
      setApplying(false)
    }
  }

  const panelSizeControl = (
    <div className="wizard-panel-size">
      <span id="wizard-panel-size-label">Panel size</span>
      <span className="wizard-size-input">
        <button
          type="button"
          onClick={() => updateDesiredSize(desiredSize - 1)}
          disabled={desiredSize <= lockedCount}
          aria-label="Decrease panel size"
          title="Decrease panel size"
        >
          <Minus size={14} aria-hidden="true" />
        </button>
        <input
          type="number"
          min={lockedCount}
          max={maxPanelSize}
          value={desiredSize}
          onChange={(event) => updateDesiredSize(Number(event.target.value))}
          aria-labelledby="wizard-panel-size-label"
        />
        <button
          type="button"
          onClick={() => updateDesiredSize(desiredSize + 1)}
          disabled={desiredSize >= maxPanelSize}
          aria-label="Increase panel size"
          title="Increase panel size"
        >
          <Plus size={14} aria-hidden="true" />
        </button>
      </span>
    </div>
  )

  return (
    <div className={`panel-wizard-backdrop ${theme}`} role="presentation">
      <section
        className="panel-wizard-window"
        role="dialog"
        aria-modal="true"
        aria-labelledby="panel-wizard-title"
      >
        <header className="wizard-header">
          <div className="wizard-title">
            <span className="wizard-icon"><Sparkles size={19} /></span>
            <div>
              <h2 id="panel-wizard-title">Panel wizard</h2>
              <p>{formatCytometerLabel(cytometer)} · {formatConfigurationLabel(configuration, configurationLabel)}</p>
            </div>
          </div>
          <div className="wizard-header-actions">
            <div className="wizard-info">
              <button
                type="button"
                className="wizard-info-trigger"
                aria-label="About panel wizard calculations"
                aria-describedby="wizard-methodology"
              >
                <Info size={18} />
              </button>
              <div className="wizard-info-popover" id="wizard-methodology" role="tooltip">
                Marker-to-color assignments prioritize co-expressed, frequently positive markers for spectrally cleaner colors.
              </div>
            </div>
            <button type="button" className="wizard-close" onClick={onClose} aria-label="Close panel wizard">
              <X size={19} />
            </button>
          </div>
        </header>

        <nav className="wizard-tabs" aria-label="Panel wizard steps">
          <button
            type="button"
            className={activeTab === 'frequency' ? 'active' : ''}
            onClick={() => switchTab('frequency')}
          >
            <span>1</span>
            Marker setup
            {frequencyReady && <Check size={15} aria-label="Marker setup complete" />}
          </button>
          <button
            type="button"
            className={activeTab === 'coexpression' ? 'active' : ''}
            onClick={() => switchTab('coexpression')}
          >
            <span>2</span>
            Co-expression
            {coexpressionCompleted && <Check size={15} aria-label="Co-expression complete" />}
          </button>
          <button
            type="button"
            className={`${activeTab === 'recommendations' ? 'active' : ''}${recommendationsUnlocked ? '' : ' locked'}`}
            onClick={() => switchTab('recommendations')}
            disabled={!recommendationsUnlocked}
            aria-disabled={!recommendationsUnlocked}
          >
            <span>3</span>
            Recommendations
            {results && <Check size={15} aria-label="Recommendations complete" />}
          </button>
        </nav>

        <main className="wizard-body">
          {activeTab === 'frequency' && (
            <div className="wizard-step frequency-step">
              <div className="wizard-step-toolbar">
                <div className="wizard-toolbar-actions">
                  <button
                    type="button"
                    className="wizard-tool-button"
                    onClick={() => {
                      setTemplatePreview(null)
                      setDialog('templates')
                    }}
                  >
                    <BookOpen size={15} />
                    OMIP templates
                  </button>
                  <button
                    type="button"
                    className="wizard-tool-button"
                    onClick={clearMarkerSetup}
                  >
                    <Eraser size={15} />
                    Clear marker setup
                  </button>
                  {panelSizeControl}
                </div>
              </div>

              <div className="frequency-table-wrap">
                <table className="frequency-table">
                  <thead>
                    <tr>
                      <th>Marker</th>
                      <th>Cell type</th>
                      <th>Color</th>
                      <th>Expected positive frequency</th>
                    </tr>
                  </thead>
                  <tbody>
                    {markers.map((marker, index) => (
                      <tr key={marker.id}>
                        <td>
                          <UiSelect
                            className="wizard-marker-select"
                            label={`Marker ${index + 1} name`}
                            hideLabel
                            value={marker.name}
                            options={markerOptions(marker.id)}
                            onChange={(value) => updateMarker(marker.id, { name: value })}
                            searchable
                            searchPlaceholder="Search or enter marker"
                            portalMenu
                            menuClassName="wizard-marker-select-menu"
                            allowCustomValue
                          />
                        </td>
                        <td>
                          <UiSelect
                            className="wizard-cell-type-select"
                            label={`Cell type for marker ${index + 1}`}
                            hideLabel
                            value={marker.cellType}
                            options={CELL_TYPE_OPTIONS}
                            onChange={(value) => updateMarker(marker.id, { cellType: value })}
                            searchable
                            searchPlaceholder="Search or enter cell type"
                            portalMenu
                            menuClassName="wizard-cell-type-select-menu"
                            allowCustomValue
                          />
                        </td>
                        <td>
                          <UiSelect
                            className="wizard-color-select"
                            label={`Color for marker ${index + 1}`}
                            hideLabel
                            value={marker.currentFluorophore}
                            options={colorOptions(marker.id)}
                            onChange={(value) => updateMarker(marker.id, { currentFluorophore: value })}
                            searchable
                            searchPlaceholder="Search colors"
                            portalMenu
                            menuClassName="wizard-color-select-menu"
                          />
                        </td>
                        <td>
                          <UiSelect
                            className="wizard-frequency-select"
                            label={`Expected positive frequency for marker ${index + 1}`}
                            hideLabel
                            value={marker.frequency}
                            options={FREQUENCY_OPTIONS}
                            onChange={(value) => updateMarker(marker.id, { frequency: value as MarkerFrequency })}
                            portalMenu
                            menuClassName="wizard-frequency-select-menu"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'coexpression' && (
            <div className="wizard-step coexpression-step">
              <div className="wizard-step-toolbar coexpression-toolbar">
                <div className="coexpression-legend" aria-label="Co-expression legend">
                  <span><i className="level-0" /> None</span>
                  <span><i className="level-1" /> Low</span>
                  <span><i className="level-2" /> Medium</span>
                  <span><i className="level-3" /> High</span>
                  <span><i className="level-4" /> Very high</span>
                </div>
                <div className="wizard-toolbar-actions">
                  <button
                    type="button"
                    className="wizard-tool-button"
                    onClick={() => setDialog('coexpression')}
                  >
                    <WandSparkles size={15} />
                    Auto-fill
                  </button>
                  {panelSizeControl}
                </div>
              </div>

              <div className="coexpression-matrix-wrap">
                <table className="coexpression-matrix">
                  <thead>
                    <tr>
                      <th>Marker</th>
                      {markers.map((marker) => (
                        <th className="matrix-column-marker" key={marker.id} title={marker.name || 'Unnamed marker'}>
                          <span>{marker.name || '—'}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {markers.map((left, rowIndex) => (
                      <tr key={left.id}>
                        <th>{left.name || '—'}</th>
                        {markers.map((right, columnIndex) => {
                          if (rowIndex === columnIndex) return <td key={right.id} className="matrix-diagonal">—</td>
                          if (columnIndex < rowIndex) return <td key={right.id} className="matrix-hidden" aria-hidden="true" />
                          const level = coexpression[coexpressionKey(left.id, right.id)] ?? 2
                          const leftLabel = left.name.trim() || `Marker ${rowIndex + 1}`
                          const rightLabel = right.name.trim() || `Marker ${columnIndex + 1}`
                          return (
                            <td key={right.id}>
                              <button
                                type="button"
                                className={`coexpression-cell level-${level}`}
                                onClick={() => cycleCoexpression(left, right)}
                                aria-label={`${leftLabel} and ${rightLabel} co-expression: ${COEXPRESSION_LABELS[level]}`}
                                title={`${leftLabel} × ${rightLabel}: ${COEXPRESSION_LABELS[level]}`}
                              >
                                {COEXPRESSION_SHORT_LABELS[level]}
                              </button>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'recommendations' && (
            <div className="wizard-step recommendations-step">
              {!results && (
                <div className="calculation-gate">
                  <button type="button" className="wizard-calculate" onClick={() => void calculate()} disabled={calculating}>
                    {calculating
                      ? <><LoaderCircle className="spin" size={18} /> Calculating panels…</>
                      : <><Sparkles size={18} /> Calculate recommendations</>}
                  </button>
                </div>
              )}

              {results && activeResult && (
                <>
                  <div className="result-toolbar">
                    <div className="result-mode" role="group" aria-label="Recommendation mode">
                      <button
                        type="button"
                        className={resultMode === 'recommended' ? 'active' : ''}
                        onClick={() => setResultMode('recommended')}
                      >
                        Recommended
                      </button>
                      <button
                        type="button"
                        className={resultMode === 'bestFit' ? 'active' : ''}
                        onClick={() => setResultMode('bestFit')}
                      >
                        Best spectral fit
                      </button>
                    </div>
                    <UiSelect
                      className="wizard-sort"
                      label="Sort ranked colors"
                      hideLabel
                      value={resultSort}
                      options={SORT_OPTIONS}
                      onChange={(value) => setResultSort(value as WizardResultSort)}
                      portalMenu
                      menuClassName="wizard-sort-menu"
                    />
                  </div>

                  <div className="result-summary">
                    <div>
                      <span>Complexity</span>
                      <strong>{formatMetric(activeResult.previousComplexity)} <ChevronRight size={15} /> {formatMetric(activeResult.complexity)}</strong>
                    </div>
                    <div>
                      <span>Worst similarity</span>
                      <strong>{formatMetric(activeResult.maxSimilarity)}</strong>
                    </div>
                  </div>

                  <div className="recommendation-table-wrap">
                    <table className="recommendation-table primary-recommendation-table">
                      <thead>
                        <tr>
                          <th>Marker → color</th>
                          <th>Brightness</th>
                          <th>
                            <span className="table-heading-with-info">
                              Score
                              <span className="table-info">
                                <button type="button" aria-label="How recommendation score is calculated">
                                  <Info size={12} />
                                </button>
                                <span role="tooltip">
                                  After complexity guardrails, availability is weighted most strongly. Spectral fit and any available brightness match refine the score.
                                </span>
                              </span>
                            </span>
                          </th>
                          <th>Closest conflict</th>
                          <th>Δ complexity</th>
                          <th>Availability</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedRows.map((row) => (
                          <tr
                            key={`${row.markerId}-${row.fluorophore}`}
                            className={row.isExisting ? 'is-existing' : undefined}
                          >
                            <td>
                              <div className="marker-color-pair">
                                <strong>{row.markerName || '—'}</strong>
                                <ArrowRight size={15} aria-hidden="true" />
                                <strong>{row.fluorophore}</strong>
                              </div>
                            </td>
                            <td><BrightnessIndicator level={row.brightnessLevel} /></td>
                            <td className="recommendation-score">{row.recommendedScore}</td>
                            <td>
                              <div className="conflict-pair">
                                <strong>{row.closestFluorophore || 'None'}</strong>
                                <ArrowRight size={14} aria-hidden="true" />
                                <span>{formatMetric(row.maxSimilarity)}</span>
                              </div>
                            </td>
                            <td className={row.complexityDelta > 0.1 ? 'metric-warning' : ''}>
                              {row.complexityDelta >= 0 ? '+' : ''}{formatMetric(row.complexityDelta)}
                            </td>
                            <td>
                              <strong>{row.availabilityTier}</strong>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <details className="wizard-alternatives">
                    <summary>Other fluorophores <span>{activeResult.alternatives.length}</span></summary>
                    <div className="alternative-table-wrap">
                      <table className="recommendation-table alternative-table">
                        <thead>
                          <tr>
                            <th>Marker → color</th>
                            <th>Brightness</th>
                            <th>
                              <span className="table-heading-with-info">
                                Score
                                <span className="table-info">
                                  <button type="button" aria-label="How alternative score is calculated">
                                    <Info size={12} />
                                  </button>
                                  <span role="tooltip">
                                    After complexity guardrails, availability is weighted most strongly. Spectral fit and any available brightness match refine the score.
                                  </span>
                                </span>
                              </span>
                            </th>
                            <th>Closest conflict</th>
                            <th>Δ complexity</th>
                            <th>Availability</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activeResult.alternatives.map((alternative) => (
                            <tr key={alternative.fluorophore}>
                              <td>
                                <strong className="alternative-color">{alternative.fluorophore}</strong>
                              </td>
                              <td><BrightnessIndicator level={alternative.brightnessLevel} /></td>
                              <td className="recommendation-score">{alternative.recommendedScore}</td>
                              <td>
                                <div className="conflict-pair">
                                  <strong>{alternative.closestFluorophore || 'None'}</strong>
                                  <ArrowRight size={14} aria-hidden="true" />
                                  <span>{formatMetric(alternative.maxSimilarity)}</span>
                                </div>
                              </td>
                              <td className={alternative.complexityDelta > 0.1 ? 'metric-warning' : ''}>
                                {alternative.complexityDelta >= 0 ? '+' : ''}{formatMetric(alternative.complexityDelta)}
                              </td>
                              <td>
                                <strong>{alternative.availabilityTier}</strong>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>

                  <div className="wizard-result-footer">
                    <div>
                      <button type="button" className="wizard-secondary" onClick={() => void calculate()}>
                        Recalculate
                      </button>
                      <button type="button" className="wizard-primary" onClick={() => void applyRecommendations()} disabled={applying}>
                        {applying ? 'Applying…' : `Apply ${desiredSize}-color panel`}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {error && <div className="wizard-error" role="alert">{error}</div>}
        </main>

        {dialog === 'coexpression' && (
          <div className="wizard-subdialog-backdrop" role="presentation">
            <section className="wizard-subdialog" role="dialog" aria-modal="true" aria-labelledby="coexpression-autofill-title">
              <header>
                <div>
                  <h3 id="coexpression-autofill-title">Auto-fill co-expression</h3>
                </div>
                <button type="button" onClick={() => setDialog(null)} aria-label="Close"><X size={17} /></button>
              </header>
              <div className="wizard-subdialog-fields">
                <UiSelect
                  className="wizard-context-select"
                  label="Species"
                  value={coexpressionContext.species}
                  options={SPECIES_OPTIONS}
                  onChange={(value) => setCoexpressionContext((current) => ({ ...current, species: value as CoexpressionContext['species'] }))}
                />
                <UiSelect
                  className="wizard-context-select"
                  label="Tissue"
                  value={coexpressionContext.tissue}
                  options={TISSUE_OPTIONS}
                  onChange={(value) => setCoexpressionContext((current) => ({ ...current, tissue: value as CoexpressionContext['tissue'] }))}
                />
                <UiSelect
                  className="wizard-context-select"
                  label="Population"
                  value={coexpressionContext.population}
                  options={POPULATION_OPTIONS}
                  onChange={(value) => setCoexpressionContext((current) => ({ ...current, population: value as CoexpressionContext['population'] }))}
                />
                <UiSelect
                  className="wizard-context-select"
                  label="Condition"
                  value={coexpressionContext.condition}
                  options={CONDITION_OPTIONS}
                  onChange={(value) => setCoexpressionContext((current) => ({ ...current, condition: value as CoexpressionContext['condition'] }))}
                />
              </div>
              <footer>
                <button type="button" className="wizard-primary" onClick={autoFillCoexpression}>
                  Fill matrix
                </button>
              </footer>
            </section>
          </div>
        )}

        {dialog === 'templates' && (
          <div className="wizard-subdialog-backdrop" role="presentation">
            <section
              className={`wizard-subdialog wizard-template-dialog${templatePreview ? ' is-preview' : ''}`}
              role="dialog"
              aria-modal="true"
              aria-labelledby="omip-template-title"
            >
              <header>
                <div className="wizard-template-heading">
                  {templatePreview && (
                    <button
                      type="button"
                      className="wizard-template-back"
                      onClick={() => setTemplatePreview(null)}
                      aria-label="Back to OMIP templates"
                    >
                      <ArrowLeft size={16} />
                    </button>
                  )}
                  <h3 id="omip-template-title">{templatePreview?.name ?? 'OMIP templates'}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setTemplatePreview(null)
                    setDialog(null)
                  }}
                  aria-label="Close"
                >
                  <X size={17} />
                </button>
              </header>
              {templatePreview ? (
                <>
                  <div className="wizard-template-preview">
                    <div className="wizard-template-overview">
                      <div>
                        <p>{templatePreview.summary}</p>
                        <div className="wizard-template-links">
                          <a href={OMIP_DATABASE_URL} target="_blank" rel="noreferrer">
                            Open OMIP database
                            <ExternalLink size={14} aria-hidden="true" />
                          </a>
                          <a href={templatePreview.sourceUrl} target="_blank" rel="noreferrer">
                            View paper
                            <ExternalLink size={14} aria-hidden="true" />
                          </a>
                        </div>
                      </div>
                      <dl>
                        <div>
                          <dt>Markers</dt>
                          <dd>{templatePreview.markers.length}</dd>
                        </div>
                        <div>
                          <dt>Species</dt>
                          <dd>{SPECIES_OPTIONS.find((option) => option.value === templatePreview.context.species)?.label}</dd>
                        </div>
                        <div>
                          <dt>Tissue</dt>
                          <dd>{TISSUE_OPTIONS.find((option) => option.value === templatePreview.context.tissue)?.label}</dd>
                        </div>
                        <div>
                          <dt>Population</dt>
                          <dd>{POPULATION_OPTIONS.find((option) => option.value === templatePreview.context.population)?.label}</dd>
                        </div>
                        <div>
                          <dt>Condition</dt>
                          <dd>{CONDITION_OPTIONS.find((option) => option.value === templatePreview.context.condition)?.label}</dd>
                        </div>
                      </dl>
                    </div>
                    <div className="wizard-template-table-wrap">
                      <table className="wizard-template-table">
                        <thead>
                          <tr>
                            <th>Marker</th>
                            <th>Color</th>
                            <th>Cell type</th>
                            <th>Frequency</th>
                          </tr>
                        </thead>
                        <tbody>
                          {templatePreview.markers.map((marker, index) => (
                            <tr key={`${marker.name}-${index}`}>
                              <td><strong>{marker.name}</strong></td>
                              <td>{marker.fluorophore || 'Auto-select'}</td>
                              <td>{marker.cellType || '—'}</td>
                              <td>{marker.frequency ? marker.frequency.replace(/^\w/, (letter) => letter.toLocaleUpperCase()) : 'Medium'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <footer className="wizard-template-footer">
                    <span>
                      {templatePreview.markers.length > maxPanelSize
                        ? `${templatePreview.markers.length} markers exceed this ${maxPanelSize}-slot workspace`
                        : `${templatePreview.markers.length} markers`}
                    </span>
                    <button
                      type="button"
                      className="wizard-primary"
                      onClick={() => applyTemplate(templatePreview)}
                      disabled={templatePreview.markers.length > maxPanelSize}
                    >
                      Use template
                    </button>
                  </footer>
                </>
              ) : (
                <div className="wizard-template-list">
                  {OMIP_TEMPLATES.map((template) => (
                    <button
                      type="button"
                      key={template.id}
                      onClick={() => setTemplatePreview(template)}
                      aria-label={`Preview ${template.name}`}
                    >
                      <span className="wizard-template-name">
                        <strong>{template.name}</strong>
                        <small>{template.markers.length} markers</small>
                      </span>
                      <span>{template.summary}</span>
                      <ChevronRight size={17} />
                    </button>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </section>
    </div>
  )
}
