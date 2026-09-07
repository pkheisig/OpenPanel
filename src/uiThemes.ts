import themeContract from './ui-foundation/themes.json'

export type StructuralThemeDefinition = (typeof themeContract.structuralThemes)[number]
export type ColorPaletteDefinition = (typeof themeContract.palettes)[number]
export type StructuralThemeId = StructuralThemeDefinition['id']
export type ColorPaletteId = ColorPaletteDefinition['id']
export type ThemeAppearance = (typeof themeContract.appearanceModes)[number]
export type ResolvedTheme = 'light' | 'dark'

export type OpenSuiteThemeSelection = {
  style: StructuralThemeId
  palette: ColorPaletteId
  appearance: ThemeAppearance
  theme: ResolvedTheme
  themeContractVersion: typeof themeContract.contractVersion
}

export type OpenSuiteThemeSelectionSummary = Pick<OpenSuiteThemeSelection, 'style' | 'palette' | 'appearance'>

export const OPENSUITE_THEME_CONTRACT_VERSION = themeContract.contractVersion
export const THEME_CONTRACT = themeContract
export const STRUCTURAL_THEMES = themeContract.structuralThemes
export const COLOR_PALETTES = themeContract.palettes
export const SUPPORTED_APPEARANCES = themeContract.appearanceModes

export const DEFAULT_THEME_SELECTION: OpenSuiteThemeSelection = Object.freeze({
  style: 'default',
  palette: 'opensuite-default',
  appearance: 'system',
  theme: 'light',
  themeContractVersion: OPENSUITE_THEME_CONTRACT_VERSION,
})

const structuralThemeIds = new Set<StructuralThemeId>(STRUCTURAL_THEMES.map((theme) => theme.id))
const colorPaletteIds = new Set<ColorPaletteId>(COLOR_PALETTES.map((palette) => palette.id))

function isThemeAppearance(value: unknown): value is ThemeAppearance {
  return SUPPORTED_APPEARANCES.includes(value as ThemeAppearance)
}

export function resolveThemeSelection(
  selection: Partial<OpenSuiteThemeSelection> = {},
  systemTheme: ResolvedTheme = 'light',
): OpenSuiteThemeSelection {
  const appearance = isThemeAppearance(selection.appearance)
    ? selection.appearance
    : DEFAULT_THEME_SELECTION.appearance
  const style = structuralThemeIds.has(selection.style as StructuralThemeId)
    ? selection.style as StructuralThemeId
    : DEFAULT_THEME_SELECTION.style
  const palette = colorPaletteIds.has(selection.palette as ColorPaletteId)
    ? selection.palette as ColorPaletteId
    : DEFAULT_THEME_SELECTION.palette
  const theme = appearance === 'dark' || (appearance === 'system' && systemTheme === 'dark')
    ? 'dark'
    : 'light'
  return Object.freeze({
    style,
    palette,
    appearance,
    theme,
    themeContractVersion: OPENSUITE_THEME_CONTRACT_VERSION,
  })
}

export function validateThemeSelection(value: unknown): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ['theme selection must be an object']
  const selection = value as Partial<OpenSuiteThemeSelection>
  const errors: string[] = []
  if (!structuralThemeIds.has(selection.style as StructuralThemeId)) errors.push('style is not a supported structural theme')
  if (!colorPaletteIds.has(selection.palette as ColorPaletteId)) errors.push('palette is not a supported color palette')
  if (!isThemeAppearance(selection.appearance)) errors.push('appearance must be system, light, or dark')
  return errors
}

function setThemeData(root: HTMLElement, selection: OpenSuiteThemeSelection): void {
  const structuralTheme = STRUCTURAL_THEMES.find((candidate) => candidate.id === selection.style) ?? STRUCTURAL_THEMES[0]
  root.dataset.suiteThemeRoot = ''
  root.dataset.suiteUi = 'openpanel'
  root.dataset.suiteStyle = selection.style
  root.dataset.suitePalette = selection.palette
  root.dataset.suiteAppearance = selection.appearance
  root.dataset.suiteThemeContractVersion = selection.themeContractVersion
  root.dataset.suiteDecoration = structuralTheme.tokens['style-decoration']
  root.dataset.suiteSurfaceTreatment = structuralTheme.tokens['style-surface-treatment']
  root.dataset.theme = selection.theme
}

export function applyStandaloneThemeSelection(
  root: HTMLElement,
  selection: OpenSuiteThemeSelection,
): void {
  setThemeData(root, selection)
  const structuralTheme = STRUCTURAL_THEMES.find((candidate) => candidate.id === selection.style) ?? STRUCTURAL_THEMES[0]
  const palette = COLOR_PALETTES.find((candidate) => candidate.id === selection.palette) ?? COLOR_PALETTES[0]
  const colors = palette[selection.theme]
  for (const [name, value] of Object.entries(structuralTheme.tokens)) root.style.setProperty(`--suite-${name}`, value)
  for (const [name, value] of Object.entries(colors)) root.style.setProperty(`--suite-${name}`, value)
  root.style.setProperty('--suite-style-control-height-scale', structuralTheme.tokens['style-control-height-scale'])
  root.style.setProperty('--suite-style-content-inset', structuralTheme.tokens['style-content-inset'])
  root.style.setProperty('--suite-style-min-target', structuralTheme.tokens['style-min-target'])
  root.style.setProperty('--suite-style-min-gap', structuralTheme.tokens['style-min-gap'])
  root.style.setProperty('--suite-style-focus-reserve', structuralTheme.tokens['style-focus-reserve'])
  root.style.setProperty('--suite-style-decoration', structuralTheme.tokens['style-decoration'])
  root.style.setProperty('--suite-style-surface-treatment', structuralTheme.tokens['style-surface-treatment'])
  root.style.setProperty('--suite-style-backdrop-filter', structuralTheme.tokens['style-backdrop-filter'])
  root.style.colorScheme = selection.theme
}

export function applyThemeSelectionAttributes(root: HTMLElement, selection: OpenSuiteThemeSelection): void {
  setThemeData(root, selection)
}
