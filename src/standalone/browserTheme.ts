import { readLocalStorage, removeLocalStorage, writeLocalStorage } from './browserStorage'
import {
  DEFAULT_THEME_SELECTION,
  resolveThemeSelection,
  type OpenSuiteThemeSelectionSummary,
} from '../uiThemes'

export type AppTheme = 'light' | 'dark'

const THEME_STORAGE_KEY = 'spectreasy-theme'
const LEGACY_THEME_STORAGE_KEY = 'spectreasy_theme'
export const THEME_SELECTION_STORAGE_KEY = 'openpanel-theme-preferences-v1'

export function readThemeSelection(): OpenSuiteThemeSelectionSummary {
  const stored = readLocalStorage(THEME_SELECTION_STORAGE_KEY)
  if (stored) {
    try {
      const resolved = resolveThemeSelection(JSON.parse(stored) as Partial<OpenSuiteThemeSelectionSummary>)
      return { style: resolved.style, palette: resolved.palette, appearance: resolved.appearance }
    } catch {
      // Fall through to the legacy light/dark preference.
    }
  }
  const legacyTheme = readThemePreference()
  return {
    style: DEFAULT_THEME_SELECTION.style,
    palette: DEFAULT_THEME_SELECTION.palette,
    appearance: legacyTheme,
  }
}

export function saveThemeSelection(selection: OpenSuiteThemeSelectionSummary): void {
  const resolved = resolveThemeSelection(selection)
  writeLocalStorage(THEME_SELECTION_STORAGE_KEY, JSON.stringify({
    style: resolved.style,
    palette: resolved.palette,
    appearance: resolved.appearance,
  }))
}

export function readThemePreference(fallback?: AppTheme): AppTheme {
  const stored = readLocalStorage(THEME_STORAGE_KEY) || readLocalStorage(LEGACY_THEME_STORAGE_KEY)
  if (stored === 'light' || stored === 'dark') return stored
  if (fallback) return fallback
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function saveThemePreference(theme: AppTheme): void {
  writeLocalStorage(THEME_STORAGE_KEY, theme)
  removeLocalStorage(LEGACY_THEME_STORAGE_KEY)
  document.documentElement.dataset.theme = theme
}
