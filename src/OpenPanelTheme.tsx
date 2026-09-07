/* eslint-disable react-refresh/only-export-components -- shared theme state and root are one contract. */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import type { OpenPanelApplicationContext, OpenPanelHostServices } from './module/hostServices'
import { openPanelHostOwns } from './module/hostServices'
import {
  DEFAULT_THEME_SELECTION,
  applyStandaloneThemeSelection,
  applyThemeSelectionAttributes,
  resolveThemeSelection,
  type OpenSuiteThemeSelection,
  type OpenSuiteThemeSelectionSummary,
  type ResolvedTheme,
} from './uiThemes'

type OpenPanelThemeValue = {
  selection: OpenSuiteThemeSelection
  controlsOwned: boolean
  updateSelection(patch: Partial<OpenSuiteThemeSelectionSummary>): void
}

const ThemeContext = createContext<OpenPanelThemeValue>({
  selection: DEFAULT_THEME_SELECTION,
  controlsOwned: true,
  updateSelection: () => undefined,
})

function systemTheme(): ResolvedTheme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function subscribeSystemTheme(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => undefined
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  media.addEventListener?.('change', onChange)
  return () => media.removeEventListener?.('change', onChange)
}

function useSystemTheme(): ResolvedTheme {
  return useSyncExternalStore(subscribeSystemTheme, systemTheme, () => 'light')
}

function initialStandaloneSelection(
  services: OpenPanelHostServices,
  applicationContext: OpenPanelApplicationContext,
): OpenSuiteThemeSelectionSummary {
  const saved = services.theme.readSelection?.()
  if (saved) return saved
  return {
    style: applicationContext.style ?? DEFAULT_THEME_SELECTION.style,
    palette: applicationContext.palette ?? DEFAULT_THEME_SELECTION.palette,
    appearance: applicationContext.appearance
      ?? applicationContext.theme
      ?? services.theme.read(applicationContext.theme),
  }
}

export function OpenPanelThemeRoot({
  services,
  applicationContext,
  suspended = false,
  children,
}: {
  services: OpenPanelHostServices
  applicationContext: OpenPanelApplicationContext
  suspended?: boolean
  children: ReactNode
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const hostOwnsTheme = openPanelHostOwns(applicationContext, 'theme')
  const currentSystemTheme = useSystemTheme()
  const [localSelection, setLocalSelection] = useState<OpenSuiteThemeSelectionSummary>(
    () => initialStandaloneSelection(services, applicationContext),
  )
  const selection = useMemo(() => resolveThemeSelection(
    hostOwnsTheme
      ? {
        style: applicationContext.style,
        palette: applicationContext.palette,
        appearance: applicationContext.appearance ?? applicationContext.theme,
        theme: applicationContext.theme,
      }
      : localSelection,
    currentSystemTheme,
  ), [
    applicationContext.appearance,
    applicationContext.palette,
    applicationContext.style,
    applicationContext.theme,
    currentSystemTheme,
    hostOwnsTheme,
    localSelection,
  ])

  useEffect(() => {
    if (hostOwnsTheme) return
    const summary = {
      style: selection.style,
      palette: selection.palette,
      appearance: selection.appearance,
    }
    services.theme.saveSelection?.(summary)
    services.theme.save(selection.theme)
  }, [hostOwnsTheme, selection, services.theme])

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return
    applyThemeSelectionAttributes(root, selection)
    root.dataset.openpanelTheme = selection.theme
    root.dataset.openpanelAppearance = selection.appearance
    root.dataset.openpanelStyle = selection.style
    root.dataset.openpanelPalette = selection.palette
    root.dataset.openpanelThemeContract = selection.themeContractVersion
    if (!hostOwnsTheme) applyStandaloneThemeSelection(root, selection)
    if (applicationContext.mode === 'standalone') {
      applyStandaloneThemeSelection(document.documentElement, selection)
      if (document.body) applyStandaloneThemeSelection(document.body, selection)
    }
  }, [applicationContext.mode, hostOwnsTheme, selection])

  const updateSelection = useCallback((patch: Partial<OpenSuiteThemeSelectionSummary>) => {
    if (hostOwnsTheme) return
    setLocalSelection((current) => ({ ...current, ...patch }))
  }, [hostOwnsTheme])

  const value = useMemo<OpenPanelThemeValue>(() => ({
    selection,
    controlsOwned: !hostOwnsTheme,
    updateSelection,
  }), [hostOwnsTheme, selection, updateSelection])

  return (
    <ThemeContext.Provider value={value}>
      <div
        ref={rootRef}
        className="openpanel-module-root"
        data-openpanel-module-root="true"
        data-openpanel-mode={applicationContext.mode}
        data-openpanel-theme={selection.theme}
        data-openpanel-appearance={selection.appearance}
        data-openpanel-style={selection.style}
        data-openpanel-palette={selection.palette}
        data-openpanel-theme-contract={selection.themeContractVersion}
        data-openpanel-density={applicationContext.density}
        data-openpanel-ui-contract={applicationContext.uiContractVersion}
        data-openpanel-portal-root="true"
        data-suspended={suspended ? 'true' : 'false'}
        hidden={suspended}
      >
        {children}
      </div>
    </ThemeContext.Provider>
  )
}

export function useOpenPanelTheme(): OpenPanelThemeValue {
  return useContext(ThemeContext)
}
