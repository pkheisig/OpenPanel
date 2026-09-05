import { readLocalStorage, removeLocalStorage, writeLocalStorage } from './browserStorage'

export type AppTheme = 'light' | 'dark'

const THEME_STORAGE_KEY = 'spectreasy-theme'
const LEGACY_THEME_STORAGE_KEY = 'spectreasy_theme'

export function readThemePreference(fallback?: AppTheme): AppTheme {
  const stored = readLocalStorage(THEME_STORAGE_KEY) || readLocalStorage(LEGACY_THEME_STORAGE_KEY)
  if (stored === 'light' || stored === 'dark') return stored
  if (fallback) return fallback
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function saveThemePreference(theme: AppTheme): void {
  writeLocalStorage(THEME_STORAGE_KEY, theme)
  removeLocalStorage(LEGACY_THEME_STORAGE_KEY)
  document.documentElement.dataset.theme = theme
}
