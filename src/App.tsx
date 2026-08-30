import { useEffect, useState } from 'react'
import { LandingPage } from './LandingPage'
import type { PanelLaunchSelection } from './LandingPage'
import PanelBuilder from './PanelBuilder'
import { projectJsonFilename, projectNameFromFilename, readTextFileWithinLimit, saveBlob } from './browserFiles'
import {
  PanelSelectionValidationError,
  buildPanelPayload,
  resolveKnownConfiguration,
  validateRequestedFluorophores,
} from './spectralEngine'
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

function includeRecoveryPanel(
  panels: StoredPanelProject[],
  recoveryPanel: StoredPanelProject | null | undefined,
): StoredPanelProject[] {
  return recoveryPanel?.loadError && !panels.some((panel) => panel.id === recoveryPanel.id)
    ? [recoveryPanel, ...panels]
    : panels
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
      const visiblePanels = includeRecoveryPanel(storedPanels, restored)
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

  const refreshPanels = async (recoveryPanel: StoredPanelProject | null) => {
    setPanels(includeRecoveryPanel(await listPanelProjects(), recoveryPanel))
  }

  const assertLegacyRecoveryResolved = () => {
    if (activePanel?.id === 'active' && activePanel.loadError) {
      throw new Error('Recover or delete the legacy panel before starting or importing another project.')
    }
  }

  if (loading) {
    return <div className="app-loading" role="status">Opening your last panel…</div>
  }

  if (showLanding || !activePanel) {
    return (
      <LandingPage
        panels={panels}
        onStart={async (selection) => {
          assertLegacyRecoveryResolved()
          const panel = await createPanelProject(selection.name, emptyProject(selection))
          await refreshPanels(activePanel)
          setActivePanel(panel)
          rememberSurface('editor')
          setShowLanding(false)
        }}
        onImport={async (file) => {
          assertLegacyRecoveryResolved()
          const state = parseProject(await readTextFileWithinLimit(
            file,
            PROJECT_RESOURCE_LIMITS.maxProjectFileBytes,
            'OpenPanel project',
          ))
          const configuration = resolveKnownConfiguration(state.cytometer, state.configuration)
          if (!configuration) {
            throw new Error(`OpenPanel project uses an unsupported configuration '${state.configuration}'.`)
          }
          const validation = await validateRequestedFluorophores(state.cytometer, configuration, state.slots)
          if (validation.diagnostics.length > 0) {
            throw new PanelSelectionValidationError(validation.diagnostics)
          }
          const payload = await buildPanelPayload(
            state.cytometer,
            configuration,
            state.slots.filter((slot) => slot.trim()),
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
          const activeCytometerPanel = state.cytometerPanels[state.cytometer]
          const canonicalState: ProjectState = {
            ...state,
            slots: canonicalSlots,
            markers: canonicalMarkers,
            cytometerPanels: {
              ...state.cytometerPanels,
              [state.cytometer]: {
                ...(activeCytometerPanel ?? { configuration, wizard: state.wizard }),
                configuration,
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
          await refreshPanels(activePanel)
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
          await refreshPanels(activePanel)
        }}
        onDuplicate={async (panel) => {
          await duplicatePanelProject(panel.id)
          await refreshPanels(activePanel)
        }}
        onArchive={async (panel) => {
          await archivePanelProject(panel.id)
          if (activePanel?.id === panel.id) setActivePanel(null)
          await refreshPanels(activePanel)
        }}
        onRestore={async (panel) => {
          await restorePanelProject(panel.id)
          await refreshPanels(activePanel)
        }}
        onDelete={async (panel) => {
          await deletePanelProject(panel.id)
          if (activePanel?.id === panel.id) setActivePanel(null)
          await refreshPanels(null)
        }}
        onOpen={(panel) => {
          if (!panel.loadError) setActivePanelProject(panel.id)
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
      recoveryMode={Boolean(activePanel.loadError)}
      onRequestExit={async () => {
        rememberSurface('landing')
        await refreshPanels(activePanel)
        setShowLanding(true)
      }}
    />
  )
}
