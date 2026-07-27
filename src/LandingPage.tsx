import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, ArrowUpRight, FlaskConical, Layers3, Moon, Sun } from 'lucide-react'
import {
  getSpectralPanelConfigurations,
  getSpectralPanelLibraries,
  resolveConfiguration,
} from './spectralEngine'
import type { StoredPanelProject } from './projectStore'
import { UiSelect } from './UiSelect'
import './LandingPage.css'

export type PanelLaunchSelection = {
  name: string
  cytometer: string
  configuration: string
}

type LandingPageProps = {
  panels: StoredPanelProject[]
  onStart: (selection: PanelLaunchSelection) => Promise<void>
  onOpen: (panel: StoredPanelProject) => void
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

export function LandingPage({ panels, onStart, onOpen }: LandingPageProps) {
  const libraries = useMemo(() => getSpectralPanelLibraries(), [])
  const [theme, setTheme] = useState<'light' | 'dark'>(storedTheme)
  const [panelName, setPanelName] = useState(`Panel ${panels.length + 1}`)
  const [starting, setStarting] = useState(false)
  const [cytometer, setCytometer] = useState(
    () => storedCytometer(libraries[0].id),
  )
  const configurations = useMemo(
    () => getSpectralPanelConfigurations(cytometer),
    [cytometer],
  )
  const [configuration, setConfiguration] = useState(
    () => resolveConfiguration(cytometer, localStorage.getItem('spectreasy_configuration')),
  )

  useEffect(() => {
    localStorage.setItem('spectreasy-theme', theme)
    localStorage.removeItem('spectreasy_theme')
    document.documentElement.dataset.theme = theme
  }, [theme])

  const selectedConfiguration = configurations.find((candidate) => candidate.id === configuration)

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

  const cytometerLabel = (id: string) => (
    libraries.find((library) => library.id === id)?.label ?? id
  )

  const configurationLabel = (panel: StoredPanelProject) => (
    getSpectralPanelConfigurations(panel.state.cytometer)
      .find((candidate) => candidate.id === panel.state.configuration)?.label
      ?? panel.state.configuration
  )

  return (
    <main className={`launch-screen ${theme}`}>
      <div className="launch-grid" aria-hidden="true" />

      <header className="launch-header">
        <a className="launch-brand" href="./" aria-label="OpenPanel home">
          <span className="launch-brand-mark"><FlaskConical size={19} /></span>
          <span>OpenPanel</span>
        </a>
        <button
          type="button"
          className="launch-theme-button"
          onClick={() => setTheme((current) => current === 'light' ? 'dark' : 'light')}
          aria-label={theme === 'light' ? 'Use dark mode' : 'Use light mode'}
          title={theme === 'light' ? 'Use dark mode' : 'Use light mode'}
        >
          {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
        </button>
      </header>

      <section className="launch-layout">
        <form className="launch-card" onSubmit={(event) => {
          event.preventDefault()
          void startPanel()
        }} aria-label="Panel configuration">
          <label className="launch-field">
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
          />

          {cytometer !== 'xenith' && (
            <>
              <UiSelect
                label="DETECTOR CONFIGURATION"
                value={configuration}
                options={configurations.map((candidate) => ({
                  value: candidate.id,
                  label: candidate.label,
                }))}
                onChange={setConfiguration}
              />

              <div className="launch-configuration-note">
                <span>Detector layout</span>
                <strong>{selectedConfiguration?.description}</strong>
              </div>
            </>
          )}

          <button className="launch-submit" type="submit" disabled={starting}>
            {starting ? 'Opening…' : 'Build panel'}
            <ArrowRight size={18} />
          </button>
        </form>

        {panels.length > 0 && (
          <section className="panel-library" aria-labelledby="panel-library-title">
            <div className="panel-library-heading">
              <div>
                <p>LOCAL PANELS</p>
                <h2 id="panel-library-title">Saved panels</h2>
              </div>
              <span>{panels.length}</span>
            </div>
            <div className="panel-library-list">
              {panels.map((panel) => {
                const colors = panel.state.slots.filter(Boolean).length
                return (
                  <button
                    key={panel.id}
                    type="button"
                    className="panel-library-card"
                    onClick={() => onOpen(panel)}
                    aria-label={`Open ${panel.name}`}
                  >
                    <span className="panel-library-icon"><Layers3 size={17} /></span>
                    <span className="panel-library-content">
                      <strong>{panel.name}</strong>
                      <span className="panel-library-summary">
                        <span>{colors} {colors === 1 ? 'color' : 'colors'}</span>
                        <span>{cytometerLabel(panel.state.cytometer)}</span>
                        <span>{configurationLabel(panel)}</span>
                      </span>
                    </span>
                    <ArrowUpRight className="panel-library-open-icon" size={17} />
                  </button>
                )
              })}
            </div>
          </section>
        )}
      </section>
    </main>
  )
}
