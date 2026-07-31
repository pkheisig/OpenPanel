import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  ChevronRight,
  ExternalLink,
  Search,
  X,
} from 'lucide-react'
import { UiSelect } from './UiSelect'
import {
  OMIP_CATALOG,
  OMIP_DATABASE_URL,
  omipTemplateAssignmentsForPanel,
} from './panelWizardKnowledge'
import type {
  OmipCatalogEntry,
  OmipTemplate,
} from './panelWizardKnowledge'
import './OmipLibrary.css'

type OmipLibraryProps = {
  theme: 'light' | 'dark'
  onClose: () => void
  onApplyTemplate?: (template: OmipTemplate) => void
  availableFluorophores?: readonly string[]
  maxPanelSize?: number
  actionLabel?: string
  actionDisabled?: boolean
  activeCytometerLabel?: string
  activeConfigurationLabel?: string
  canUseRecommendedConfiguration?: (entry: OmipCatalogEntry) => boolean
  onUseRecommendedConfiguration?: (template: OmipTemplate, entry: OmipCatalogEntry) => void
}

const SPECIES_OPTIONS = [
  { value: 'all', label: 'All species' },
  { value: 'human', label: 'Human' },
  { value: 'mouse', label: 'Mouse' },
  { value: 'non-human-primate', label: 'Non-human primate' },
  { value: 'other', label: 'Other species' },
]

const YEAR_OPTIONS = [
  { value: 'all', label: 'All years' },
  ...Array.from(new Set(OMIP_CATALOG.map((entry) => entry.year)))
    .sort((left, right) => Number(right) - Number(left))
    .map((year) => ({ value: year, label: year })),
]

const CELL_TYPE_OPTIONS = [
  { value: 'all', label: 'All cell types' },
  ...Array.from(new Set(OMIP_CATALOG.flatMap((entry) => entry.cellTypes)))
    .sort((left, right) => left.localeCompare(right))
    .map((cellType) => ({ value: cellType, label: cellType })),
]

const SPECIES_LABELS: Record<OmipCatalogEntry['species'], string> = {
  human: 'Human',
  mouse: 'Mouse',
  'non-human-primate': 'Non-human primate',
  other: 'Other',
}

function normalizedInstrumentFamily(value: string): string {
  const normalized = value.toLocaleLowerCase()
  if (normalized.includes('northern lights')) return 'northern-lights'
  if (normalized.includes('aurora')) return 'aurora'
  if (normalized.includes('id7000')) return 'id7000'
  if (normalized.includes('facsdiscover')) return 'facsdiscover'
  if (normalized.includes('facsymphony')) return 'facsymphony'
  if (normalized.includes('xenith')) return 'xenith'
  return normalized.replace(/[^a-z0-9]+/g, '-')
}

function reportedConfigurationMatches(value: string, activeConfigurationLabel: string): boolean {
  const reportedLasers = value.match(/\b([34567])l\b/i)?.[1]
  if (!reportedLasers) return true
  return new RegExp(`\\b${reportedLasers}l\\b`, 'i').test(activeConfigurationLabel)
}

export function OmipLibrary({
  theme,
  onClose,
  onApplyTemplate,
  availableFluorophores,
  maxPanelSize,
  actionLabel = 'Apply to panel',
  actionDisabled = false,
  activeCytometerLabel,
  activeConfigurationLabel = '',
  canUseRecommendedConfiguration,
  onUseRecommendedConfiguration,
}: OmipLibraryProps) {
  const [preview, setPreview] = useState<OmipCatalogEntry | null>(null)
  const [query, setQuery] = useState('')
  const [species, setSpecies] = useState('all')
  const [year, setYear] = useState('all')
  const [cellType, setCellType] = useState('all')
  const [pendingIncompatibleEntry, setPendingIncompatibleEntry] = useState<OmipCatalogEntry | null>(null)

  const visibleEntries = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    return OMIP_CATALOG.filter((entry) => (
      (species === 'all' || entry.species === species)
      && (year === 'all' || entry.year === year)
      && (cellType === 'all' || entry.cellTypes.includes(cellType))
      && (
        !normalizedQuery
        || [
          entry.name,
          entry.summary,
          entry.year,
          entry.species,
          ...entry.cytometers,
          ...entry.cellTypes,
          ...(entry.template?.markers.flatMap((marker) => [
            marker.name,
            marker.fluorophore ?? '',
          ]) ?? []),
        ].join(' ').toLocaleLowerCase().includes(normalizedQuery)
      )
    ))
  }, [cellType, query, species, year])

  const filtersActive = Boolean(
    query.trim()
    || species !== 'all'
    || year !== 'all'
    || cellType !== 'all',
  )

  const clearFilters = () => {
    setQuery('')
    setSpecies('all')
    setYear('all')
    setCellType('all')
  }

  const exceedsWorkspace = Boolean(
    preview?.template
    && maxPanelSize !== undefined
    && preview.template.markers.length > maxPanelSize,
  )
  const incompatibleWithWorkspace = Boolean(
    preview?.template
    && availableFluorophores
    && !exceedsWorkspace
    && !omipTemplateAssignmentsForPanel(
      preview.template,
      availableFluorophores,
      maxPanelSize,
    )
  )
  const designedForActiveCytometer = Boolean(
    !activeCytometerLabel
    || preview?.cytometers.some((reportedCytometer) => (
      normalizedInstrumentFamily(reportedCytometer) === normalizedInstrumentFamily(activeCytometerLabel)
      && reportedConfigurationMatches(reportedCytometer, activeConfigurationLabel)
    ))
  )
  const requiresCompatibilityWarning = Boolean(
    preview?.template
    && (!designedForActiveCytometer || incompatibleWithWorkspace || exceedsWorkspace)
  )

  const applyPreview = () => {
    if (!preview?.template || !onApplyTemplate) return
    if (requiresCompatibilityWarning) {
      setPendingIncompatibleEntry(preview)
      return
    }
    onApplyTemplate(preview.template)
  }

  return (
    <div
      className={`omip-library-backdrop ${theme}`}
      role="presentation"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        className={`omip-library-window${preview ? ' is-preview' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="omip-library-title"
      >
        <header>
          <div className="omip-library-heading">
            {preview && (
              <button
                type="button"
                className="omip-library-back"
                onClick={() => setPreview(null)}
                aria-label="Back to OMIP Library"
              >
                <ArrowLeft size={17} />
              </button>
            )}
            <div>
              <h2 id="omip-library-title">{preview?.name ?? 'OMIP Library'}</h2>
              {!preview && <p>Browse published optimized cytometry panels.</p>}
            </div>
          </div>
          <button type="button" className="omip-library-close" onClick={onClose} aria-label="Close OMIP Library">
            <X size={18} />
          </button>
        </header>

        {preview ? (
          <>
            <div className="omip-library-preview">
              <div className="omip-library-overview">
                <div>
                  <p>{preview.summary}</p>
                  <a href={preview.sourceUrl} target="_blank" rel="noreferrer">
                    View paper
                    <ExternalLink size={14} aria-hidden="true" />
                  </a>
                </div>
                <dl>
                  <div className="omip-library-cytometer-card">
                    <dt>Cytometer</dt>
                    <dd title={preview.cytometers.join(' / ')}>{preview.cytometers.join(' / ')}</dd>
                  </div>
                  <div>
                    <dt>Published</dt>
                    <dd>{preview.year}</dd>
                  </div>
                  <div>
                    <dt>Species</dt>
                    <dd>{SPECIES_LABELS[preview.species]}</dd>
                  </div>
                  <div>
                    <dt>Markers</dt>
                    <dd>{preview.template?.markers.length ?? '—'}</dd>
                  </div>
                  <div>
                    <dt>Cell types</dt>
                    <dd title={preview.cellTypes.join(', ')}>{preview.cellTypes.join(', ')}</dd>
                  </div>
                </dl>
              </div>

              {preview.template && (
                <div className="omip-library-table-wrap">
                  <table className="omip-library-table">
                    <thead>
                      <tr>
                        <th>Marker</th>
                        <th>Color</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.template.markers.map((marker, index) => (
                        <tr key={`${marker.name}-${index}`}>
                          <td><strong>{marker.name}</strong></td>
                          <td>{marker.fluorophore || 'Auto-select'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <footer>
              <span>
                {exceedsWorkspace
                  ? `${preview.template?.markers.length} markers exceed this ${maxPanelSize}-slot workspace`
                  : !designedForActiveCytometer
                    ? `Designed for ${preview.cytometers.join(' / ')}`
                    : incompatibleWithWorkspace
                      ? 'Some published colors are unavailable in the active configuration'
                    : `${preview.template?.markers.length ?? 0} markers`}
              </span>
              {onApplyTemplate && preview.template && (
                <button
                  type="button"
                  className="omip-library-primary"
                  onClick={applyPreview}
                  disabled={actionDisabled}
                >
                  {actionLabel}
                </button>
              )}
            </footer>
          </>
        ) : (
          <>
            <div className="omip-library-tools">
              <div className="omip-library-search">
                <Search size={16} aria-hidden="true" />
                <input
                  type="search"
                  aria-label="Search OMIP Library"
                  placeholder="Search OMIP number, title, marker, color, or cell type"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
              <a href={OMIP_DATABASE_URL} target="_blank" rel="noreferrer">
                Browse database
                <ExternalLink size={13} aria-hidden="true" />
              </a>
            </div>

            <div className="omip-library-filters">
              <UiSelect
                className="omip-library-filter"
                label="Species"
                value={species}
                options={SPECIES_OPTIONS}
                onChange={setSpecies}
                portalMenu
                menuClassName="omip-library-filter-menu"
              />
              <UiSelect
                className="omip-library-filter"
                label="Cell type"
                value={cellType}
                options={CELL_TYPE_OPTIONS}
                onChange={setCellType}
                portalMenu
                menuClassName="omip-library-filter-menu"
              />
              <UiSelect
                className="omip-library-filter"
                label="Year"
                value={year}
                options={YEAR_OPTIONS}
                onChange={setYear}
                portalMenu
                menuClassName="omip-library-filter-menu"
              />
              {filtersActive && (
                <button type="button" className="omip-library-clear" onClick={clearFilters}>
                  Clear
                </button>
              )}
            </div>

            <div className="omip-library-list">
              {visibleEntries.map((entry) => (
                <button
                  type="button"
                  key={entry.id}
                  onClick={() => setPreview(entry)}
                  aria-label={`Preview ${entry.name}`}
                >
                  <span className="omip-library-entry-name">
                    <strong>{entry.name}</strong>
                    <small>{entry.year}</small>
                    <small className="omip-library-entry-cytometer">{entry.cytometers.join(' / ')}</small>
                  </span>
                  <span>{entry.summary}</span>
                  <ChevronRight size={18} />
                </button>
              ))}
              {visibleEntries.length === 0 && <p className="omip-library-empty">No matching OMIP panels.</p>}
            </div>
          </>
        )}

        {pendingIncompatibleEntry?.template && (
          <div
            className="omip-compatibility-backdrop"
            role="presentation"
            onPointerDown={(event) => {
              if (event.target === event.currentTarget) setPendingIncompatibleEntry(null)
            }}
          >
            <section
              className="omip-compatibility-confirm"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="omip-compatibility-title"
              aria-describedby="omip-compatibility-description"
            >
              <AlertTriangle size={24} aria-hidden="true" />
              <h3 id="omip-compatibility-title">Warning</h3>
              <div id="omip-compatibility-description" className="omip-compatibility-message">
                <p>{pendingIncompatibleEntry.name} was designed for {pendingIncompatibleEntry.cytometers.join(' / ')}.</p>
                {activeCytometerLabel && (
                  <p>The selected setup uses {activeCytometerLabel}{activeConfigurationLabel ? ` · ${activeConfigurationLabel}` : ''}.</p>
                )}
                <p>The panel may therefore not perform as intended. Unsupported colors will remain unassigned.</p>
                <strong>Proceed anyway?</strong>
              </div>
              <div className="omip-compatibility-actions">
                <button type="button" className="omip-compatibility-cancel" onClick={() => setPendingIncompatibleEntry(null)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="omip-compatibility-current"
                  onClick={() => {
                    const template = pendingIncompatibleEntry.template
                    setPendingIncompatibleEntry(null)
                    if (template) onApplyTemplate?.(template)
                  }}
                >
                  Use current config
                </button>
                <button
                  type="button"
                  className="omip-compatibility-recommended"
                  disabled={!canUseRecommendedConfiguration?.(pendingIncompatibleEntry)}
                  title={canUseRecommendedConfiguration?.(pendingIncompatibleEntry)
                    ? undefined
                    : 'This configuration is not available in OpenPanel'}
                  onClick={() => {
                    const template = pendingIncompatibleEntry.template
                    const entry = pendingIncompatibleEntry
                    setPendingIncompatibleEntry(null)
                    if (template) onUseRecommendedConfiguration?.(template, entry)
                  }}
                >
                  Use recommended config
                </button>
              </div>
            </section>
          </div>
        )}
      </section>
    </div>
  )
}
