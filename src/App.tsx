import { useEffect, useState } from 'react'
import { LandingPage } from './LandingPage'
import type { PanelLaunchSelection } from './LandingPage'
import PanelBuilder from './PanelBuilder'
import { projectJsonFilename, projectNameFromFilename, saveBlob } from './browserFiles'
import {
  DEFAULT_PLOT_SCALE,
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

function preferredTheme(): 'light' | 'dark' {
  const stored = localStorage.getItem('spectreasy-theme') || localStorage.getItem('spectreasy_theme')
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function emptyProject(selection: PanelLaunchSelection): ProjectState {
  return {
    cytometer: selection.cytometer,
    configuration: selection.configuration,
    slots: Array(18).fill(''),
    markers: {},
    tab: 'panel',
    theme: preferredTheme(),
    sidebarWidth: 214,
    sidebarCollapsed: false,
    plotScale: DEFAULT_PLOT_SCALE,
    plotScaleMode: 'fit-width',
    wizard: null,
    cytometerPanels: {
      [selection.cytometer]: {
        configuration: selection.configuration,
        slots: Array(18).fill(''),
        markers: {},
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
      setActivePanel(restored)
      setPanels(storedPanels)
      setShowLanding(restored === null)
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
          setShowLanding(false)
        }}
        onImport={async (file) => {
          const panel = await createPanelProject(
            projectNameFromFilename(file.name),
            parseProject(await file.text()),
          )
          await refreshPanels()
          setActivePanel(panel)
          setShowLanding(false)
        }}
        onExport={async (panel) => {
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
          setActivePanelProject(panel.id)
          setActivePanel(panel)
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
      onRequestExit={async () => {
        setPanels(await listPanelProjects())
        setShowLanding(true)
      }}
    />
  )
}
