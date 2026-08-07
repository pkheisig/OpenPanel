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
} from './spectralEngine'
import type { PanelPayload } from './panelBuilderShared'
import { writeLocalStorage } from './browserStorage'
import {
  omipTemplateAssignmentsForPanel,
  omipTemplateAssignmentsForPanelBestEffort,
} from './panelWizardKnowledge'
import type { OmipCatalogEntry, OmipTemplate } from './panelWizardKnowledge'
import type { StoredPanelProject } from './projectStore'
import { UiSelect } from './UiSelect'
import { OmipLibrary } from './OmipLibrary'
import { readThemePreference, saveThemePreference } from './themePreference'
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

type ProjectOrder = 'created-desc' | 'created-asc' | 'updated-desc' | 'name-asc'

const projectOrderOptions = [
  { value: 'created-desc', label: 'Newest created' },
  { value: 'created-asc', label: 'Oldest created' },
  { value: 'updated-desc', label: 'Recently edited' },
  { value: 'name-asc', label: 'Name A–Z' },
] satisfies Array<{ value: ProjectOrder; label: string }>

function sortPanelProjects(panels: StoredPanelProject[], order: ProjectOrder): StoredPanelProject[] {
  return [...panels].sort((left, right) => {
    if (order === 'created-asc') {
      return left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id)
    }
    if (order === 'updated-desc') {
      return right.updatedAt.localeCompare(left.updatedAt)
        || right.createdAt.localeCompare(left.createdAt)
        || left.id.localeCompare(right.id)
    }
    if (order === 'name-asc') {
      return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' })
        || right.createdAt.localeCompare(left.createdAt)
        || left.id.localeCompare(right.id)
    }
    return right.createdAt.localeCompare(left.createdAt)
      || right.updatedAt.localeCompare(left.updatedAt)
      || left.id.localeCompare(right.id)
  })
}

function formatUpdatedAt(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

type InstrumentSetup = {
  cytometer: string
  configuration: string
}

function recommendedSetupForOmip(entry: OmipCatalogEntry): InstrumentSetup | null {
  for (const reported of entry.cytometers) {
    const normalized = reported.toLocaleLowerCase()
    let setup: InstrumentSetup | null = null

    if (normalized.includes('aurora') && !normalized.includes('northern lights')) {
      const configuration = normalized.includes('5l')
        ? '5l_uv_v_b_yg_r'
        : normalized.includes('4l') && normalized.includes('yg')
          ? '4l_v_b_yg_r'
          : normalized.includes('4l')
            ? '4l_uv_v_b_r'
            : normalized.includes('3l')
              ? '3l_v_b_r'
              : null
      if (configuration) setup = { cytometer: 'aurora', configuration }
    } else if (normalized.includes('id7000') && !normalized.includes('7l')) {
      const configuration = normalized.includes('4l')
        ? 'id7000_4l'
        : normalized.includes('3l')
          ? 'id7000_3l'
          : 'id7000_5l'
      setup = { cytometer: 'id7000', configuration }
    } else if (normalized.includes('facsdiscover')) {
      setup = {
        cytometer: 'discover',
        configuration: normalized.includes('a8') ? 'discover_a8' : 'discover_s8',
      }
    } else if (normalized.includes('xenith')) {
      setup = { cytometer: 'xenith', configuration: 'full' }
    } else if (normalized.includes('facsymphony') || normalized.includes('a5se')) {
      setup = { cytometer: 'symphony', configuration: 'symphony_a5se' }
    } else if (normalized.includes('fortessa')) {
      setup = {
        cytometer: 'fortessa',
        configuration: normalized.includes('4l') ? 'fortessa_4l' : 'fortessa_3l',
      }
    } else if (normalized.includes('facscelesta') || normalized.includes('celesta')) {
      const configuration = normalized.includes('bvuv')
        ? 'celesta_bvuv'
        : normalized.includes('bvyg')
          ? 'celesta_bvyg'
          : normalized.includes('bvr')
            ? 'celesta_bvr'
            : 'celesta_bv'
      setup = { cytometer: 'celesta', configuration }
    } else if (normalized.includes('attunenxt') || normalized.includes('attune nxt')) {
      setup = { cytometer: 'attune_nxt', configuration: 'attune_nxt_4l' }
    } else if (normalized.includes('facs canto') || normalized.includes('facscanto') || normalized.includes('canto ii')) {
      const configuration = normalized.includes('3l')
        ? 'canto_3l_4_2_2'
        : normalized.includes('5-3') || normalized.includes('5 3')
          ? 'canto_2l_5_3'
          : 'canto_2l_4_2'
      setup = { cytometer: 'canto', configuration }
    } else if (normalized.includes('facslyric') || normalized.includes('facs lyric')) {
      const configuration = normalized.includes('12')
        ? 'lyric_3l_12'
        : normalized.includes('10')
          ? 'lyric_3l_10'
          : normalized.includes('8')
            ? 'lyric_3l_8'
            : normalized.includes('6')
              ? 'lyric_2l_6'
              : 'lyric_2l_4'
      setup = { cytometer: 'lyric', configuration }
    } else if (normalized.includes('ze5')) {
      const configuration = normalized.includes('5l')
        ? 'ze5_5l_27'
        : normalized.includes('4l')
          ? 'ze5_4l_24'
          : normalized.includes('20')
            ? 'ze5_3l_20'
            : normalized.includes('option 2') || normalized.includes('option2')
              ? 'ze5_3l_17_option2'
              : 'ze5_3l_17'
      setup = { cytometer: 'ze5', configuration }
    } else if (normalized.includes('cytpix')) {
      const configuration = ['byrv6', 'byrv4', 'brv6x', 'byv4x', 'byrx', 'bv6xx', 'bv4xx', 'brxx', 'byxx']
        .find((candidate) => normalized.includes(candidate))
      setup = { cytometer: 'cytpix', configuration: configuration ? `cytpix_${configuration}` : 'cytpix_byrv6' }
    } else if (normalized.includes('quanteon') || normalized.includes('novocyte')) {
      setup = { cytometer: 'quanteon', configuration: 'quanteon_4025' }
    } else if (normalized.includes('accuri')) {
      setup = { cytometer: 'accuri_c6_plus', configuration: 'accuri_c6_plus_standard' }
    } else if (normalized.includes('facscalibur') || normalized.includes('calibur')) {
      setup = { cytometer: 'facscalibur', configuration: 'facscalibur_2l_4' }
    } else if (normalized.includes('dxflex')) {
      setup = { cytometer: 'dxflex', configuration: 'dxflex_b5_r3_v5' }
    } else if (normalized.includes('macsquant')) {
      const configuration = normalized.includes('16')
        ? 'macsquant_analyzer16'
        : normalized.includes('vyb')
          ? 'macsquant_vyb'
          : 'macsquant_analyzer10'
      setup = { cytometer: 'macsquant', configuration }
    } else if (normalized.includes('facsverse')) {
      const configuration = normalized.includes('3l') || normalized.includes('8-color') || normalized.includes('8 color')
        ? 'facsverse_3l_8'
        : normalized.includes('2l') || normalized.includes('6-color') || normalized.includes('6 color')
          ? 'facsverse_2l_6'
          : 'facsverse_1l_4'
      setup = { cytometer: 'facsverse', configuration }
    } else if (normalized.includes('lsr ii') || normalized.includes('lsrii')) {
      const configuration = normalized.includes('6b-6v-2uv-4r') || normalized.includes('6b6v2uv4r')
        ? 'lsrii_6b_6v_2uv_4r'
        : normalized.includes('6b-6v-2uv-3r') || normalized.includes('6b6v2uv3r')
          ? 'lsrii_6b_6v_2uv_3r'
          : normalized.includes('6b-6v-0uv-4r') || normalized.includes('6b6v0uv4r')
            ? 'lsrii_6b_6v_0uv_4r'
            : normalized.includes('6b-6v-0uv-3r') || normalized.includes('6b6v0uv3r')
              ? 'lsrii_6b_6v_0uv_3r'
              : normalized.includes('6b-2v-2uv-3r') || normalized.includes('6b2v2uv3r')
                ? 'lsrii_6b_2v_2uv_3r'
                : normalized.includes('6b-0v-2uv-3r') || normalized.includes('6b0v2uv3r')
                  ? 'lsrii_6b_0v_2uv_3r'
                  : normalized.includes('6b-2v-0uv-3r') || normalized.includes('6b2v0uv3r')
                    ? 'lsrii_6b_2v_0uv_3r'
                    : 'lsrii_6b_0v_0uv_3r'
      setup = { cytometer: 'lsrii', configuration }
    } else if (normalized.includes('cytoflex lx') || normalized.includes('cytoflex')) {
      setup = { cytometer: 'cytoflex_lx', configuration: 'cytoflex_lx_u3_v5_b3_y5_r3_i0' }
    } else if (normalized.includes('navios')) {
      setup = { cytometer: 'navios', configuration: 'navios_2l_8' }
    } else if (normalized.includes('facsaria fusion') || normalized.includes('aria fusion')) {
      setup = { cytometer: 'facsaria_fusion', configuration: 'facsaria_fusion_buv' }
    }

    if (setup && getSpectralPanelConfigurations(setup.cytometer).some(
      (candidate) => candidate.id === setup.configuration,
    )) return setup
  }

  return null
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
  const libraries = useMemo(
    () => [...getSpectralPanelLibraries()].sort((left, right) => left.label.localeCompare(right.label)),
    [],
  )
  const importInput = useRef<HTMLInputElement>(null)
  const [theme, setTheme] = useState<'light' | 'dark'>(readThemePreference)
  const [panelName, setPanelName] = useState(`Panel ${panels.length + 1}`)
  const [starting, setStarting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [showOmipLibrary, setShowOmipLibrary] = useState(false)
  const [omipPayload, setOmipPayload] = useState<PanelPayload | null>(null)
  const [creatingFromOmip, setCreatingFromOmip] = useState(false)
  const [menu, setMenu] = useState<ProjectMenuState | null>(null)
  const [projectOrder, setProjectOrder] = useState<ProjectOrder>('created-desc')
  const [cytometer, setCytometer] = useState('')
  const configurations = useMemo(
    () => cytometer
      ? [...getSpectralPanelConfigurations(cytometer)].sort(
        (left, right) => left.label.localeCompare(right.label),
      )
      : [],
    [cytometer],
  )
  const [configuration, setConfiguration] = useState('')
  const setupReady = Boolean(cytometer && (cytometer === 'xenith' || cytometer === 'symphony' || configuration))

  const orderedPanels = useMemo(
    () => sortPanelProjects(panels, projectOrder),
    [panels, projectOrder],
  )
  const activePanels = useMemo(
    () => orderedPanels.filter((panel) => !panel.archivedAt),
    [orderedPanels],
  )
  const archivedPanels = useMemo(
    () => orderedPanels.filter((panel) => panel.archivedAt),
    [orderedPanels],
  )

  useEffect(() => {
    saveThemePreference(theme)
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
    if (!showOmipLibrary || !setupReady) return
    let cancelled = false
    void buildPanelPayload(cytometer, configuration).then((nextPayload) => {
      if (!cancelled) setOmipPayload(nextPayload)
    }).catch(() => {
      if (!cancelled) setOmipPayload(null)
    })
    return () => {
      cancelled = true
    }
  }, [configuration, cytometer, setupReady, showOmipLibrary])

  const startPanel = async () => {
    if (!setupReady) return
    setError('')
    writeLocalStorage('spectreasy_cytometer', cytometer)
    writeLocalStorage('spectreasy_configuration', configuration)
    setStarting(true)
    try {
      await onStart({ name: panelName, cytometer, configuration })
    } catch (startError) {
      setError(errorMessage(startError, 'Could not open the panel workspace.'))
    } finally {
      setStarting(false)
    }
  }

  const startPanelFromOmip = async (
    template: OmipTemplate,
    target: InstrumentSetup = { cytometer, configuration },
  ) => {
    setError('')
    setCreatingFromOmip(true)
    try {
      const payload = target.cytometer === cytometer && target.configuration === configuration
        ? omipPayload
        : await buildPanelPayload(target.cytometer, target.configuration)
      if (!payload) return
      const maxPanelSize = payload.max_panel_size
      const availableFluorophores = payload.fluorophores.map((item) => item.fluorophore)
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

      writeLocalStorage('spectreasy_cytometer', target.cytometer)
      writeLocalStorage('spectreasy_configuration', target.configuration)
      await onStart({
        name: template.name,
        cytometer: target.cytometer,
        configuration: target.configuration,
        slots: assignments.map((assignment) => assignment.fluorophore),
        markers: Object.fromEntries(
          assignments.map((assignment, index) => [index, assignment.marker]),
        ),
      })
    } catch (createError) {
      setError(errorMessage(createError, 'Could not create a panel from this OMIP.'))
    } finally {
      setCreatingFromOmip(false)
    }
  }

  const importProject = async (file: File) => {
    setError('')
    setImporting(true)
    try {
      await onImport(file)
    } catch (importError) {
      setError(errorMessage(importError, 'Could not import this OpenPanel project.'))
    } finally {
      setImporting(false)
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
            disabled={importing || starting || creatingFromOmip}
            onClick={() => importInput.current?.click()}
          >
            <Upload size={16} />
            {importing ? 'Importing…' : 'Import project'}
          </button>
          <input
            ref={importInput}
            hidden
            type="file"
            accept=".json,.op,.openpanel,application/json"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0]
              if (file) void importProject(file)
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
        {error && <div className="launch-error" role="alert">{error}</div>}
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
              options={[
                { value: '', label: 'Select cytometer' },
                ...libraries.map((library) => ({ value: library.id, label: library.label })),
              ]}
              onChange={(nextCytometer) => {
                setCytometer(nextCytometer)
                setConfiguration(nextCytometer === 'xenith'
                  ? 'full'
                  : nextCytometer === 'symphony'
                    ? 'symphony_a5se'
                    : nextCytometer === 'fortessa'
                      ? 'fortessa_3l'
                      : nextCytometer === 'celesta'
                        ? 'celesta_bv'
                      : nextCytometer === 'attune_nxt'
                          ? 'attune_nxt_4l'
                          : nextCytometer === 'accuri_c6_plus'
                            ? 'accuri_c6_plus_standard'
                            : nextCytometer === 'facscalibur'
                              ? 'facscalibur_2l_4'
                          : nextCytometer === 'canto'
                            ? 'canto_2l_4_2'
                            : nextCytometer === 'lyric'
                              ? 'lyric_2l_4'
                              : nextCytometer === 'ze5'
                                ? 'ze5_3l_17'
                                : nextCytometer === 'cytpix'
                                  ? 'cytpix_byrv6'
                                  : nextCytometer === 'quanteon'
                                    ? 'quanteon_4025'
                                    : nextCytometer === 'macsquant'
                                      ? 'macsquant_analyzer10'
                                      : nextCytometer === 'facsverse'
                                        ? 'facsverse_3l_8'
                                        : nextCytometer === 'lsrii'
                                          ? 'lsrii_6b_2v_2uv_3r'
                                          : nextCytometer === 'cytoflex_lx'
                                            ? 'cytoflex_lx_u3_v5_b3_y5_r3_i0'
                                              : nextCytometer === 'navios'
                                                ? 'navios_2l_8'
                                                : nextCytometer === 'dxflex'
                                                  ? 'dxflex_b5_r3_v5'
                                              : nextCytometer === 'facsaria_fusion'
                                                ? 'facsaria_fusion_buv'
                                          : '')
              }}
              searchable
              searchPlaceholder="Search cytometers"
              portalMenu
              menuClassName="launch-select-menu"
            />

            {cytometer !== 'xenith' && cytometer !== 'symphony' && (
              <UiSelect
                label="DETECTOR CONFIGURATION"
                value={configuration}
                options={[
                  { value: '', label: 'Select configuration' },
                  ...configurations.map((candidate) => ({
                    value: candidate.id,
                    label: candidate.label,
                  })),
                ]}
                onChange={setConfiguration}
                searchable
                searchPlaceholder="Search configurations"
                portalMenu
                menuClassName="launch-select-menu"
              />
            )}

            <div className="launch-card-actions">
              <button
                className="launch-submit"
                type="submit"
                disabled={!setupReady || starting || creatingFromOmip}
              >
                <span className="launch-submit-icon"><FlaskConical size={18} /></span>
                <span>{starting ? 'Opening…' : 'Build panel'}</span>
                <ArrowRight size={17} />
              </button>
              <button
                className="launch-submit"
                type="button"
                disabled={!setupReady || starting || creatingFromOmip}
                onClick={() => {
                  setOmipPayload(null)
                  setShowOmipLibrary(true)
                }}
              >
                <span className="launch-submit-icon"><BookOpen size={18} /></span>
                <span>Use OMIP</span>
                <ArrowRight size={17} />
              </button>
            </div>
          </form>
        </section>

        <section className="panel-library" aria-labelledby="panel-library-title">
          <div className="panel-library-heading">
            <div className="panel-library-title">
              <h2 id="panel-library-title">Projects</h2>
              <span>{activePanels.length}</span>
            </div>
            <UiSelect
              className="project-order-select"
              label="Order projects"
              hideLabel
              value={projectOrder}
              options={projectOrderOptions}
              onChange={(value) => setProjectOrder(value as ProjectOrder)}
            />
          </div>
          {activePanels.length ? (
            <div className="panel-library-list" aria-label="Projects">
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
        All data and operations stay local on your computer.
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
          maxPanelSize={omipPayload?.max_panel_size}
          activeCytometerLabel={libraries.find((library) => library.id === cytometer)?.label ?? cytometer}
          activeConfigurationLabel={configurations.find((candidate) => candidate.id === configuration)?.label ?? configuration}
          actionLabel={creatingFromOmip ? 'Creating panel…' : 'Create panel from OMIP'}
          actionDisabled={!omipPayload || creatingFromOmip}
          onClose={() => {
            setShowOmipLibrary(false)
            setOmipPayload(null)
          }}
          onApplyTemplate={(template) => void startPanelFromOmip(template)}
          canUseRecommendedConfiguration={(entry) => recommendedSetupForOmip(entry) !== null}
          onUseRecommendedConfiguration={(template, entry) => {
            const recommended = recommendedSetupForOmip(entry)
            if (recommended) void startPanelFromOmip(template, recommended)
          }}
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
