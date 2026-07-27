import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, FlaskConical } from 'lucide-react'
import {
  getSpectralPanelConfigurations,
  getSpectralPanelLibraries,
  resolveConfiguration,
} from './spectralEngine'
import './LandingPage.css'

export type PanelLaunchSelection = {
  cytometer: string
  configuration: string
}

type LandingPageProps = {
  onStart: (selection: PanelLaunchSelection) => void
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

export function LandingPage({ onStart }: LandingPageProps) {
  const libraries = useMemo(() => getSpectralPanelLibraries(), [])
  const [theme] = useState<'light' | 'dark'>(storedTheme)
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
    document.documentElement.dataset.theme = theme
  }, [theme])

  const selectedConfiguration = configurations.find((candidate) => candidate.id === configuration)

  const startPanel = () => {
    localStorage.setItem('spectreasy_cytometer', cytometer)
    localStorage.setItem('spectreasy_configuration', configuration)
    onStart({ cytometer, configuration })
  }

  return (
    <main className={`launch-screen ${theme}`}>
      <div className="launch-grid" aria-hidden="true" />
      <div className="launch-spectrum" aria-hidden="true">
        <svg viewBox="0 0 1000 210" preserveAspectRatio="none">
          <path className="spectrum-line spectrum-violet" d="M0 186 C90 182 128 176 170 42 S248 184 332 180 S408 175 452 88 S521 180 596 179 S665 176 710 24 S780 179 846 180 S920 174 1000 82" />
          <path className="spectrum-line spectrum-blue" d="M0 184 C160 184 224 180 286 164 S360 182 470 180 S565 176 620 54 S694 178 768 180 S866 180 1000 158" />
          <path className="spectrum-line spectrum-red" d="M0 182 C310 182 430 180 550 176 S708 178 792 172 S870 166 915 52 S965 170 1000 178" />
        </svg>
      </div>

      <header className="launch-header">
        <a className="launch-brand" href="./" aria-label="OpenPanel home">
          <span className="launch-brand-mark"><FlaskConical size={19} /></span>
          <span>OpenPanel</span>
        </a>
      </header>

      <section className="launch-layout">
        <form className="launch-card" onSubmit={(event) => {
          event.preventDefault()
          startPanel()
        }} aria-label="Panel configuration">
          <label className="launch-field">
            <span>CYTOMETER</span>
            <select
              value={cytometer}
              onChange={(event) => {
                const nextCytometer = event.target.value
                setCytometer(nextCytometer)
                setConfiguration(getSpectralPanelConfigurations(nextCytometer)[0].id)
              }}
              aria-label="Cytometer"
            >
              {libraries.map((library) => (
                <option key={library.id} value={library.id}>{library.label}</option>
              ))}
            </select>
          </label>

          <label className="launch-field">
            <span>DETECTOR CONFIGURATION</span>
            <select
              value={configuration}
              onChange={(event) => setConfiguration(event.target.value)}
              aria-label="Detector configuration"
            >
              {configurations.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>{candidate.label}</option>
              ))}
            </select>
          </label>

          <div className="launch-configuration-note">
            <span>Detector layout</span>
            <strong>{selectedConfiguration?.description}</strong>
          </div>

          <button className="launch-submit" type="submit">
            Build panel
            <ArrowRight size={18} />
          </button>
        </form>
      </section>
    </main>
  )
}
