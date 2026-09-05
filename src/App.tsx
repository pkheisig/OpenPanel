import { useEffect, useState } from 'react'
import { LandingPage } from './LandingPage'
import type { PanelLaunchSelection } from './LandingPage'
import PanelBuilder from './PanelBuilder'
import { projectJsonFilename, projectNameFromFilename } from './browserFiles'
import {
  PanelSelectionValidationError,
  buildPanelPayload,
  resolveKnownConfiguration,
  validateRequestedFluorophores,
} from './spectralEngine'
import { assertPanelMarkersWithinCapacity, assertPanelSlotsWithinCapacity } from './panelBuilderShared'
import {
  DEFAULT_PLOT_SCALE,
  PROJECT_RESOURCE_LIMITS,
  alignWizardFluorophores,
  parseProject,
  serializeProject,
} from './projectStore'
import type { CytometerPanelState, ProjectState, StoredPanelProject } from './projectStore'
import {
  OpenPanelHostProvider,
  useOpenPanelApplicationContext,
  useOpenPanelHostContext,
  useOpenPanelHostServices,
} from './module/hostServices'
import type { OpenPanelApplicationContext, OpenPanelHostServices } from './module/hostServices'

const CURRENT_SURFACE_STORAGE_KEY = 'openpanel.current-surface'

function storedSurface(storage: OpenPanelHostServices['storage']): 'landing' | 'editor' | null {
  const value = storage.getItem(CURRENT_SURFACE_STORAGE_KEY)
  return value === 'landing' || value === 'editor' ? value : null
}

function rememberSurface(storage: OpenPanelHostServices['storage'], surface: 'landing' | 'editor'): void {
  storage.setItem(CURRENT_SURFACE_STORAGE_KEY, surface)
}

function includeRecoveryPanel(
  panels: StoredPanelProject[],
  recoveryPanel: StoredPanelProject | null | undefined,
): StoredPanelProject[] {
  return recoveryPanel?.loadError && !panels.some((panel) => panel.id === recoveryPanel.id)
    ? [recoveryPanel, ...panels]
    : panels
}

function preserveMarkersWithinSlots(
  markers: Record<number, string>,
  maxPanelSize: number,
): Record<number, string> {
  return Object.fromEntries(
    Object.entries(markers).filter(([index]) => {
      const slotIndex = Number(index)
      return Number.isInteger(slotIndex) && slotIndex >= 0 && slotIndex < maxPanelSize
    }),
  ) as Record<number, string>
}

function emptyProject(selection: PanelLaunchSelection, theme: 'light' | 'dark'): ProjectState {
  const slots = selection.slots ? [...selection.slots] : Array(18).fill('')
  const markers = selection.markers ? { ...selection.markers } : {}
  return {
    cytometer: selection.cytometer,
    configuration: selection.configuration,
    slots,
    markers,
    tab: 'panel',
    theme,
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

export type AppProps = {
  hostServices?: OpenPanelHostServices
  applicationContext?: OpenPanelApplicationContext
}

function AppContent() {
  const host = useOpenPanelHostServices()
  const applicationContext = useOpenPanelApplicationContext()
  const { projects, files, storage, theme: themeServices } = host
  const assetResolver = host.assets
  const [panels, setPanels] = useState<StoredPanelProject[]>([])
  const [activePanel, setActivePanel] = useState<StoredPanelProject | null>(null)
  const [showLanding, setShowLanding] = useState(false)
  const [loading, setLoading] = useState(true)

  /* eslint-disable react-hooks/set-state-in-effect -- synchronize a controlled host-provided initial project. */
  useEffect(() => {
    if (applicationContext.initialProject) {
      const now = new Date().toISOString()
      setActivePanel({
        id: applicationContext.projectId ?? 'embedded',
        name: applicationContext.projectName ?? 'Untitled panel',
        createdAt: now,
        updatedAt: now,
        state: applicationContext.initialProject,
      })
      setPanels([])
      setShowLanding(false)
      setLoading(false)
      return
    }
    let cancelled = false
    const restore = async () => {
      const restored = await projects.loadLastPanelProject()
      const storedPanels = await projects.listPanelProjects()
      if (cancelled) return
      const visiblePanels = includeRecoveryPanel(storedPanels, restored)
      setActivePanel(restored)
      setPanels(visiblePanels)
      const landing = storedSurface(storage) === 'landing' || restored === null || Boolean(restored?.loadError)
      setShowLanding(landing)
      rememberSurface(storage, landing ? 'landing' : 'editor')
      setLoading(false)
    }
    void restore()
    return () => {
      cancelled = true
    }
  }, [applicationContext.initialProject, applicationContext.projectId, applicationContext.projectName, projects, storage])
  /* eslint-enable react-hooks/set-state-in-effect */

  const refreshPanels = async (recoveryPanel: StoredPanelProject | null) => {
    setPanels(includeRecoveryPanel(await projects.listPanelProjects(), recoveryPanel))
  }

  const exitApplication = async () => {
    if (applicationContext.mode === 'embedded') {
      await (applicationContext.onRequestExit ?? host.navigation?.requestExit)?.()
      return
    }
    rememberSurface(storage, 'landing')
    await refreshPanels(activePanel)
    setShowLanding(true)
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
          const panel = await projects.createPanelProject(selection.name, emptyProject(selection, themeServices.read(applicationContext.theme)))
          await refreshPanels(null)
          setActivePanel(panel)
          rememberSurface(storage, 'editor')
          setShowLanding(false)
        }}
        onImport={async (file) => {
          assertLegacyRecoveryResolved()
          const state = parseProject(await files.readTextFileWithinLimit(
            file,
            PROJECT_RESOURCE_LIMITS.maxProjectFileBytes,
            'OpenPanel project',
          ))
          const configuration = resolveKnownConfiguration(state.cytometer, state.configuration)
          if (!configuration) {
            throw new Error(`OpenPanel project uses an unsupported configuration '${state.configuration}'.`)
          }
          const validation = assetResolver
            ? await validateRequestedFluorophores(state.cytometer, configuration, state.slots, assetResolver)
            : await validateRequestedFluorophores(state.cytometer, configuration, state.slots)
          if (validation.diagnostics.length > 0) {
            throw new PanelSelectionValidationError(validation.diagnostics)
          }
          const payload = assetResolver
            ? await buildPanelPayload(state.cytometer, configuration, state.slots.filter((slot) => slot.trim()), true, assetResolver)
            : await buildPanelPayload(state.cytometer, configuration, state.slots.filter((slot) => slot.trim()), true)
          if (validation.accepted.length > payload.max_panel_size) {
            throw new Error(`This panel has ${validation.accepted.length} colors, but the selected configuration has only ${payload.max_panel_size} detectors.`)
          }
          const canonicalCytometer = payload.cytometer || state.cytometer
          const canonicalConfiguration = payload.configuration || configuration
          const wizardRequested = state.wizard?.markers
            .map((marker) => marker.currentFluorophore)
            .filter(Boolean) ?? []
          const wizardValidation = assetResolver
            ? await validateRequestedFluorophores(state.cytometer, configuration, wizardRequested, assetResolver)
            : await validateRequestedFluorophores(state.cytometer, configuration, wizardRequested)
          if (wizardValidation.diagnostics.length > 0) {
            throw new PanelSelectionValidationError(wizardValidation.diagnostics)
          }
          let acceptedIndex = 0
          const canonicalSlots = state.slots.map((slot) => (
            slot.trim() ? validation.accepted[acceptedIndex++] : ''
          ))
          assertPanelSlotsWithinCapacity(canonicalSlots, payload.max_panel_size)
          assertPanelMarkersWithinCapacity(state.markers, payload.max_panel_size)
          const canonicalWizard = alignWizardFluorophores(
            state.wizard,
            canonicalSlots,
            payload.fluorophores.map((fluorophore) => fluorophore.fluorophore),
            true,
          )
          const canonicalCytometerPanels: Record<string, CytometerPanelState> = {}
          const seenPanelCytometers = new Map<string, string>()
          for (const [panelCytometer, panelState] of Object.entries(state.cytometerPanels)) {
            const panelConfiguration = resolveKnownConfiguration(panelCytometer, panelState.configuration)
            if (!panelConfiguration) {
              throw new Error(`OpenPanel project uses an unsupported configuration '${panelState.configuration}' for '${panelCytometer}'.`)
            }
            const panelValidation = assetResolver
              ? await validateRequestedFluorophores(panelCytometer, panelConfiguration, panelState.slots, assetResolver)
              : await validateRequestedFluorophores(panelCytometer, panelConfiguration, panelState.slots)
            if (panelValidation.diagnostics.length > 0) {
              throw new PanelSelectionValidationError(panelValidation.diagnostics)
            }
            const panelPayload = assetResolver
              ? await buildPanelPayload(panelCytometer, panelConfiguration, panelValidation.accepted, true, assetResolver)
              : await buildPanelPayload(panelCytometer, panelConfiguration, panelValidation.accepted, true)
            const canonicalPanelCytometer = panelPayload.cytometer || panelCytometer
            const previousPanelCytometer = seenPanelCytometers.get(canonicalPanelCytometer)
            if (previousPanelCytometer) {
              throw new Error(`OpenPanel project contains cytometer panels '${previousPanelCytometer}' and '${panelCytometer}' that both resolve to '${canonicalPanelCytometer}'.`)
            }
            seenPanelCytometers.set(canonicalPanelCytometer, panelCytometer)
            if (panelValidation.accepted.length > panelPayload.max_panel_size) {
              throw new Error(`Panel '${panelCytometer}' has ${panelValidation.accepted.length} colors, but its configuration has only ${panelPayload.max_panel_size} detectors.`)
            }
            let panelAcceptedIndex = 0
            const panelSlots = panelState.slots.map((slot) => (
              slot.trim() ? panelValidation.accepted[panelAcceptedIndex++] : ''
            ))
            assertPanelSlotsWithinCapacity(panelSlots, panelPayload.max_panel_size)
            assertPanelMarkersWithinCapacity(panelState.markers, panelPayload.max_panel_size)
            const panelWizardRequested = panelState.wizard?.markers
              .map((marker) => marker.currentFluorophore)
              .filter(Boolean) ?? []
            const panelWizardValidation = assetResolver
              ? await validateRequestedFluorophores(panelCytometer, panelConfiguration, panelWizardRequested, assetResolver)
              : await validateRequestedFluorophores(panelCytometer, panelConfiguration, panelWizardRequested)
            if (panelWizardValidation.diagnostics.length > 0) {
              throw new PanelSelectionValidationError(panelWizardValidation.diagnostics)
            }
            const panelWizard = alignWizardFluorophores(
              panelState.wizard,
              panelSlots,
              panelPayload.fluorophores.map((fluorophore) => fluorophore.fluorophore),
              true,
            )
            if (canonicalPanelCytometer === canonicalCytometer) {
              if (panelCytometer !== state.cytometer) {
                throw new Error(`OpenPanel project contains cytometer panels '${state.cytometer}' and '${panelCytometer}' that both resolve to '${canonicalCytometer}'.`)
              }
              continue
            }
            canonicalCytometerPanels[canonicalPanelCytometer] = {
              ...panelState,
              configuration: panelPayload.configuration || panelConfiguration,
              slots: panelSlots,
              markers: preserveMarkersWithinSlots(panelState.markers, panelPayload.max_panel_size),
              wizard: panelWizard,
            }
          }
          const canonicalMarkers = preserveMarkersWithinSlots(state.markers, payload.max_panel_size)
          const activeCytometerPanel = state.cytometerPanels[state.cytometer]
          canonicalCytometerPanels[canonicalCytometer] = {
            ...(activeCytometerPanel ?? { configuration: canonicalConfiguration, wizard: canonicalWizard }),
            configuration: canonicalConfiguration,
            slots: canonicalSlots,
            markers: canonicalMarkers,
            wizard: canonicalWizard,
          }
          const canonicalState: ProjectState = {
            ...state,
            cytometer: canonicalCytometer,
            configuration: canonicalConfiguration,
            slots: canonicalSlots,
            markers: canonicalMarkers,
            cytometerPanels: canonicalCytometerPanels,
            wizard: canonicalWizard,
          }
          const panel = await projects.createPanelProject(
            projectNameFromFilename(file.name),
            canonicalState,
          )
          await refreshPanels(null)
          setActivePanel(panel)
          rememberSurface(storage, 'editor')
          setShowLanding(false)
        }}
        onExport={async (panel) => {
          if (panel.loadError) {
            throw new Error(`Cannot export '${panel.name}' until its saved state is recovered or deleted.`)
          }
          await files.saveBlob(new Blob([serializeProject(panel.state)], { type: 'application/json' }), {
            suggestedName: projectJsonFilename(panel.name),
            description: 'OpenPanel project',
            mimeType: 'application/json',
            extensions: ['.json'],
          })
        }}
        onRename={async (panel, name) => {
          const renamed = await projects.renamePanelProject(panel.id, name)
          if (renamed && activePanel?.id === renamed.id) setActivePanel(renamed)
          await refreshPanels(activePanel)
        }}
        onDuplicate={async (panel) => {
          await projects.duplicatePanelProject(panel.id)
          await refreshPanels(activePanel)
        }}
        onArchive={async (panel) => {
          await projects.archivePanelProject(panel.id)
          if (activePanel?.id === panel.id) setActivePanel(null)
          await refreshPanels(activePanel)
        }}
        onRestore={async (panel) => {
          await projects.restorePanelProject(panel.id)
          await refreshPanels(activePanel)
        }}
        onDelete={async (panel) => {
          await projects.deletePanelProject(panel.id)
          if (activePanel?.id === panel.id) setActivePanel(null)
          await refreshPanels(null)
        }}
        onOpen={(panel) => {
          if (!panel.loadError) projects.setActivePanelProject(panel.id)
          setActivePanel(panel)
          rememberSurface(storage, 'editor')
          setShowLanding(false)
        }}
      />
    )
  }

  const controlledProjectIdentity = applicationContext.initialProject
    ? JSON.stringify(applicationContext.initialProject)
    : activePanel.updatedAt
  const editorKey = [
    activePanel.id,
    applicationContext.projectRevision ?? '',
    applicationContext.projectName ?? activePanel.name,
    controlledProjectIdentity,
  ].join(':')

  return (
    <PanelBuilder
      key={editorKey}
      projectId={activePanel.id}
      projectName={activePanel.name}
      initialProject={activePanel.state}
      initialError={activePanel.loadError}
      recoveryMode={Boolean(activePanel.loadError)}
      mode={applicationContext.mode}
      hostTheme={applicationContext.theme}
      projectPath={applicationContext.projectPath}
      projectRevision={applicationContext.projectRevision}
      onRequestExit={exitApplication}
    />
  )
}

export default function App({ hostServices, applicationContext }: AppProps = {}) {
  const inherited = useOpenPanelHostContext()
  const services = hostServices ?? inherited.services
  const context = applicationContext ?? inherited.applicationContext
  return (
    <OpenPanelHostProvider services={services} applicationContext={context} lifecycle={inherited.lifecycle}>
      <AppContent />
    </OpenPanelHostProvider>
  )
}
