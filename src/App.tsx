import { useEffect, useState } from 'react'
import { LandingPage } from './LandingPage'
import type { PanelLaunchSelection } from './LandingPage'
import PanelBuilder from './PanelBuilder'
import {
  DEFAULT_PLOT_SCALE,
  createPanelProject,
  listPanelProjects,
  loadLastPanelProject,
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
    return (
      <LandingPage
        panels={panels}
        onStart={async (selection) => {
          const panel = await createPanelProject(selection.name, emptyProject(selection))
          setPanels(await listPanelProjects())
          setActivePanel(panel)
          setShowLanding(false)
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
