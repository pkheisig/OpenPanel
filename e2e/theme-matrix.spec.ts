import { expect, test, type Page } from '@playwright/test'
import themeContract from '../src/ui-foundation/themes.json' with { type: 'json' }

const APP_PATH = '/OpenPanel/'
const viewports = [
  { id: '1920x1080', width: 1920, height: 1080 },
  { id: '1440x900', width: 1440, height: 900 },
  { id: '1280x960', width: 1280, height: 960 },
  { id: 'narrow', width: 960, height: 800 },
]
const zooms = [1, 1.25, 1.5, 2]

const combinations = [...new Map([
  ...themeContract.structuralThemes.flatMap((style) => [
    { style: style.id, styleLabel: style.label, palette: 'opensuite-default', paletteLabel: 'OpenSuite Default' },
    {
      style: style.id,
      styleLabel: style.label,
      palette: style.recommendedPalette,
      paletteLabel: themeContract.palettes.find((palette) => palette.id === style.recommendedPalette)!.label,
    },
  ]),
  ...themeContract.palettes.map((palette) => ({
    style: 'default',
    styleLabel: 'OpenSuite Default',
    palette: palette.id,
    paletteLabel: palette.label,
  })),
  ...themeContract.structuralThemes.map((style, index) => {
    const palette = themeContract.palettes[(index * 7 + 3) % themeContract.palettes.length]
    return { style: style.id, styleLabel: style.label, palette: palette.id, paletteLabel: palette.label }
  }),
].map((combination) => [`${combination.style}:${combination.palette}`, combination])).values()]

async function choose(page: Page, label: 'Style' | 'Palette' | 'Appearance', option: string) {
  const dialog = page.getByRole('dialog', { name: 'Theme settings' })
  await dialog.getByRole('combobox', { name: label }).click()
  await page.getByRole('option', { name: option, exact: true }).click()
}

test('qualifies the bounded OpenPanel theme matrix without geometry or state regressions', async ({ page }) => {
  test.setTimeout(180_000)
  await page.goto(APP_PATH)
  await page.getByRole('button', { name: 'Theme settings' }).click()
  const initialState = await page.evaluate(() => ({
    project: localStorage.getItem('openpanel.panel-builder.state.v1'),
    library: localStorage.getItem('openpanel.panel-library.v1'),
    panelName: (document.querySelector('[aria-label="Panel name"]') as HTMLInputElement).value,
  }))

  let cases = 0
  for (const combination of combinations) {
    await choose(page, 'Style', combination.styleLabel)
    await choose(page, 'Palette', combination.paletteLabel)
    for (const appearance of ['Light', 'Dark'] as const) {
      await choose(page, 'Appearance', appearance)
      for (const viewport of viewports) {
        for (const zoom of zooms) {
          await page.setViewportSize({
            width: Math.round(viewport.width / zoom),
            height: Math.round(viewport.height / zoom),
          })
          const result = await page.evaluate(({ combination, appearance, viewport, zoom }) => {
            const root = document.querySelector<HTMLElement>('.openpanel-module-root')!
            const visibleControls = [...root.querySelectorAll<HTMLElement>('button, input, [role="combobox"]')]
              .filter((element) => {
                const style = getComputedStyle(element)
                const rect = element.getBoundingClientRect()
                return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0
              })
            const invalidControls = visibleControls.filter((element) => {
              const rect = element.getBoundingClientRect()
              return rect.left < -1 || rect.right > window.innerWidth + 1 || rect.width < 24 || rect.height < 24
            }).map((element) => element.getAttribute('aria-label') || element.textContent?.trim() || element.tagName)
            return {
              style: root.dataset.openpanelStyle,
              palette: root.dataset.openpanelPalette,
              appearance: root.dataset.openpanelAppearance,
              contract: root.dataset.openpanelThemeContract,
              accent: getComputedStyle(root).getPropertyValue('--suite-color-accent').trim(),
              horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
              invalidControls,
              project: localStorage.getItem('openpanel.panel-builder.state.v1'),
              library: localStorage.getItem('openpanel.panel-library.v1'),
              panelName: (document.querySelector('[aria-label="Panel name"]') as HTMLInputElement).value,
              expected: { ...combination, appearance: appearance.toLowerCase() },
              viewport: viewport.id,
              zoom,
            }
          }, { combination, appearance, viewport, zoom })
          const caseLabel = `${combination.style}/${combination.palette}/${appearance}/${viewport.id}/${zoom}`
          expect(result.horizontalOverflow, caseLabel).toBe(false)
          expect(result.invalidControls, caseLabel).toEqual([])
          expect(result).toMatchObject({
            style: combination.style,
            palette: combination.palette,
            appearance: appearance.toLowerCase(),
            contract: themeContract.contractVersion,
            project: initialState.project,
            library: initialState.library,
            panelName: initialState.panelName,
          })
          expect(result.accent).not.toBe('')
          cases += 1
        }
      }
    }
  }
  expect(cases).toBe(combinations.length * 2 * viewports.length * zooms.length)
})
