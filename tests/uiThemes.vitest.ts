// @vitest-environment jsdom
import { describe, expect, test } from 'vitest'
import {
  applyStandaloneThemeSelection,
  COLOR_PALETTES,
  DEFAULT_THEME_SELECTION,
  OPENSUITE_THEME_CONTRACT_VERSION,
  resolveThemeSelection,
  STRUCTURAL_THEMES,
  validateThemeSelection,
} from '../src/uiThemes'

describe('OpenSuite theme contract', () => {
  test('pins the qualified structural themes, palettes, and appearances', () => {
    expect(OPENSUITE_THEME_CONTRACT_VERSION).toBe('1.1.0')
    expect(STRUCTURAL_THEMES).toHaveLength(11)
    expect(COLOR_PALETTES).toHaveLength(15)
    expect(DEFAULT_THEME_SELECTION).toMatchObject({
      style: 'default',
      palette: 'opensuite-default',
      appearance: 'system',
    })
  })

  test('resolves system appearance and falls back from unsupported values', () => {
    expect(resolveThemeSelection({ style: 'bauhaus', palette: 'classic-bauhaus', appearance: 'system' }, 'dark')).toMatchObject({
      style: 'bauhaus',
      palette: 'classic-bauhaus',
      appearance: 'system',
      theme: 'dark',
    })
    expect(resolveThemeSelection({ style: 'invalid', palette: 'invalid', appearance: 'invalid' } as never)).toEqual(DEFAULT_THEME_SELECTION)
    expect(validateThemeSelection({ style: 'bauhaus', palette: 'classic-bauhaus', appearance: 'light' })).toEqual([])
    expect(validateThemeSelection({ style: 'invalid', palette: 'invalid', appearance: 'invalid' })).toHaveLength(3)
  })

  test('applies only contract-owned chrome tokens and theme attributes', () => {
    const root = document.createElement('div')
    const selection = resolveThemeSelection({ style: 'bauhaus', palette: 'classic-bauhaus', appearance: 'dark' })
    applyStandaloneThemeSelection(root, selection)
    expect(root.dataset).toMatchObject({
      suiteUi: 'openpanel',
      suiteStyle: 'bauhaus',
      suitePalette: 'classic-bauhaus',
      suiteAppearance: 'dark',
      theme: 'dark',
    })
    expect(root.style.getPropertyValue('--suite-color-accent')).toBeTruthy()
    expect(root.style.getPropertyValue('--suite-border-width')).toBeTruthy()
    expect(root.style.getPropertyValue('--suite-fluorophore-color')).toBe('')
  })
})
