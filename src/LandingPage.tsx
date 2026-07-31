import {
  Archive,
  ArchiveRestore,
  ArrowRight,
  BookOpen,
  ChevronDown,
  Copy,
  Download,
  FlaskConical,
  MoreHorizontal,
  Moon,
  Pencil,
  Sun,
  Trash2,
  Upload,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  buildPanelPayload,
  getSpectralPanelConfigurations,
  getSpectralPanelLibraries,
  resolveConfiguration,
} from './spectralEngine'
import type { PanelPayload } from './panelBuilderShared'
import {
  omipTemplateAssignmentsForPanel,
  omipTemplateAssignmentsForPanelBestEffort,
} from './panelWizardKnowledge'
import type { OmipTemplate } from './panelWizardKnowledge'
import type { StoredPanelProject } from './projectStore'
import { UiSelect } from './UiSelect'
import { OmipLibrary } from './OmipLibrary'
import './LandingPage.css'

export type PanelLaunchSelection = {
  name: string
  cytometer: string
  configuration: string
  slots?: string[]
  markers?: Record<number, string>
}

type LandingPageProps = {
  panels: StoredPanelProject[]
  onStart: (selection: PanelLaunchSelection) => Promise<void>
  onOpen: (panel: StoredPanelProject) => void
  onImport: (file: File) => Promise<void>
  onExport: (panel: StoredPanelProject) => Promise<void>
  onRename: (panel: StoredPanelProject, name: string) => Promise<void>
  onDuplicate: (panel: StoredPanelProject) => Promise<void>
  onArchive: (panel: StoredPanelProject) => Promise<void>
  onRestore: (panel: StoredPanelProject) => Promise<void>
  onDelete: (panel: StoredPanelProject) => Promise<void>
}

type ProjectMenuState = {
  panel: StoredPanelProject
  x: number
  y: number
}

function storedTheme(): 'light' | 'dark' {
  const value = localStorage.getItem('spectreasy-theme') || localStorage.getItem('spectreasy_theme')
  if (value === 'light' || value === 'dark') return value
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function storedCytometer(fallback: string): string {
  const value = localStorage.getItem('spectreasy_cytometer')
  return getSpectralPanelLibraries().some((library) => library.id === value) ? String(value) : fallback
}

function formatUpdatedAt(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export function LandingPage({
  panels,
  onStart,
  onOpen,
  onImport,
  onExport,
  onRename,
  onDuplicate,
  onArchive,
  onRestore,
  onDelete,
}: LandingPageProps) {
  const libraries = useMemo(() => getSpectralPanelLibraries(), [])
  const importInput = useRef<HTMLInputElement>(null)
  const [theme, setTheme] = useState<'light' | 'dark'>(storedTheme)
  const [panelName, setPanelName] = useState(`Panel ${panels.length + 1}`)
  const [starting, setStarting] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [showOmipLibrary, setShowOmipLibrary] = useState(false)
  const [omipPayload, setOmipPayload] = useState<PanelPayload | null>(null)
  const [creatingFromOmip, setCreatingFromOmip] = useState(false)
  const [menu, setMenu] = useState<ProjectMenuState | null>(null)
  const [cytometer, setCytometer] = useState(() => storedCytometer(libraries[0].id))
  const configurations = useMemo(() => getSpectralPanelConfigurations(cytometer), [cytometer])
  const [configuration, setConfiguration] = useState(
    () => resolveConfiguration(cytometer, localStorage.getItem('spectreasy_configuration')),
  )

  const activePanels = useMemo(
    () => panels.filter((panel) => !panel.archivedAt),
    [panels],
  )
  const archivedPanels = useMemo(
    () => panels.filter((panel) => panel.archivedAt),
    [panels],
  )

  useEffect(() => {
    localStorage.setItem('spectreasy-theme', theme)
    localStorage.removeItem('spectreasy_theme')
    document.documentElement.dataset.theme = theme
  }, [theme])

  useEffect(() => {
    const closeMenu = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest('.panel-project-menu')) {
        setMenu(null)
      }
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(null)
    }
    document.addEventListener('pointerdown', closeMenu)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeMenu)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [])

  useEffect(() => {
    if (!showOmipLibrary) return
    let cancelled = false
    void buildPanelPayload(cytometer, configuration).then((nextPayload) => {
      if (!cancelled) setOmipPayload(nextPayload)
    }).catch(() => {
      if (!cancelled) setOmipPayload(null)
    })
    return () => {
      cancelled = true
    }
  }, [configuration, cytometer, showOmipLibrary])

  const startPanel = async () => {
    localStorage.setItem('spectreasy_cytometer', cytometer)
    localStorage.setItem('spectreasy_configuration', configuration)
    setStarting(true)
    try {
      await onStart({ name: panelName, cytometer, configuration })
    } finally {
      setStarting(false)
    }
  }

  const startPanelFromOmip = async (template: OmipTemplate) => {
    if (!omipPayload) return
    const maxPanelSize = Math.min(omipPayload.fluorophores.length, omipPayload.detectors.length)
    const availableFluorophores = omipPayload.fluorophores.map((item) => item.fluorophore)
    const assignments = omipTemplateAssignmentsForPanel(
      template,
      availableFluorophores,
      maxPanelSize,
    ) ?? omipTemplateAssignmentsForPanelBestEffort(
      template,
      availableFluorophores,
      maxPanelSize,
    )
    if (assignments.length === 0) return

    localStorage.setItem('spectreasy_cytometer', cytometer)
    localStorage.setItem('spectreasy_configuration', configuration)
    setCreatingFromOmip(true)
    try {
      await onStart({
        name: template.name,
        cytometer,
        configuration,
        slots: assignments.map((assignment) => assignment.fluorophore),
        markers: Object.fromEntries(
          assignments.map((assignment, index) => [index, assignment.marker]),
        ),
      })
    } finally {
      setCreatingFromOmip(false)
    }
  }

  const cytometerLabel = (id: string) => (
    libraries.find((library) => library.id === id)?.label ?? id
  )

  const configurationLabel = (panel: StoredPanelProject) => (
    getSpectralPanelConfigurations(panel.state.cytometer)
      .find((candidate) => candidate.id === panel.state.configuration)?.label
      ?? panel.state.configuration
  )

  const openMenu = (panel: StoredPanelProject, x: number, y: number) => {
    const width = 190
    const height = panel.archivedAt ? 214 : 214
    setMenu({
      panel,
      x: Math.max(10, Math.min(x, window.innerWidth - width - 10)),
      y: Math.max(10, Math.min(y, window.innerHeight - height - 10)),
    })
  }

  const rename = async (panel: StoredPanelProject) => {
    const name = window.prompt('Panel name', panel.name)?.trim()
    if (name && name !== panel.name) await onRename(panel, name)
  }

  const remove = async (panel: StoredPanelProject) => {
    if (window.confirm(`Delete “${panel.name}”? This cannot be undone.`)) {
      await onDelete(panel)
    }
  }

  return (
    <main className={`launch-screen ${theme}`}>
      <header className="launch-header">
        <a className="launch-brand" href="./" aria-label="OpenPanel home">
          <img src={`${import.meta.env.BASE_URL}favicon-light.svg`} alt="" />
          <span>OpenPanel</span>
        </a>
        <div className="launch-header-actions">
          <button
            type="button"
            className="launch-secondary-button"
            onClick={() => {
              setOmipPayload(null)
              setShowOmipLibrary(true)
            }}
          >
            <BookOpen size={16} />
            Start from OMIP
          </button>
          <button
            type="button"
            className="launch-secondary-button"
            onClick={() => importInput.current?.click()}
          >
            <Upload size={16} />
            Import project
          </button>
          <input
            ref={importInput}
            hidden
            type="file"
            accept=".json,.op,.openpanel,application/json"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0]
              if (file) void onImport(file)
              event.currentTarget.value = ''
            }}
          />
          <button
            type="button"
            className="launch-theme-button"
            onClick={() => setTheme((current) => current === 'light' ? 'dark' : 'light')}
            aria-label={theme === 'light' ? 'Use dark mode' : 'Use light mode'}
            title={theme === 'light' ? 'Use dark mode' : 'Use light mode'}
          >
            {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
          </button>
        </div>
      </header>

      <div className="launch-content">
        <section className="new-panel-section" aria-label="Create panel">
          <form
            className="launch-card"
            onSubmit={(event) => {
              event.preventDefault()
              void startPanel()
            }}
            aria-label="Panel configuration"
          >
            <label className="launch-field launch-name-field">
              <span>PANEL NAME</span>
              <input
                className="launch-name-input"
                value={panelName}
                onChange={(event) => setPanelName(event.target.value)}
                aria-label="Panel name"
                autoComplete="off"
              />
            </label>

            <UiSelect
              label="CYTOMETER"
              value={cytometer}
              options={libraries.map((library) => ({ value: library.id, label: library.label }))}
              onChange={(nextCytometer) => {
                setCytometer(nextCytometer)
                setConfiguration(getSpectralPanelConfigurations(nextCytometer)[0].id)
              }}
              portalMenu
              menuClassName="launch-select-menu"
            />

            {cytometer !== 'xenith' && (
              <UiSelect
                label="DETECTOR CONFIGURATION"
                value={configuration}
                options={configurations.map((candidate) => ({
                  value: candidate.id,
                  label: candidate.label,
                }))}
                onChange={setConfiguration}
                portalMenu
                menuClassName="launch-select-menu"
              />
            )}

            <button className="launch-submit" type="submit" disabled={starting}>
              <span className="launch-submit-icon"><FlaskConical size={18} /></span>
              <span>{starting ? 'Opening…' : 'Build panel'}</span>
              <ArrowRight size={17} />
            </button>
          </form>
        </section>

        <section className="panel-library" aria-labelledby="panel-library-title">
          <div className="panel-library-heading">
            <h2 id="panel-library-title">Projects</h2>
            <span>{activePanels.length}</span>
          </div>
          {activePanels.length ? (
            <div className="panel-library-list" aria-label="Projects, newest edited first">
              {activePanels.map((panel) => (
                <ProjectCard
                  key={panel.id}
                  panel={panel}
                  cytometer={cytometerLabel(panel.state.cytometer)}
                  configuration={configurationLabel(panel)}
                  onOpen={() => onOpen(panel)}
                  onMenu={(x, y) => openMenu(panel, x, y)}
                />
              ))}
            </div>
          ) : (
            <p className="panel-library-empty">No projects yet.</p>
          )}
        </section>

        <section className="archived-section">
          <button
            type="button"
            className="archive-disclosure"
            aria-expanded={archiveOpen}
            aria-controls="archived-panels"
            onClick={() => setArchiveOpen((open) => !open)}
          >
            <ChevronDown size={17} />
            <span>Archived</span>
            <small>{archivedPanels.length}</small>
          </button>
          <div id="archived-panels" className={`archive-panel ${archiveOpen ? 'open' : ''}`}>
            <div className="archive-panel-inner">
              {archivedPanels.length ? (
                <div className="panel-library-list archived-project-list">
                  {archivedPanels.map((panel) => (
                    <ProjectCard
                      key={panel.id}
                      panel={panel}
                      cytometer={cytometerLabel(panel.state.cytometer)}
                      configuration={configurationLabel(panel)}
                      archived
                      onOpen={() => onOpen(panel)}
                      onMenu={(x, y) => openMenu(panel, x, y)}
                    />
                  ))}
                </div>
              ) : (
                <p className="panel-library-empty">No archived projects.</p>
              )}
            </div>
          </div>
        </section>
      </div>

      <footer className="launch-footer">
        Projects stay in this browser unless you export them.
      </footer>

      {menu && (
        <ProjectActionMenu
          state={menu}
          onClose={() => setMenu(null)}
          onRename={() => rename(menu.panel)}
          onExport={() => onExport(menu.panel)}
          onDuplicate={() => onDuplicate(menu.panel)}
          onArchive={() => onArchive(menu.panel)}
          onRestore={() => onRestore(menu.panel)}
          onDelete={() => remove(menu.panel)}
        />
      )}
      {showOmipLibrary && (
        <OmipLibrary
          theme={theme}
          availableFluorophores={omipPayload?.fluorophores.map((item) => item.fluorophore)}
          maxPanelSize={omipPayload
            ? Math.min(omipPayload.fluorophores.length, omipPayload.detectors.length)
            : undefined}
          activeCytometerLabel={libraries.find((library) => library.id === cytometer)?.label ?? cytometer}
          activeConfigurationLabel={configurations.find((candidate) => candidate.id === configuration)?.label ?? configuration}
          actionLabel={creatingFromOmip ? 'Creating panel…' : 'Create panel from OMIP'}
          actionDisabled={!omipPayload || creatingFromOmip}
          compatibilityTitle="Create this panel anyway?"
          compatibilityActionLabel="Create anyway"
          activeWorkspaceDescription="The selected setup uses"
          onClose={() => {
            setShowOmipLibrary(false)
            setOmipPayload(null)
          }}
          onApplyTemplate={(template) => void startPanelFromOmip(template)}
        />
      )}
    </main>
  )
}

function ProjectCard({
  panel,
  cytometer,
  configuration,
  archived = false,
  onOpen,
  onMenu,
}: {
  panel: StoredPanelProject
  cytometer: string
  configuration: string
  archived?: boolean
  onOpen: () => void
  onMenu: (x: number, y: number) => void
}) {
  const colors = panel.state.slots.filter(Boolean).length
  return (
    <article
      className={`panel-library-card ${archived ? 'archived' : ''}`}
      onContextMenu={(event) => {
        event.preventDefault()
        onMenu(event.clientX, event.clientY)
      }}
    >
      <button
        type="button"
        className="panel-project-preview"
        onClick={onOpen}
        aria-label={`Open ${panel.name}`}
      >
        <ProjectSpectrumPreview panel={panel} />
        <span className="panel-preview-count">
          {colors} {colors === 1 ? 'color' : 'colors'}
        </span>
        <span className="panel-preview-accessible-summary">
          {cytometer} {configuration}
        </span>
      </button>
      <div className="panel-library-content">
        <button type="button" className="panel-project-title" onClick={onOpen}>
          <strong>{panel.name}</strong>
          <small>{formatUpdatedAt(panel.updatedAt)}</small>
        </button>
        <button
          type="button"
          className="panel-project-more"
          aria-label={`Project actions for ${panel.name}`}
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect()
            onMenu(rect.right, rect.bottom + 5)
          }}
        >
          <MoreHorizontal size={18} />
        </button>
        <div className="panel-library-summary">
          <span>{cytometer}</span>
          <span>{configuration}</span>
        </div>
      </div>
    </article>
  )
}

function ProjectSpectrumPreview({ panel }: { panel: StoredPanelProject }) {
  const [payload, setPayload] = useState<PanelPayload | null>(null)

  useEffect(() => {
    let cancelled = false
    void buildPanelPayload(
      panel.state.cytometer,
      panel.state.configuration,
      panel.state.slots.filter(Boolean),
    ).then((nextPayload) => {
      if (!cancelled) setPayload(nextPayload)
    }).catch(() => {
      if (!cancelled) setPayload(null)
    })
    return () => {
      cancelled = true
    }
  }, [panel.state.configuration, panel.state.cytometer, panel.state.slots])

  const width = 258
  const height = 146
  const left = 11
  const right = 11
  const top = 34
  const bottom = 13
  const plotWidth = width - left - right
  const plotHeight = height - top - bottom
  const colors = new Map(
    payload?.fluorophores.map((fluorophore) => [
      fluorophore.fluorophore,
      fluorophore.peak_color || '#157e7c',
    ]) ?? [],
  )
  const complexity = payload
    ? payload.complexity_index === null ? '—' : payload.complexity_index.toFixed(2)
    : '…'

  return (
    <>
      <svg
        className="panel-preview-plot"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Saved panel spectrum preview"
      >
        {payload?.spectra.map((row) => {
          const path = payload.detectors.map((detector, index) => {
            const x = left + (index / Math.max(1, payload.detectors.length - 1)) * plotWidth
            const rawValue = row[detector.detector]
            const value = typeof rawValue === 'number' && Number.isFinite(rawValue) ? rawValue : 0
            const y = top + (1 - Math.max(0, Math.min(1, value))) * plotHeight
            return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
          }).join(' ')
          return (
            <path
              key={row.fluorophore}
              d={path}
              fill="none"
              stroke={colors.get(row.fluorophore) ?? '#157e7c'}
              strokeWidth="0.9"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          )
        })}
      </svg>
      <span
        className="panel-preview-complexity"
        aria-label={`Complexity index ${complexity}`}
        title={`Complexity index: ${complexity}`}
      >
        {complexity}
      </span>
    </>
  )
}

function ProjectActionMenu({
  state,
  onClose,
  onRename,
  onExport,
  onDuplicate,
  onArchive,
  onRestore,
  onDelete,
}: {
  state: ProjectMenuState
  onClose: () => void
  onRename: () => void | Promise<void>
  onExport: () => void | Promise<void>
  onDuplicate: () => void | Promise<void>
  onArchive: () => void | Promise<void>
  onRestore: () => void | Promise<void>
  onDelete: () => void | Promise<void>
}) {
  const action = (callback: () => void | Promise<void>) => () => {
    onClose()
    void callback()
  }
  return (
    <div
      className="panel-project-menu"
      role="menu"
      aria-label={`${state.panel.name} actions`}
      style={{ left: state.x, top: state.y }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <button type="button" role="menuitem" onClick={action(onRename)}>
        <Pencil size={14} /> Rename
      </button>
      <button type="button" role="menuitem" onClick={action(onExport)}>
        <Download size={14} /> Export project
      </button>
      <button type="button" role="menuitem" onClick={action(onDuplicate)}>
        <Copy size={14} /> Duplicate
      </button>
      {state.panel.archivedAt ? (
        <button type="button" role="menuitem" onClick={action(onRestore)}>
          <ArchiveRestore size={14} /> Restore
        </button>
      ) : (
        <button type="button" role="menuitem" onClick={action(onArchive)}>
          <Archive size={14} /> Archive
        </button>
      )}
      <button type="button" role="menuitem" className="danger" onClick={action(onDelete)}>
        <Trash2 size={14} /> Delete
      </button>
    </div>
  )
}
