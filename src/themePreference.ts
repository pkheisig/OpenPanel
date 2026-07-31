export type AppTheme = 'light' | 'dark'

const THEME_STORAGE_KEY = 'spectreasy-theme'
const LEGACY_THEME_STORAGE_KEY = 'spectreasy_theme'

export function readThemePreference(fallback?: AppTheme): AppTheme {
  const stored = localStorage.getItem(THEME_STORAGE_KEY) || localStorage.getItem(LEGACY_THEME_STORAGE_KEY)
  if (stored === 'light' || stored === 'dark') return stored
  if (fallback) return fallback
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function saveThemePreference(theme: AppTheme): void {
  localStorage.setItem(THEME_STORAGE_KEY, theme)
  localStorage.removeItem(LEGACY_THEME_STORAGE_KEY)
  document.documentElement.dataset.theme = theme
}
