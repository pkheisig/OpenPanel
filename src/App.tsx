import { useEffect, useState } from 'react'
import { LandingPage } from './LandingPage'
import type { PanelLaunchSelection } from './LandingPage'
import PanelBuilder from './PanelBuilder'
import { projectJsonFilename, projectNameFromFilename, readTextFileWithinLimit, saveBlob } from './browserFiles'
import { PanelSelectionValidationError, buildPanelPayload, validateRequestedFluorophores } from './spectralEngine'
import { readLocalStorage, writeLocalStorage } from './browserStorage'
import {
  DEFAULT_PLOT_SCALE,
  PROJECT_RESOURCE_LIMITS,
  archivePanelProject,
  createPanelProject,
  deletePanelProject,
  duplicatePanelProject,
  listPanelProjects,
  loadLastPanelProject,
  parseProject,
  renamePanelProject,
  restorePanelProject,
  serializeProject,
  setActivePanelProject,
} from './projectStore'
import type { ProjectState, StoredPanelProject } from './projectStore'
import { readThemePreference } from './themePreference'

const CURRENT_SURFACE_STORAGE_KEY = 'openpanel.current-surface'

function storedSurface(): 'landing' | 'editor' | null {
  const value = readLocalStorage(CURRENT_SURFACE_STORAGE_KEY)
  return value === 'landing' || value === 'editor' ? value : null
}

function rememberSurface(surface: 'landing' | 'editor'): void {
  writeLocalStorage(CURRENT_SURFACE_STORAGE_KEY, surface)
}

function emptyProject(selection: PanelLaunchSelection): ProjectState {
  const slots = selection.slots ? [...selection.slots] : Array(18).fill('')
  const markers = selection.markers ? { ...selection.markers } : {}
  return {
    cytometer: selection.cytometer,
    configuration: selection.configuration,
    slots,
    markers,
    tab: 'panel',
    theme: readThemePreference(),
    sidebarWidth: 214,
    sidebarCollapsed: false,
    plotScale: DEFAULT_PLOT_SCALE,
    plotScaleMode: 'fit-width',
    wizard: null,
    cytometerPanels: {
      [selection.cytometer]: {
        configuration: selection.configuration,
        slots: [...slots],
        markers: { ...markers },
        wizard: null,
      },
    },
  }
}

export default function App() {
  const [panels, setPanels] = useState<StoredPanelProject[]>([])
  const [activePanel, setActivePanel] = useState<StoredPanelProject | null>(null)
  const [showLanding, setShowLanding] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const restore = async () => {
      const restored = await loadLastPanelProject()
      const storedPanels = await listPanelProjects()
      if (cancelled) return
      const visiblePanels = restored?.loadError && !storedPanels.some((panel) => panel.id === restored.id)
        ? [restored, ...storedPanels]
        : storedPanels
      setActivePanel(restored)
      setPanels(visiblePanels)
      const landing = storedSurface() === 'landing' || restored === null || Boolean(restored?.loadError)
      setShowLanding(landing)
      rememberSurface(landing ? 'landing' : 'editor')
      setLoading(false)
    }
    void restore()
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
    return <div className="app-loading" role="status">Opening your last panel…</div>
  }

  if (showLanding || !activePanel) {
    const refreshPanels = async () => setPanels(await listPanelProjects())
    return (
      <LandingPage
        panels={panels}
        onStart={async (selection) => {
          const panel = await createPanelProject(selection.name, emptyProject(selection))
          setPanels(await listPanelProjects())
          setActivePanel(panel)
          rememberSurface('editor')
          setShowLanding(false)
        }}
        onImport={async (file) => {
          const state = parseProject(await readTextFileWithinLimit(
            file,
            PROJECT_RESOURCE_LIMITS.maxProjectFileBytes,
            'OpenPanel project',
          ))
          const validation = await validateRequestedFluorophores(state.cytometer, state.configuration, state.slots)
          if (validation.diagnostics.length > 0) {
            throw new PanelSelectionValidationError(validation.diagnostics)
          }
          const payload = await buildPanelPayload(
            state.cytometer,
            state.configuration,
            state.slots.filter(Boolean),
            true,
          )
          if (validation.accepted.length > payload.max_panel_size) {
            throw new Error(`This panel has ${validation.accepted.length} colors, but the selected configuration has only ${payload.max_panel_size} detectors.`)
          }
          let acceptedIndex = 0
          const canonicalSlots = state.slots.map((slot) => (
            slot.trim() ? validation.accepted[acceptedIndex++] : ''
          ))
          const canonicalMarkers = Object.fromEntries(
            Object.entries(state.markers).filter(([index]) => canonicalSlots[Number(index)]),
          ) as Record<number, string>
          const activePanel = state.cytometerPanels[state.cytometer]
          const canonicalState: ProjectState = {
            ...state,
            slots: canonicalSlots,
            markers: canonicalMarkers,
            cytometerPanels: {
              ...state.cytometerPanels,
              [state.cytometer]: {
                ...(activePanel ?? { configuration: state.configuration, wizard: state.wizard }),
                configuration: state.configuration,
                slots: canonicalSlots,
                markers: canonicalMarkers,
                wizard: state.wizard,
              },
            },
          }
          const panel = await createPanelProject(
            projectNameFromFilename(file.name),
            canonicalState,
          )
          await refreshPanels()
          setActivePanel(panel)
          rememberSurface('editor')
          setShowLanding(false)
        }}
        onExport={async (panel) => {
          if (panel.loadError) {
            throw new Error(`Cannot export '${panel.name}' until its saved state is recovered or deleted.`)
          }
          await saveBlob(new Blob([serializeProject(panel.state)], { type: 'application/json' }), {
            suggestedName: projectJsonFilename(panel.name),
            description: 'OpenPanel project',
            mimeType: 'application/json',
            extensions: ['.json'],
          })
        }}
        onRename={async (panel, name) => {
          const renamed = await renamePanelProject(panel.id, name)
          if (renamed && activePanel?.id === renamed.id) setActivePanel(renamed)
          await refreshPanels()
        }}
        onDuplicate={async (panel) => {
          await duplicatePanelProject(panel.id)
          await refreshPanels()
        }}
        onArchive={async (panel) => {
          await archivePanelProject(panel.id)
          if (activePanel?.id === panel.id) setActivePanel(null)
          await refreshPanels()
        }}
        onRestore={async (panel) => {
          await restorePanelProject(panel.id)
          await refreshPanels()
        }}
        onDelete={async (panel) => {
          await deletePanelProject(panel.id)
          if (activePanel?.id === panel.id) setActivePanel(null)
          await refreshPanels()
        }}
        onOpen={(panel) => {
          if (panel.loadError) return
          setActivePanelProject(panel.id)
          setActivePanel(panel)
          rememberSurface('editor')
          setShowLanding(false)
        }}
      />
    )
  }

  return (
    <PanelBuilder
      key={activePanel.id}
      projectId={activePanel.id}
      projectName={activePanel.name}
      initialProject={activePanel.state}
      initialError={activePanel.loadError}
      onRequestExit={async () => {
        rememberSurface('landing')
        setPanels(await listPanelProjects())
        setShowLanding(true)
      }}
    />
  )
}
