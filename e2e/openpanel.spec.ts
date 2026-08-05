import { expect, test } from '@playwright/test'

const APP_PATH = '/OpenPanel/'

async function selectFluorophore(page: import('@playwright/test').Page, slot: number, name: string) {
  const input = page.getByPlaceholder('Select fluorophore').nth(slot)
  await input.fill(name)
  await input.press('Enter')
}

async function openEmptyPanel(
  page: import('@playwright/test').Page,
  cytometer = 'Cytek Aurora',
  configuration = 'Aurora 5L: UV/V/B/YG/R',
) {
  await expect(page.getByRole('form', { name: 'Panel configuration' })).toBeVisible()
  await chooseOption(page, 'CYTOMETER', cytometer)
  await chooseOption(page, 'DETECTOR CONFIGURATION', configuration)
  await page.getByRole('button', { name: 'Build panel' }).click()
  await expect(page.getByLabel('Panel name')).toBeVisible()
  await expect(page.locator('.panel-sidebar-color-count')).toHaveText('(0 colors)')
}

async function chooseOption(
  page: import('@playwright/test').Page,
  label: string,
  option: string,
) {
  await page.getByRole('combobox', { name: label }).click()
  await page.getByRole('option', { name: option }).click()
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined })
    Object.defineProperty(window, 'showOpenFilePicker', { configurable: true, value: undefined })
    localStorage.setItem('spectreasy-theme', 'light')
    localStorage.setItem('spectreasy_slots', JSON.stringify(['APC', 'PE', 'FITC', 'BV421']))
    localStorage.setItem('spectreasy_markers', JSON.stringify({ 0: 'TCR', 1: 'TCR' }))
  })
})

test('finds fluorophores through punctuation-insensitive sidebar search', async ({ page }) => {
  await page.goto(APP_PATH)
  await openEmptyPanel(page)

  const input = page.getByPlaceholder('Select fluorophore').first()
  const nearIrOption = page.locator('.fluor-dropdown').getByRole('button', {
    name: 'LIVE DEAD NIR',
    exact: true,
  })

  await input.fill('LIVE DEAD')
  await expect(nearIrOption).toBeVisible()

  await input.fill('live dead nir')
  await expect(nearIrOption).toBeVisible()
  await nearIrOption.click()
  await expect(input).toHaveValue('LIVE DEAD NIR')
})

test('resizes the sidebar fluidly and persists the final width', async ({ page }) => {
  await page.goto(APP_PATH)
  await openEmptyPanel(page)

  const sidebar = page.locator('.panel-sidebar')
  const resizer = page.getByRole('separator', { name: 'Resize fluorophore sidebar' })
  const initialWidth = (await sidebar.boundingBox())!.width
  const handleBox = await resizer.boundingBox()
  expect(handleBox).not.toBeNull()

  await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + 100)
  await page.mouse.down()
  await expect(sidebar).toHaveClass(/is-resizing/)
  expect(await sidebar.evaluate((element) => getComputedStyle(element).transitionDuration)).toBe('0s')

  await page.mouse.move(handleBox!.x + handleBox!.width / 2 + 72, handleBox!.y + 100, { steps: 6 })
  await page.waitForTimeout(50)
  const draggedWidth = (await sidebar.boundingBox())!.width
  expect(draggedWidth).toBeCloseTo(initialWidth + 72, 0)
  await page.mouse.up()

  await expect(sidebar).not.toHaveClass(/is-resizing/)
  await expect(resizer).toHaveAttribute('aria-valuenow', String(Math.round(draggedWidth)))
  await page.waitForTimeout(600)
  await page.reload()
  await expect(page.getByLabel('Panel name')).toBeVisible()
  expect((await sidebar.boundingBox())!.width).toBeCloseTo(draggedWidth, 0)

  await resizer.focus()
  await page.keyboard.press('ArrowLeft')
  await page.waitForTimeout(220)
  expect((await sidebar.boundingBox())!.width).toBeCloseTo(draggedWidth - 12, 0)
})

test('shares light and dark mode between the landing page and editor', async ({ page }) => {
  await page.goto(APP_PATH)
  await openEmptyPanel(page)
  await expect(page.locator('.panel-builder')).toHaveClass(/light/)

  await page.getByRole('button', { name: 'Toggle theme' }).click()
  await expect(page.locator('.panel-builder')).toHaveClass(/dark/)
  await page.waitForTimeout(650)
  await page.getByRole('button', { name: 'Open panel library' }).click()
  await expect(page.locator('.launch-screen')).toHaveClass(/dark/)
  await expect(page.getByRole('button', { name: 'Use light mode' })).toBeVisible()

  await page.getByRole('button', { name: 'Use light mode' }).click()
  await expect(page.locator('.launch-screen')).toHaveClass(/light/)
  await page.getByRole('button', { name: 'Open Panel 1' }).click()
  await expect(page.locator('.panel-builder')).toHaveClass(/light/)

  await page.getByRole('button', { name: 'Toggle theme' }).click()
  await expect(page.locator('.panel-builder')).toHaveClass(/dark/)
  await page.getByRole('button', { name: 'Open panel library' }).click()
  await expect(page.locator('.launch-screen')).toHaveClass(/dark/)
})

test('shows the fluorophore name beside the cursor when hovering a spectrum', async ({ page }) => {
  await page.goto(APP_PATH)
  await openEmptyPanel(page)
  await selectFluorophore(page, 0, 'Alexa Fluor 488')

  const hitTarget = page.locator('.spectrum-hit-target[data-fluorophore="Alexa Fluor 488"]')
  const peak = await hitTarget.evaluate((path) => {
    const svgPath = path as SVGPathElement
    const transform = svgPath.getScreenCTM()
    const length = svgPath.getTotalLength()
    let best = { x: 0, y: Number.POSITIVE_INFINITY }
    for (let index = 0; index <= 100; index += 1) {
      const point = svgPath.getPointAtLength(length * index / 100)
      const screenPoint = new DOMPoint(point.x, point.y).matrixTransform(transform ?? undefined)
      if (screenPoint.y < best.y) best = { x: screenPoint.x, y: screenPoint.y }
    }
    return best
  })

  await page.mouse.move(peak.x, peak.y)
  const tooltip = page.getByRole('tooltip')
  await expect(tooltip).toHaveText('Alexa Fluor 488')
  const tooltipBox = await tooltip.boundingBox()
  expect(tooltipBox).not.toBeNull()
  expect(Math.abs(tooltipBox!.x - peak.x)).toBeLessThan(230)
  expect(Math.abs(tooltipBox!.y - peak.y)).toBeLessThan(80)
  await expect(page.locator('.selector-row').first()).not.toHaveClass(/is-fluor-hovered/)

  await page.mouse.move(peak.x, (await page.locator('.tabs-bar').boundingBox())!.y + 20)
  await expect(tooltip).toHaveCount(0)
})

test('keeps panel wizard controls responsive without a render loop', async ({ page }) => {
  const consoleErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })

  await page.goto(APP_PATH)
  await openEmptyPanel(page)
  await page.getByRole('button', { name: 'Open panel wizard' }).click()

  const markerTrigger = page.getByRole('combobox', { name: 'Marker 1 name' })
  await markerTrigger.click()
  await expect(page.getByRole('searchbox', { name: 'Search or enter marker' })).toBeVisible()
  await page.waitForTimeout(150)

  expect(consoleErrors.join('\n')).not.toContain('Maximum update depth exceeded')
})

test('selects the instrument and configuration before opening a clean workspace', async ({ page }) => {
  await page.goto(APP_PATH)
  const buildPanelButton = page.getByRole('button', { name: 'Build panel' })
  const useOmipButton = page.getByRole('button', { name: 'Use OMIP' })
  await expect(useOmipButton).toBeVisible()
  await expect(page.locator('.launch-header-actions').getByRole('button', { name: 'Use OMIP' })).toHaveCount(0)
  await expect(page.getByRole('combobox', { name: 'CYTOMETER' })).toContainText('Select cytometer')
  await expect(page.getByRole('combobox', { name: 'DETECTOR CONFIGURATION' })).toContainText(
    'Select configuration',
  )
  await expect(buildPanelButton).toBeDisabled()
  await expect(useOmipButton).toBeDisabled()

  await page.getByRole('combobox', { name: 'CYTOMETER' }).click()
  await expect(page.getByRole('option').first()).toHaveText('Select cytometer')
  await page.keyboard.press('Escape')
  await page.getByRole('combobox', { name: 'DETECTOR CONFIGURATION' }).click()
  await expect(page.getByRole('option').first()).toHaveText('Select configuration')
  await page.keyboard.press('Escape')

  await chooseOption(page, 'CYTOMETER', 'Cytek Aurora')
  await expect(page.getByRole('combobox', { name: 'DETECTOR CONFIGURATION' })).toContainText(
    'Select configuration',
  )
  await expect(buildPanelButton).toBeDisabled()
  await expect(useOmipButton).toBeDisabled()
  await chooseOption(page, 'DETECTOR CONFIGURATION', 'Aurora 5L: UV/V/B/YG/R')
  await expect(buildPanelButton).toBeEnabled()
  await expect(useOmipButton).toBeEnabled()

  const [buildButtonStyle, omipButtonStyle] = await Promise.all([
    buildPanelButton.evaluate((button) => ({
      background: getComputedStyle(button).backgroundColor,
      radius: getComputedStyle(button).borderRadius,
      height: button.getBoundingClientRect().height,
    })),
    useOmipButton.evaluate((button) => ({
      background: getComputedStyle(button).backgroundColor,
      radius: getComputedStyle(button).borderRadius,
      height: button.getBoundingClientRect().height,
    })),
  ])
  expect(omipButtonStyle).toEqual(buildButtonStyle)
  await useOmipButton.click()
  const landingOmipLibrary = page.getByRole('dialog', { name: 'OMIP Library' })
  await expect(landingOmipLibrary).toBeVisible()
  await landingOmipLibrary.getByRole('button', { name: 'Preview OMIP-120' }).click()
  await expect(page.getByRole('dialog', { name: 'OMIP-120' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Create panel from OMIP' })).toBeEnabled()
  await page.getByRole('button', { name: 'Create panel from OMIP' }).click()
  const setupWarning = page.getByRole('alertdialog', { name: 'Warning' })
  await expect(setupWarning).toContainText('OMIP-120 was designed for Cytek Aurora 4L (UV-V-B-R).')
  await expect(setupWarning).toContainText('The selected setup uses Cytek Aurora · Aurora 5L: UV/V/B/YG/R.')
  await expect(setupWarning).toContainText(
    'The panel may therefore not perform as intended. Unsupported colors will remain unassigned.',
  )
  await expect(setupWarning).toContainText('Proceed anyway?')
  await expect(setupWarning.getByRole('button', { name: 'Cancel' })).toBeVisible()
  await expect(setupWarning.getByRole('button', { name: 'Use current config' })).toBeVisible()
  await expect(setupWarning.getByRole('button', { name: 'Use recommended config' })).toBeEnabled()
  const warningButtonColors = await setupWarning.locator('.omip-compatibility-actions button').evaluateAll(
    (buttons) => buttons.map((button) => getComputedStyle(button).backgroundColor),
  )
  expect(new Set(warningButtonColors).size).toBe(3)
  await setupWarning.getByRole('button', { name: 'Use recommended config' }).click()
  await expect(page.getByLabel('Panel name')).toHaveValue('OMIP-120')
  await page.getByRole('button', { name: 'Open panel library' }).click()
  await expect(page.getByRole('button', { name: 'Open OMIP-120' })).toContainText('Aurora 4L: UV/V/B/R')
  await page.getByRole('button', { name: 'Use dark mode' }).click()
  await expect(page.locator('.launch-screen')).toHaveClass(/dark/)
  await expect(page.getByRole('combobox', { name: 'CYTOMETER' })).toContainText('Select cytometer')
  await expect(page.getByRole('combobox', { name: 'DETECTOR CONFIGURATION' })).toContainText(
    'Select configuration',
  )
  await expect(buildPanelButton).toBeDisabled()
  await expect(useOmipButton).toBeDisabled()
  await chooseOption(page, 'CYTOMETER', 'Thermo Fisher Attune Xenith')
  await expect(page.getByRole('combobox', { name: 'DETECTOR CONFIGURATION' })).toHaveCount(0)
  await expect(page.getByText('Detector layout', { exact: true })).toHaveCount(0)
  await expect(buildPanelButton).toBeEnabled()
  await expect(useOmipButton).toBeEnabled()
  await chooseOption(page, 'CYTOMETER', 'Sony ID7000')
  await expect(page.getByRole('combobox', { name: 'DETECTOR CONFIGURATION' })).toContainText(
    'Select configuration',
  )
  await expect(buildPanelButton).toBeDisabled()
  await expect(useOmipButton).toBeDisabled()
  await chooseOption(page, 'DETECTOR CONFIGURATION', 'ID7000 4L: V/B/YG/R')
  await expect(buildPanelButton).toBeEnabled()
  await expect(useOmipButton).toBeEnabled()
  await page.getByRole('button', { name: 'Use OMIP' }).click()
  const projectOmipLibrary = page.getByRole('dialog', { name: 'OMIP Library' })
  const templateSearch = projectOmipLibrary.getByRole('searchbox', { name: 'Search OMIP Library' })
  await templateSearch.fill('OMIP-097')
  await projectOmipLibrary.getByRole('button', { name: 'Preview OMIP-097' }).click()
  await page.getByRole('button', { name: 'Create panel from OMIP' }).click()
  const omipWarning = page.getByRole('alertdialog', { name: 'Warning' })
  await expect(omipWarning).toContainText('OMIP-097 was designed for Cytek Northern Lights 3L (V-B-R)')
  await expect(omipWarning).toContainText('The selected setup uses Sony ID7000 · ID7000 4L: V/B/YG/R')
  await expect(omipWarning.getByRole('button', { name: 'Use recommended config' })).toBeDisabled()
  await omipWarning.getByRole('button', { name: 'Cancel' }).click()
  await expect(omipWarning).toBeHidden()
  await page.getByRole('button', { name: 'Create panel from OMIP' }).click()
  await page.getByRole('alertdialog', { name: 'Warning' })
    .getByRole('button', { name: 'Use current config' }).click()
  await expect(page.locator('.panel-builder')).toHaveClass(/dark/)
  await expect(page.locator('.panel-primary-actions')).toContainText('Panel wizard')
  await expect(page.getByRole('button', { name: 'Import from OMIP' })).toHaveCount(0)
  await expect(page.getByRole('dialog', { name: 'Panel wizard' })).toHaveCount(0)
  await expect(page.getByPlaceholder('Select fluorophore')).toHaveCount(16)
  await expect(page.getByPlaceholder('Select fluorophore').first()).toHaveValue('BV711')
  await expect(page.locator('.panel-sidebar-color-count')).toHaveText('(16 colors)')
  expect(await page.locator('.matrix-marker-input').evaluateAll((inputs) => (
    inputs.map((input) => (input as HTMLInputElement).value)
  ))).toContain('Platelet GPVI')
  const plotControls = page.getByRole('group', { name: 'Plot size' })
  const clearProjectPanel = page.getByRole('button', { name: 'Clear project panel' })
  const themeButton = page.getByRole('button', { name: 'Toggle theme' })
  const [plotControlsBox, clearButtonBox, themeButtonBox] = await Promise.all([
    plotControls.boundingBox(),
    clearProjectPanel.boundingBox(),
    themeButton.boundingBox(),
  ])
  expect(plotControlsBox!.x + plotControlsBox!.width).toBeLessThan(clearButtonBox!.x)
  expect(clearButtonBox!.x + clearButtonBox!.width).toBeLessThan(themeButtonBox!.x)
  await page.mouse.move(0, 0)
  await clearProjectPanel.evaluate((button) => (button as HTMLButtonElement).blur())
  await expect(clearProjectPanel).toHaveCSS('color', 'rgb(255, 118, 95)')
  await clearProjectPanel.click()
  const editorClearConfirmation = page.getByRole('alertdialog', { name: 'Clear the panel?' })
  await expect(editorClearConfirmation).toContainText(
    'This clears every marker and color from the panel and sidebar. You can undo it from the editor header.',
  )
  expect(await editorClearConfirmation.evaluate((dialog) => ({
    title: getComputedStyle(dialog.querySelector('h3')!).fontSize,
    description: getComputedStyle(dialog.querySelector('p')!).fontSize,
    button: getComputedStyle(dialog.querySelector('button')!).fontSize,
  }))).toEqual({
    title: '24px',
    description: '16.5px',
    button: '15px',
  })
  await editorClearConfirmation.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.locator('.panel-sidebar-color-count')).toHaveText('(16 colors)')
  await clearProjectPanel.click()
  await editorClearConfirmation.getByRole('button', { name: 'Clear panel' }).click()
  await expect(page.locator('.panel-sidebar-color-count')).toHaveText('(0 colors)')
  await page.getByRole('button', { name: 'Undo last edit' }).click()
  await expect(page.locator('.panel-sidebar-color-count')).toHaveText('(16 colors)')
  await expect(page.getByLabel('Panel name')).toHaveValue('OMIP-097')
  await expect(page.getByRole('combobox', { name: 'Cytometer' })).toHaveCount(0)
  await expect(page.getByRole('combobox', { name: 'Detector configuration' })).toHaveCount(0)
  expect(await page.getByRole('button', { name: 'PANEL', exact: true }).evaluate((element) => getComputedStyle(element).fontSize)).toBe('12px')
  expect(await page.getByRole('columnheader', { name: 'Fluorophore' }).count()).toBeGreaterThan(0)
  const laserColorsMatch = await page.locator('.laser-head').evaluateAll((headers) => headers.every((header) => {
    const laserKey = header.getAttribute('data-laser-key')
    const band = document.querySelector(`.detector-laser-band[data-laser-key="${laserKey}"]`)
    return band !== null && getComputedStyle(header).backgroundColor === getComputedStyle(band).fill
  }))
  expect(laserColorsMatch).toBe(true)
  const spectrum = page.getByRole('img', { name: 'Combined spectra' })
  const baseViewBox = await spectrum.getAttribute('viewBox')
  const [, , viewBoxWidth, viewBoxHeight] = String(baseViewBox).split(' ').map(Number)
  await expect(spectrum).toHaveAttribute('width', String(viewBoxWidth))
  await expect(spectrum).toHaveAttribute('height', String(viewBoxHeight))
  const spectrumContainerWidth = await page.locator('.top-spectrum').evaluate((element) => {
    const style = getComputedStyle(element)
    return element.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight)
  })
  const baseBox = await spectrum.boundingBox()
  expect(baseBox).not.toBeNull()
  expect(baseBox!.width).toBeCloseTo(spectrumContainerWidth, 0)
  expect(baseBox!.height).toBeCloseTo(baseBox!.width * viewBoxHeight / viewBoxWidth, 0)
  await page.getByRole('button', { name: 'Decrease plot size' }).click()
  await page.waitForTimeout(220)
  const reducedBox = await spectrum.boundingBox()
  expect(reducedBox!.width).toBeCloseTo(baseBox!.width * 0.875, 0)
  expect(reducedBox!.height).toBeCloseTo(reducedBox!.width * viewBoxHeight / viewBoxWidth, 0)
  await expect(spectrum).toHaveAttribute('viewBox', String(baseViewBox))
  await page.getByRole('button', { name: 'Increase plot size' }).click()
  await page.getByRole('button', { name: 'Increase plot size' }).click()
  await page.waitForTimeout(220)
  const expandedBox = await spectrum.boundingBox()
  expect(expandedBox!.width).toBeCloseTo(baseBox!.width * 1.125, 0)
  expect(expandedBox!.height).toBeCloseTo(expandedBox!.width * viewBoxHeight / viewBoxWidth, 0)
  await expect(spectrum).toHaveAttribute('viewBox', String(baseViewBox))
  await selectFluorophore(page, 0, 'Alexa Fluor 488')
  await page.waitForTimeout(650)
  await page.getByRole('button', { name: 'Decrease plot size' }).click()
  await page.getByRole('button', { name: 'SPECTRA' }).click()
  const signature = page.getByRole('img', { name: 'Alexa Fluor 488 spectrum' })
  await expect(signature).toBeVisible()
  await page.waitForTimeout(220)
  const signatureBox = await signature.boundingBox()
  const signatureContentWidth = await page.locator('.signature-card').first().evaluate((element) => {
    const style = getComputedStyle(element)
    return element.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight)
  })
  expect(signatureBox!.width).toBeCloseTo(signatureContentWidth, 0)
  const anchoredTabsY = (await page.locator('.tabs-bar').boundingBox())!.y
  await page.getByRole('button', { name: 'SIMILARITY', exact: true }).click()
  expect((await page.locator('.tabs-bar').boundingBox())!.y).toBeCloseTo(anchoredTabsY, 0)
  await expect(page.locator('.similarity-table .axis-corner')).toHaveCSS('border-top-width', '0px')
  await page.getByRole('button', { name: 'PANEL', exact: true }).click()
  expect((await page.locator('.tabs-bar').boundingBox())!.y).toBeCloseTo(anchoredTabsY, 0)
  await page.getByRole('button', { name: 'SPECTRA' }).click()
  expect((await page.locator('.tabs-bar').boundingBox())!.y).toBeCloseTo(anchoredTabsY, 0)
  await page.getByRole('button', { name: 'Increase plot size' }).click()
  await page.waitForTimeout(220)
  const signatureAfterZoomBox = await signature.boundingBox()
  expect(signatureAfterZoomBox!.width).toBeCloseTo(signatureBox!.width, 0)
  expect(signatureAfterZoomBox!.height).toBeCloseTo(signatureBox!.height, 0)
  await page.getByRole('button', { name: 'Open panel library' }).click()
  await expect(page.getByRole('form', { name: 'Panel configuration' })).toBeVisible()
  await page.reload()
  await expect(page.locator('.launch-screen')).toBeVisible()
  await expect(page.getByRole('form', { name: 'Panel configuration' })).toBeVisible()
  const savedPanel = page.getByRole('button', { name: 'Open OMIP-097' })
  await expect(savedPanel).toContainText('16 colors')
  await expect(savedPanel).toContainText('Sony ID7000')
  await expect(savedPanel).toContainText('ID7000 4L: V/B/YG/R')
  const savedCard = page.locator('.panel-library-card').filter({ has: savedPanel })
  await expect(savedCard.getByRole('img', { name: 'Saved panel spectrum preview' }).locator('path')).toHaveCount(16)
  await expect(savedCard.getByRole('img', { name: 'Saved panel spectrum preview' }).locator('path').first())
    .toHaveAttribute('stroke-width', '0.9')
  await expect(savedCard.locator('.panel-preview-complexity')).toHaveText('44.00')
  await expect(savedCard.locator('.panel-preview-grid')).toHaveCount(0)
  expect(await savedPanel.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgb(255, 255, 255)')
  await page.getByRole('button', { name: 'Use dark mode' }).click()
  await expect.poll(
    () => savedPanel.evaluate((element) => getComputedStyle(element).backgroundColor),
  ).toBe('rgb(16, 24, 21)')
  const countMetric = await savedCard.locator('.panel-preview-count').boundingBox()
  const complexityMetric = await savedCard.locator('.panel-preview-complexity').boundingBox()
  expect(countMetric!.x).toBeLessThan(complexityMetric!.x)
  expect(countMetric!.y).toBeCloseTo(complexityMetric!.y, 0)
  await page.getByLabel('Panel name').fill('B-cell panel')
  await openEmptyPanel(page)
  await page.getByRole('button', { name: 'Open panel library' }).click()
  await expect(page.getByRole('button', { name: 'Open B-cell panel' })).toContainText('0 colors')
  await expect(page.getByRole('button', { name: 'Open OMIP-097' })).toBeVisible()
  await savedPanel.click()
  await expect(page.locator('.panel-sidebar-color-count')).toHaveText('(16 colors)')
  await page.waitForTimeout(220)
  const reopenedSpectrumBox = await page.getByRole('img', { name: 'Combined spectra' }).boundingBox()
  expect(reopenedSpectrumBox!.width).toBeCloseTo(expandedBox!.width, 0)
  expect(reopenedSpectrumBox!.height).toBeCloseTo(expandedBox!.height, 0)
  await page.reload()
  await expect(page.getByLabel('Panel name')).toBeVisible()
  await expect(page.getByLabel('Panel name')).toHaveValue('OMIP-097')
  await expect(page.locator('.panel-sidebar-color-count')).toHaveText('(16 colors)')
  await page.waitForTimeout(220)
  const reloadedSpectrumBox = await page.getByRole('img', { name: 'Combined spectra' }).boundingBox()
  expect(reloadedSpectrumBox!.width).toBeCloseTo(expandedBox!.width, 0)
  expect(reloadedSpectrumBox!.height).toBeCloseTo(expandedBox!.height, 0)
})

test('starts a configuration-free Xenith panel after selecting only the cytometer', async ({ page }) => {
  await page.goto(APP_PATH)
  await chooseOption(page, 'CYTOMETER', 'Thermo Fisher Attune Xenith')

  await expect(page.getByRole('combobox', { name: 'DETECTOR CONFIGURATION' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Build panel' })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Use OMIP' })).toBeEnabled()

  await page.getByRole('button', { name: 'Build panel' }).click()
  await expect(page.getByLabel('Panel name')).toBeVisible()
  await expect(page.locator('.panel-sidebar-color-count')).toHaveText('(0 colors)')
})

test('uses spectral metrics and detector capacity for Xenith', async ({ page }) => {
  await page.goto(APP_PATH)
  await chooseOption(page, 'CYTOMETER', 'Thermo Fisher Attune Xenith')
  await page.getByRole('button', { name: 'Build panel' }).click()
  await expect(page.getByLabel('Panel name')).toBeVisible()

  await selectFluorophore(page, 0, 'Alexa Fluor 350')
  await selectFluorophore(page, 1, 'Alexa Fluor 488')
  await expect(page.getByRole('img', { name: 'Combined spectra' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'SPECTRA', exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Open panel wizard' }).click()
  const wizard = page.getByRole('dialog', { name: 'Panel wizard' })
  await expect(wizard.getByRole('spinbutton', { name: 'Panel size', exact: true })).toHaveAttribute('max', '51')
})

test('adapts the workspace and wizard to a conventional FACSymphony', async ({ page }) => {
  await page.goto(APP_PATH)
  await chooseOption(page, 'CYTOMETER', 'BD FACSymphony A5 SE')
  await page.getByRole('button', { name: 'Build panel' }).click()
  await expect(page.getByLabel('Panel name')).toBeVisible()

  await selectFluorophore(page, 0, 'BUV395')
  await selectFluorophore(page, 1, 'PE')
  await expect(page.getByRole('img', { name: 'Combined detector responses' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'RESPONSES', exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Open panel wizard' }).click()
  const wizard = page.getByRole('dialog', { name: 'Panel wizard' })
  await expect(wizard.getByRole('spinbutton', { name: 'Panel size', exact: true })).toHaveAttribute('max', '48')
  await wizard.getByRole('button', { name: 'About panel wizard calculations' }).focus()
  await expect(wizard.getByRole('tooltip')).toContainText('detector-response overlap')
})

test('adapts the workspace and wizard to BD LSRFortessa 3L detectors', async ({ page }) => {
  await page.goto(APP_PATH)
  await chooseOption(page, 'CYTOMETER', 'BD LSRFortessa')
  await expect(page.getByRole('combobox', { name: 'DETECTOR CONFIGURATION' })).toContainText('BD LSRFortessa 3L: V/B/R')
  await chooseOption(page, 'DETECTOR CONFIGURATION', 'BD LSRFortessa 3L: V/B/R')
  await page.getByRole('button', { name: 'Build panel' }).click()
  await expect(page.getByLabel('Panel name')).toBeVisible()

  await selectFluorophore(page, 0, 'FITC')
  await selectFluorophore(page, 1, 'PE')
  await selectFluorophore(page, 2, 'APC')
  await expect(page.getByRole('img', { name: 'Combined detector responses' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'RESPONSES', exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Open panel wizard' }).click()
  const wizard = page.getByRole('dialog', { name: 'Panel wizard' })
  await expect(wizard.getByRole('spinbutton', { name: 'Panel size', exact: true })).toHaveAttribute('max', '14')
  await wizard.getByRole('button', { name: 'About panel wizard calculations' }).focus()
  await expect(wizard.getByRole('tooltip')).toContainText('detector-response overlap')
})

test('adapts the workspace and wizard to a public FACSCelesta BVUV configuration', async ({ page }) => {
  await page.goto(APP_PATH)
  await chooseOption(page, 'CYTOMETER', 'BD FACSCelesta')
  await chooseOption(page, 'DETECTOR CONFIGURATION', 'BD FACSCelesta: Blue/Violet/UV')
  await page.getByRole('button', { name: 'Build panel' }).click()
  await expect(page.getByLabel('Panel name')).toBeVisible()

  await selectFluorophore(page, 0, 'BUV395')
  await selectFluorophore(page, 1, 'PE')
  await expect(page.getByRole('img', { name: 'Combined detector responses' })).toBeVisible()
  await page.getByRole('button', { name: 'Open panel wizard' }).click()
  const wizard = page.getByRole('dialog', { name: 'Panel wizard' })
  await expect(wizard.getByRole('spinbutton', { name: 'Panel size', exact: true })).toHaveAttribute('max', '12')
})

test('adapts the workspace and wizard to the documented 4-laser Attune NxT configuration', async ({ page }) => {
  await page.goto(APP_PATH)
  await chooseOption(page, 'CYTOMETER', 'Thermo Fisher Attune NxT')
  await chooseOption(page, 'DETECTOR CONFIGURATION', 'Thermo Fisher Attune NxT: B/R/V/Y')
  await page.getByRole('button', { name: 'Build panel' }).click()
  await expect(page.getByLabel('Panel name')).toBeVisible()

  await selectFluorophore(page, 0, 'FITC')
  await selectFluorophore(page, 1, 'PE')
  await selectFluorophore(page, 2, 'APC')
  await expect(page.getByRole('img', { name: 'Combined detector responses' })).toBeVisible()
  await page.getByRole('button', { name: 'Open panel wizard' }).click()
  const wizard = page.getByRole('dialog', { name: 'Panel wizard' })
  await expect(wizard.getByRole('spinbutton', { name: 'Panel size', exact: true })).toHaveAttribute('max', '14')
})

test('adapts the workspace and wizard to the standard BD Accuri C6 Plus', async ({ page }) => {
  await page.goto(APP_PATH)
  await chooseOption(page, 'CYTOMETER', 'BD Accuri C6 Plus')
  await chooseOption(page, 'DETECTOR CONFIGURATION', 'BD Accuri C6 Plus: standard 3-blue/1-red')
  await page.getByRole('button', { name: 'Build panel' }).click()
  await expect(page.getByLabel('Panel name')).toBeVisible()

  await selectFluorophore(page, 0, 'FITC')
  await selectFluorophore(page, 1, 'PE')
  await selectFluorophore(page, 2, 'APC')
  await expect(page.getByRole('img', { name: 'Combined detector responses' })).toBeVisible()

  await page.getByRole('button', { name: 'Open panel wizard' }).click()
  const wizard = page.getByRole('dialog', { name: 'Panel wizard' })
  await expect(wizard.getByRole('spinbutton', { name: 'Panel size', exact: true })).toHaveAttribute('max', '4')
})

test('adapts the workspace and wizard to BD FACSCalibur', async ({ page }) => {
  await page.goto(APP_PATH)
  await chooseOption(page, 'CYTOMETER', 'BD FACSCalibur')
  await chooseOption(page, 'DETECTOR CONFIGURATION', 'BD FACSCalibur: 2-laser 4-color')
  await page.getByRole('button', { name: 'Build panel' }).click()
  await expect(page.getByLabel('Panel name')).toBeVisible()

  await selectFluorophore(page, 0, 'FITC')
  await selectFluorophore(page, 1, 'PE')
  await selectFluorophore(page, 2, 'APC')
  await expect(page.getByRole('img', { name: 'Combined detector responses' })).toBeVisible()

  await page.getByRole('button', { name: 'Open panel wizard' }).click()
  const wizard = page.getByRole('dialog', { name: 'Panel wizard' })
  await expect(wizard.getByRole('spinbutton', { name: 'Panel size', exact: true })).toHaveAttribute('max', '4')
})

test('adapts the workspace and wizard to BD FACSCanto II', async ({ page }) => {
  await page.goto(APP_PATH)
  await chooseOption(page, 'CYTOMETER', 'BD FACSCanto II')
  await chooseOption(page, 'DETECTOR CONFIGURATION', 'BD FACSCanto II: 3-laser 4-2-2')
  await page.getByRole('button', { name: 'Build panel' }).click()
  await expect(page.getByLabel('Panel name')).toBeVisible()

  await selectFluorophore(page, 0, 'BV421')
  await selectFluorophore(page, 1, 'APC')
  await expect(page.getByRole('img', { name: 'Combined detector responses' })).toBeVisible()

  await page.getByRole('button', { name: 'Open panel wizard' }).click()
  const wizard = page.getByRole('dialog', { name: 'Panel wizard' })
  await expect(wizard.getByRole('spinbutton', { name: 'Panel size', exact: true })).toHaveAttribute('max', '8')
})

test('adapts the workspace and wizard to BD FACSLyric 12-color', async ({ page }) => {
  await page.goto(APP_PATH)
  await chooseOption(page, 'CYTOMETER', 'BD FACSLyric')
  await chooseOption(page, 'DETECTOR CONFIGURATION', 'BD FACSLyric: 3-laser 12-color (4-3-5)')
  await page.getByRole('button', { name: 'Build panel' }).click()
  await expect(page.getByLabel('Panel name')).toBeVisible()

  await selectFluorophore(page, 0, 'BV421')
  await selectFluorophore(page, 1, 'PE-Cy7')
  await selectFluorophore(page, 2, 'APC-R700')
  await expect(page.getByRole('img', { name: 'Combined detector responses' })).toBeVisible()

  await page.getByRole('button', { name: 'Open panel wizard' }).click()
  const wizard = page.getByRole('dialog', { name: 'Panel wizard' })
  await expect(wizard.getByRole('spinbutton', { name: 'Panel size', exact: true })).toHaveAttribute('max', '12')
})

test('adapts the workspace and wizard to Bio-Rad ZE5 5-laser', async ({ page }) => {
  await page.goto(APP_PATH)
  await chooseOption(page, 'CYTOMETER', 'Bio-Rad ZE5')
  await chooseOption(page, 'DETECTOR CONFIGURATION', 'Bio-Rad ZE5: 5-laser (27 colors)')
  await page.getByRole('button', { name: 'Build panel' }).click()
  await expect(page.getByLabel('Panel name')).toBeVisible()

  await selectFluorophore(page, 0, 'BUV395')
  await selectFluorophore(page, 1, 'PE')
  await selectFluorophore(page, 2, 'APC')
  await expect(page.getByRole('img', { name: 'Combined detector responses' })).toBeVisible()

  await page.getByRole('button', { name: 'Open panel wizard' }).click()
  const wizard = page.getByRole('dialog', { name: 'Panel wizard' })
  await expect(wizard.getByRole('spinbutton', { name: 'Panel size', exact: true })).toHaveAttribute('max', '27')
})

test('adapts the workspace and wizard to Thermo Fisher Attune CytPix BYRV6', async ({ page }) => {
  await page.goto(APP_PATH)
  await chooseOption(page, 'CYTOMETER', 'Thermo Fisher Attune CytPix')
  await chooseOption(page, 'DETECTOR CONFIGURATION', 'Thermo Fisher Attune CytPix: BYRV6')
  await page.getByRole('button', { name: 'Build panel' }).click()
  await expect(page.getByLabel('Panel name')).toBeVisible()

  await selectFluorophore(page, 0, 'FITC')
  await selectFluorophore(page, 1, 'PE')
  await selectFluorophore(page, 2, 'APC')
  await expect(page.getByRole('img', { name: 'Combined detector responses' })).toBeVisible()

  await page.getByRole('button', { name: 'Open panel wizard' }).click()
  const wizard = page.getByRole('dialog', { name: 'Panel wizard' })
  await expect(wizard.getByRole('spinbutton', { name: 'Panel size', exact: true })).toHaveAttribute('max', '14')
})

test('adapts the workspace and wizard to Agilent NovoCyte Quanteon 4025', async ({ page }) => {
  await page.goto(APP_PATH)
  await chooseOption(page, 'CYTOMETER', 'Agilent NovoCyte Quanteon')
  await chooseOption(page, 'DETECTOR CONFIGURATION', 'Agilent NovoCyte Quanteon: 4025')
  await page.getByRole('button', { name: 'Build panel' }).click()
  await expect(page.getByLabel('Panel name')).toBeVisible()

  await selectFluorophore(page, 0, 'BV421')
  await selectFluorophore(page, 1, 'FITC')
  await selectFluorophore(page, 2, 'APC')
  await expect(page.getByRole('img', { name: 'Combined detector responses' })).toBeVisible()

  await page.getByRole('button', { name: 'Open panel wizard' }).click()
  const wizard = page.getByRole('dialog', { name: 'Panel wizard' })
  await expect(wizard.getByRole('spinbutton', { name: 'Panel size', exact: true })).toHaveAttribute('max', '25')
})

test('adapts the workspace and wizard to Miltenyi MACSQuant Analyzer 16', async ({ page }) => {
  await page.goto(APP_PATH)
  await chooseOption(page, 'CYTOMETER', 'Miltenyi MACSQuant')
  await chooseOption(page, 'DETECTOR CONFIGURATION', 'Miltenyi MACSQuant Analyzer 16')
  await page.getByRole('button', { name: 'Build panel' }).click()
  await expect(page.getByLabel('Panel name')).toBeVisible()

  await selectFluorophore(page, 0, 'BV421')
  await selectFluorophore(page, 1, 'FITC')
  await selectFluorophore(page, 2, 'APC')
  await expect(page.getByRole('img', { name: 'Combined detector responses' })).toBeVisible()

  await page.getByRole('button', { name: 'Open panel wizard' }).click()
  const wizard = page.getByRole('dialog', { name: 'Panel wizard' })
  await expect(wizard.getByRole('spinbutton', { name: 'Panel size', exact: true })).toHaveAttribute('max', '14')
})

test('adapts the workspace and wizard to BD FACSVerse 8-color', async ({ page }) => {
  await page.goto(APP_PATH)
  await chooseOption(page, 'CYTOMETER', 'BD FACSVerse')
  await chooseOption(page, 'DETECTOR CONFIGURATION', 'BD FACSVerse: 3-laser 8-color (4-2-2)')
  await page.getByRole('button', { name: 'Build panel' }).click()
  await expect(page.getByLabel('Panel name')).toBeVisible()

  await selectFluorophore(page, 0, 'FITC')
  await selectFluorophore(page, 1, 'PE')
  await selectFluorophore(page, 2, 'APC')
  await expect(page.getByRole('img', { name: 'Combined detector responses' })).toBeVisible()

  await page.getByRole('button', { name: 'Open panel wizard' }).click()
  const wizard = page.getByRole('dialog', { name: 'Panel wizard' })
  await expect(wizard.getByRole('spinbutton', { name: 'Panel size', exact: true })).toHaveAttribute('max', '8')
})

test('adapts the workspace and wizard to BD LSR II 18-color', async ({ page }) => {
  await page.goto(APP_PATH)
  await chooseOption(page, 'CYTOMETER', 'BD LSR II')
  await chooseOption(page, 'DETECTOR CONFIGURATION', 'BD LSR II: 6B-6V-2UV-4R')
  await page.getByRole('button', { name: 'Build panel' }).click()
  await expect(page.getByLabel('Panel name')).toBeVisible()

  await selectFluorophore(page, 0, 'FITC')
  await selectFluorophore(page, 1, 'PE')
  await selectFluorophore(page, 2, 'APC')
  await expect(page.getByRole('img', { name: 'Combined detector responses' })).toBeVisible()

  await page.getByRole('button', { name: 'Open panel wizard' }).click()
  const wizard = page.getByRole('dialog', { name: 'Panel wizard' })
  await expect(wizard.getByRole('spinbutton', { name: 'Panel size', exact: true })).toHaveAttribute('max', '18')
})

test('adapts the workspace and wizard to CytoFLEX LX 19-detector', async ({ page }) => {
  await page.goto(APP_PATH)
  await chooseOption(page, 'CYTOMETER', 'Beckman Coulter CytoFLEX LX')
  await chooseOption(page, 'DETECTOR CONFIGURATION', 'Beckman Coulter CytoFLEX LX: UV3-V5-B3-Y5-R3-I0')
  await page.getByRole('button', { name: 'Build panel' }).click()
  await expect(page.getByLabel('Panel name')).toBeVisible()

  await selectFluorophore(page, 0, 'FITC')
  await selectFluorophore(page, 1, 'PE')
  await selectFluorophore(page, 2, 'APC')
  await expect(page.getByRole('img', { name: 'Combined detector responses' })).toBeVisible()

  await page.getByRole('button', { name: 'Open panel wizard' }).click()
  const wizard = page.getByRole('dialog', { name: 'Panel wizard' })
  await expect(wizard.getByRole('spinbutton', { name: 'Panel size', exact: true })).toHaveAttribute('max', '19')
})

test('adapts the workspace and wizard to Beckman Coulter Navios 8-color', async ({ page }) => {
  await page.goto(APP_PATH)
  await chooseOption(page, 'CYTOMETER', 'Beckman Coulter Navios')
  await chooseOption(page, 'DETECTOR CONFIGURATION', 'Beckman Coulter Navios: 2-laser 8-color')
  await page.getByRole('button', { name: 'Build panel' }).click()
  await expect(page.getByLabel('Panel name')).toBeVisible()

  await selectFluorophore(page, 0, 'FITC')
  await selectFluorophore(page, 1, 'PE')
  await selectFluorophore(page, 2, 'APC')
  await expect(page.getByRole('img', { name: 'Combined detector responses' })).toBeVisible()

  await page.getByRole('button', { name: 'Open panel wizard' }).click()
  const wizard = page.getByRole('dialog', { name: 'Panel wizard' })
  await expect(wizard.getByRole('spinbutton', { name: 'Panel size', exact: true })).toHaveAttribute('max', '8')
})

test('adapts the workspace and wizard to Beckman Coulter DxFLEX B5-R3-V5', async ({ page }) => {
  await page.goto(APP_PATH)
  await chooseOption(page, 'CYTOMETER', 'Beckman Coulter DxFLEX')
  await chooseOption(page, 'DETECTOR CONFIGURATION', 'Beckman Coulter DxFLEX: B5-R3-V5')
  await page.getByRole('button', { name: 'Build panel' }).click()
  await expect(page.getByLabel('Panel name')).toBeVisible()

  await selectFluorophore(page, 0, 'BV421')
  await selectFluorophore(page, 1, 'FITC')
  await selectFluorophore(page, 2, 'APC')
  await expect(page.getByRole('img', { name: 'Combined detector responses' })).toBeVisible()

  await page.getByRole('button', { name: 'Open panel wizard' }).click()
  const wizard = page.getByRole('dialog', { name: 'Panel wizard' })
  await expect(wizard.getByRole('spinbutton', { name: 'Panel size', exact: true })).toHaveAttribute('max', '13')
})

test('adapts the workspace and wizard to the documented FACSAria Fusion BUV configuration', async ({ page }) => {
  await page.goto(APP_PATH)
  await chooseOption(page, 'CYTOMETER', 'BD FACSAria Fusion')
  await chooseOption(page, 'DETECTOR CONFIGURATION', 'BD FACSAria Fusion: BUV-optimized facility configuration')
  await page.getByRole('button', { name: 'Build panel' }).click()
  await expect(page.getByLabel('Panel name')).toBeVisible()

  await selectFluorophore(page, 0, 'BUV395')
  await selectFluorophore(page, 1, 'FITC')
  await selectFluorophore(page, 2, 'APC')
  await expect(page.getByRole('img', { name: 'Combined detector responses' })).toBeVisible()

  await page.getByRole('button', { name: 'Open panel wizard' }).click()
  const wizard = page.getByRole('dialog', { name: 'Panel wizard' })
  await expect(wizard.getByRole('spinbutton', { name: 'Panel size', exact: true })).toHaveAttribute('max', '18')
})

test('migrates the previous single active autosave into the named panel library', async ({ page }) => {
  await page.goto(APP_PATH)
  await expect(page.getByRole('form', { name: 'Panel configuration' })).toBeVisible()
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('openpanel', 1)
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('projects')) {
          request.result.createObjectStore('projects')
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('projects', 'readwrite')
      transaction.objectStore('projects').put({
        cytometer: 'aurora',
        configuration: '5l_uv_v_b_yg_r',
        slots: ['Alexa Fluor 488', ...Array(17).fill('')],
        markers: { 0: 'CD3' },
        tab: 'similarity',
        theme: 'dark',
        sidebarWidth: 260,
        sidebarCollapsed: false,
        plotScale: 40,
      }, 'active')
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
    db.close()
  })

  await page.reload()
  await expect(page.locator('.launch-screen')).toBeVisible()
  await page.getByRole('button', { name: 'Open Recovered panel' }).click()
  await expect(page.getByLabel('Panel name')).toBeVisible()
  await expect(page.getByLabel('Panel name')).toHaveValue('Recovered panel')
  await expect(page.locator('.panel-sidebar-color-count')).toHaveText('(1 color)')
  await expect(page.getByRole('button', { name: 'SIMILARITY', exact: true })).toHaveClass(/active/)
  const migratedSpectrumWidth = (await page.getByRole('img', { name: 'Combined spectra' }).boundingBox())!.width
  const migratedSpectrumContainerWidth = await page.locator('.top-spectrum').evaluate((element) => {
    const style = getComputedStyle(element)
    return element.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight)
  })
  expect(migratedSpectrumWidth).toBeCloseTo(migratedSpectrumContainerWidth, 0)
  await page.getByRole('button', { name: 'Open panel library' }).click()
  await expect(page.getByRole('button', { name: 'Open Recovered panel' })).toContainText('1 color')
})

test('manages saved panels from the OpenSketch-style project library and context menu', async ({ page }) => {
  await page.goto(APP_PATH)
  await page.getByLabel('Panel name').fill('Archive me')
  await openEmptyPanel(page)
  await selectFluorophore(page, 0, 'PE')
  await page.getByRole('button', { name: 'Open panel library' }).click()

  const projectCard = page.locator('.panel-library-card').filter({
    has: page.getByRole('button', { name: 'Open Archive me' }),
  })
  await projectCard.click({ button: 'right' })
  await expect(page.getByRole('menu', { name: 'Archive me actions' })).toBeVisible()

  page.once('dialog', (dialog) => dialog.accept('Renamed panel'))
  await page.getByRole('menuitem', { name: 'Rename' }).click()
  await expect(page.getByRole('button', { name: 'Open Renamed panel' })).toBeVisible()

  const renamedCard = page.locator('.panel-library-card').filter({
    has: page.getByRole('button', { name: 'Open Renamed panel' }),
  })
  await renamedCard.click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Archive' }).click()
  await expect(page.locator('.panel-library > .panel-library-list')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Archived' })).toContainText('1')

  await page.reload()
  await expect(page.getByRole('form', { name: 'Panel configuration' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Open Recovered panel' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Archived' }).click()
  await expect(page.getByRole('button', { name: 'Open Renamed panel' })).toBeVisible()

  const archivedCard = page.locator('.panel-library-card').filter({
    has: page.getByRole('button', { name: 'Open Renamed panel' }),
  })
  await archivedCard.click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Restore' }).click()
  await expect(page.getByRole('button', { name: 'Open Renamed panel' })).toBeVisible()

  const restoredCard = page.locator('.panel-library-card').filter({
    has: page.getByRole('button', { name: 'Open Renamed panel' }),
  })
  await restoredCard.click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Duplicate' }).click()
  await expect(page.getByRole('button', { name: 'Open Renamed panel copy' })).toBeVisible()

  const copiedCard = page.locator('.panel-library-card').filter({
    has: page.getByRole('button', { name: 'Open Renamed panel copy' }),
  })
  await copiedCard.click({ button: 'right' })
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('menuitem', { name: 'Delete' }).click()
  await expect(page.getByRole('button', { name: 'Open Renamed panel copy' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Open Renamed panel' })).toBeVisible()
})

test('keeps independent panel workspaces for each cytometer', async ({ page }) => {
  test.slow()
  await page.goto(APP_PATH)
  await page.getByLabel('Panel name').fill('Aurora panel')
  await openEmptyPanel(page)

  await selectFluorophore(page, 0, 'PE')
  await page.locator('.matrix-marker-input').first().fill('CD3')
  await expect(page.locator('.panel-sidebar-color-count')).toHaveText('(1 color)')
  await page.waitForTimeout(650)
  await page.getByRole('button', { name: 'Open panel library' }).click()
  await expect(page.getByRole('form', { name: 'Panel configuration' })).toBeVisible()

  await page.getByLabel('Panel name').fill('Sony panel')
  await openEmptyPanel(page, 'Sony ID7000', 'ID7000 5L: UV/V/B/YG/R')
  await selectFluorophore(page, 0, 'APC')
  await page.locator('.matrix-marker-input').first().fill('CD19')
  await expect(page.locator('.panel-sidebar-color-count')).toHaveText('(1 color)')
  await page.waitForTimeout(650)
  await page.getByRole('button', { name: 'Open panel library' }).click()
  await expect(page.getByRole('button', { name: 'Open Sony panel' })).toBeVisible()

  await page.getByRole('button', { name: 'Open Aurora panel' }).click()
  await expect(page.locator('.panel-sidebar-color-count')).toHaveText('(1 color)')
  await expect(page.getByPlaceholder('Select fluorophore').first()).toHaveValue('PE')
  await expect(page.locator('.matrix-marker-input').first()).toHaveValue('CD3')
  await expect(page.getByRole('combobox', { name: 'Cytometer' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Open panel library' }).click()
  await page.getByRole('button', { name: 'Open Sony panel' }).click()

  await page.reload()
  await expect(page.getByPlaceholder('Select fluorophore').first()).toHaveValue('APC')
  await expect(page.locator('.matrix-marker-input').first()).toHaveValue('CD19')
})

test('runs representative panel, import, export, and project round-trip workflows locally', async ({ page }) => {
  const remoteRequests: string[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.origin !== 'http://127.0.0.1:4173') remoteRequests.push(request.url())
  })

  await page.goto(APP_PATH)
  await expect(page).toHaveTitle(/OpenPanel/)
  await expect(page.getByRole('combobox', { name: 'CYTOMETER' })).toContainText('Select cytometer')
  await expect(page.getByRole('combobox', { name: 'DETECTOR CONFIGURATION' })).toContainText(
    'Select configuration',
  )
  await openEmptyPanel(page)

  await selectFluorophore(page, 0, 'Alexa Fluor 488')
  await selectFluorophore(page, 1, 'Alexa Fluor 647')
  await expect(page.locator('.panel-sidebar-color-count')).toHaveText('(2 colors)')
  await expect(page.locator('.complexity-badge')).toContainText('1.02')

  await page.locator('.matrix-marker-input').first().fill('CD3')
  await page.getByRole('button', { name: 'SIMILARITY', exact: true }).click()
  await expect(page.locator('.similarity-table')).toContainText('Alexa Fluor 488')
  await expect(page.locator('.similarity-table')).toContainText('Alexa Fluor 647')
  const sunsetCellColor = await page.locator('.similarity-table tr').nth(1).locator('td').first().evaluate((cell) => (
    getComputedStyle(cell).backgroundColor
  ))
  const sunsetRgb = sunsetCellColor.match(/[\d.]+/g)?.slice(0, 3).map(Number) || []
  expect(sunsetRgb).toHaveLength(3)
  expect(sunsetRgb[0]).toBeGreaterThan(sunsetRgb[2])
  expect(Math.round(await page.locator('.file-action-trigger svg').first().evaluate((icon) => (
    icon.getBoundingClientRect().width
  )))).toBe(16)
  await expect(page.locator('.file-action-groups')).toHaveCSS('border-top-width', '0px')

  const csvDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  await expect(page.getByRole('menu', { name: 'Export options' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: /Export project/ })).toBeVisible()
  await page.getByRole('menuitem', { name: /Export panel/ }).click()
  const downloadedCsv = await csvDownload
  expect(downloadedCsv.suggestedFilename()).toBe('spectreasy_aurora_5l_uv_v_b_yg_r_panel.csv')
  const csvStream = await downloadedCsv.createReadStream()
  let csv = ''
  for await (const chunk of csvStream) csv += chunk.toString()
  expect(csv).toContain('"Marker","Fluorophore"')
  expect(csv).toContain('"CD3","Alexa Fluor 488"')

  await page.getByLabel('Panel name').fill('T cell panel')
  const projectDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  await page.getByRole('menuitem', { name: /Export project/ }).click()
  const downloadedProject = await projectDownload
  expect(downloadedProject.suggestedFilename()).toBe('T cell panel_OpenPanel.json')
  const projectStream = await downloadedProject.createReadStream()
  let projectText = ''
  for await (const chunk of projectStream) projectText += chunk.toString()
  const project = JSON.parse(projectText) as {
    kind: string
    slots: string[]
    markers: Record<string, string>
    cytometerPanels: Record<string, { slots: string[]; markers: Record<string, string> }>
  }
  expect(project.kind).toBe('OpenPanel project')
  expect(project.slots.slice(0, 2)).toEqual(['Alexa Fluor 488', 'Alexa Fluor 647'])
  expect(project.markers['0']).toBe('CD3')
  expect(project.cytometerPanels.aurora.slots.slice(0, 2)).toEqual(['Alexa Fluor 488', 'Alexa Fluor 647'])
  expect(project.cytometerPanels.aurora.markers['0']).toBe('CD3')

  await page.getByRole('button', { name: 'Remove fluorophore row' }).first().click()
  await page.getByRole('button', { name: 'Remove fluorophore row' }).first().click()
  await expect(page.locator('.panel-sidebar-color-count')).toHaveText('(0 colors)')
  await page.getByRole('button', { name: 'Import', exact: true }).click()
  await expect(page.getByRole('menuitem', { name: /Import panel/ })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: /Import project/ })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.locator('input[accept*=".openpanel.json"]').setInputFiles({
    name: 'roundtrip.openpanel.json',
    mimeType: 'application/json',
    buffer: Buffer.from(projectText),
  })
  await expect(page.locator('.panel-sidebar-color-count')).toHaveText('(2 colors)')
  await page.getByRole('button', { name: 'PANEL', exact: true }).click()
  await expect(page.locator('.matrix-marker-input').first()).toHaveValue('CD3')

  await page.locator('input[accept^=".csv"]').setInputFiles({
    name: 'panel.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Marker,Fluorophore\nCD4,Alexa Fluor 488\nCD8,Alexa Fluor 532\n'),
  })
  await expect(page.locator('.panel-sidebar-color-count')).toHaveText('(2 colors)')
  await expect(page.locator('.matrix-marker-input').first()).toHaveValue('CD4')

  const pdfDownload = page.waitForEvent('download')
  await page.getByTitle('Export overview PDF').click()
  await page.getByRole('button', { name: 'Generate PDF' }).click()
  const downloadedPdf = await pdfDownload
  expect(downloadedPdf.suggestedFilename()).toMatch(/panel_overview\.pdf$/)

  expect(remoteRequests).toEqual([])
})

test('completes a panel through the staged marker wizard', async ({ page }) => {
  test.slow()
  await page.goto(APP_PATH)
  await openEmptyPanel(page)

  await selectFluorophore(page, 0, 'Alexa Fluor 488')
  await expect(page.locator('.panel-sidebar-color-count')).toHaveText('(1 color)')
  await page.getByRole('button', { name: 'Remove fluorophore row' }).nth(1).click()
  await expect(page.getByPlaceholder('Select fluorophore')).toHaveCount(17)
  await expect(page.locator('.panel-sidebar-color-count')).toHaveText('(1 color)')
  await page.getByRole('button', { name: 'Remove fluorophore row' }).nth(1).click()
  await expect(page.getByPlaceholder('Select fluorophore')).toHaveCount(16)

  await page.getByRole('button', { name: 'Open panel wizard' }).click()

  const wizard = page.getByRole('dialog', { name: 'Panel wizard' })
  await expect(wizard).toBeVisible()
  await expect(wizard.locator('.wizard-title p')).toHaveText('Aurora · 5L-UV-V-B-YG-R')
  const panelSizeInput = page.getByRole('spinbutton', { name: 'Panel size', exact: true })
  await expect(panelSizeInput).toHaveValue('16')
  await expect(page.getByText('Desired panel size', { exact: true })).toHaveCount(0)
  await expect(wizard.getByText('colors', { exact: true })).toHaveCount(0)
  const decreasePanelSize = page.getByRole('button', { name: 'Decrease panel size' })
  const increasePanelSize = page.getByRole('button', { name: 'Increase panel size' })
  await expect(decreasePanelSize).toBeVisible()
  await expect(increasePanelSize).toBeVisible()
  await decreasePanelSize.click()
  await expect(panelSizeInput).toHaveValue('15')
  await increasePanelSize.click()
  await expect(panelSizeInput).toHaveValue('16')
  await expect(page.getByRole('combobox', { name: 'Marker 1 name' })).toContainText('Select marker')
  const recommendationsTab = page.getByRole('button', { name: /Recommendations/ })
  await expect(recommendationsTab).toBeDisabled()
  await expect(page.getByLabel('Marker setup complete')).toHaveCount(0)
  const markerSelectStyle = await page.getByRole('combobox', { name: 'Marker 1 name' }).evaluate((trigger) => {
    const style = getComputedStyle(trigger)
    return { borderRadius: style.borderRadius, paddingLeft: style.paddingLeft }
  })

  await page.getByRole('button', { name: 'Close panel wizard' }).click()
  await page.getByRole('button', { name: 'Open panel library' }).click()
  await chooseOption(page, 'CYTOMETER', 'Cytek Aurora')
  await chooseOption(page, 'DETECTOR CONFIGURATION', 'Aurora 5L: UV/V/B/YG/R')
  await page.getByRole('button', { name: 'Use OMIP' }).click()
  const templateDialog = page.getByRole('dialog', { name: 'OMIP Library' })
  await expect(templateDialog).toBeVisible()
  await page.locator('.omip-library-backdrop').click({ position: { x: 20, y: 20 } })
  await expect(templateDialog).toBeHidden()
  await page.getByRole('button', { name: 'Use OMIP' }).click()
  await expect(templateDialog).toBeVisible()
  await expect(templateDialog.getByText(/of 121 panels/)).toHaveCount(0)
  await expect(templateDialog.getByRole('link', { name: 'Browse database' })).toHaveAttribute(
    'href',
    'https://isac-net.org/omip-and-flow-repository-database/',
  )
  await expect(templateDialog.getByRole('button', { name: /^Preview OMIP-/ })).toHaveCount(23)
  await expect(templateDialog.getByRole('button', { name: 'Preview OMIP-111' })).toContainText('Sony ID7000')
  await templateDialog.evaluate(async (dialog) => {
    await Promise.all(dialog.getAnimations().map((animation) => animation.finished))
  })
  const libraryHeight = await templateDialog.evaluate((dialog) => dialog.getBoundingClientRect().height)
  const templateSearch = templateDialog.getByRole('searchbox', { name: 'Search OMIP Library' })
  const libraryTypography = await templateDialog.evaluate((dialog) => {
    const fontSize = (selector: string) => Number.parseFloat(
      getComputedStyle(dialog.querySelector<HTMLElement>(selector)!).fontSize,
    )
    return {
      search: fontSize('.omip-library-search input'),
      databaseLink: fontSize('.omip-library-tools > a'),
      filterLabel: fontSize('.omip-library-filter > span:not(.ui-select-label-hidden)'),
      filterValue: fontSize('.omip-library-filter .ui-select-trigger'),
    }
  })
  expect(libraryTypography).toEqual({
    search: 16.5,
    databaseLink: 13.5,
    filterLabel: 10.5,
    filterValue: 13.5,
  })
  await expect(templateDialog.getByRole('combobox', { name: 'Method' })).toHaveCount(0)
  await chooseOption(page, 'Cell type', 'Platelets')
  expect(await templateDialog.getByRole('button', { name: 'Clear' }).evaluate((button) => (
    Number.parseFloat(getComputedStyle(button).fontSize)
  ))).toBe(13.5)
  await expect(templateDialog.getByRole('button', { name: 'Preview OMIP-097' })).toBeVisible()
  await expect(templateDialog.getByRole('button', { name: 'Preview OMIP-118' })).toHaveCount(0)
  await chooseOption(page, 'Cell type', 'All cell types')
  await templateSearch.fill('OMIP-120')
  await expect(templateDialog.getByRole('button', { name: /^Preview OMIP-/ })).toHaveCount(1)
  expect(Math.abs(await templateDialog.evaluate((dialog) => (
    dialog.getBoundingClientRect().height
  )) - libraryHeight)).toBeLessThan(1)
  await templateDialog.getByRole('button', { name: 'Preview OMIP-120' }).click()
  const previewDialog = page.getByRole('dialog', { name: 'OMIP-120' })
  await expect(previewDialog).toBeVisible()
  await expect(page.getByRole('link', { name: 'Open OMIP database' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'View paper' })).toHaveAttribute(
    'href',
    'https://pubmed.ncbi.nlm.nih.gov/42230532/',
  )
  const previewTypography = await previewDialog.evaluate((dialog) => {
    const fontSize = (selector: string) => Number.parseFloat(
      getComputedStyle(dialog.querySelector<HTMLElement>(selector)!).fontSize,
    )
    return {
      title: fontSize('.omip-library-overview p'),
      paperLink: fontSize('.omip-library-overview a'),
      cardLabel: fontSize('.omip-library-overview dt'),
      cardValue: fontSize('.omip-library-overview dd'),
      tableHeader: fontSize('.omip-library-table th'),
      tableCell: fontSize('.omip-library-table td'),
      markerCount: fontSize('footer > span'),
      action: fontSize('.omip-library-primary'),
    }
  })
  expect(previewTypography).toEqual({
    title: 18,
    paperLink: 15,
    cardLabel: 10.5,
    cardValue: 15,
    tableHeader: 12,
    tableCell: 15,
    markerCount: 13.5,
    action: 15,
  })
  await expect(page.locator('.omip-library-table tbody tr')).toHaveCount(22)
  await expect(page.getByRole('button', { name: 'Create panel from OMIP' })).toBeEnabled()
  await page.getByRole('button', { name: 'Back to OMIP Library' }).click()
  await templateSearch.fill('OMIP-097')
  await templateDialog.getByRole('button', { name: 'Preview OMIP-097' }).click()
  await expect(page.getByRole('dialog', { name: 'OMIP-097' })).toBeVisible()
  await expect(page.locator('.omip-library-table tbody tr')).toHaveCount(16)
  await expect(page.getByRole('link', { name: 'View paper' })).toHaveAttribute(
    'href',
    'https://pubmed.ncbi.nlm.nih.gov/37786346/',
  )
  await page.getByRole('button', { name: 'Create panel from OMIP' }).click()
  await page.getByRole('alertdialog', { name: 'Warning' })
    .getByRole('button', { name: 'Use current config' }).click()
  await expect(page.getByRole('dialog', { name: 'OMIP-097' })).toHaveCount(0)
  await expect(page.getByRole('dialog', { name: 'Panel wizard' })).toHaveCount(0)
  await expect(page.getByPlaceholder('Select fluorophore')).toHaveCount(16)
  await expect(page.getByPlaceholder('Select fluorophore').first()).toHaveValue('BV711')
  await expect(page.locator('.panel-sidebar-color-count')).toHaveText('(16 colors)')
  await page.getByRole('button', { name: 'Open panel wizard' }).click()
  await expect(panelSizeInput).toHaveValue('16')
  await expect(page.getByRole('combobox', { name: 'Marker 1 name' })).toContainText('Platelet GPVI')
  await expect(page.getByRole('combobox', { name: 'Color for marker 1', exact: true })).toContainText('BV711')

  await page.getByRole('button', { name: /Co-expression/ }).click()
  await recommendationsTab.click()
  const unchangedCalculation = page.getByRole('button', { name: 'Calculate recommendations' })
  await expect(unchangedCalculation).toBeDisabled()
  await page.getByLabel('Calculation unavailable').hover()
  await expect(page.getByRole('tooltip').filter({ hasText: 'This setup already matches the project' })).toBeVisible()
  await page.getByRole('button', { name: /Marker setup/ }).click()

  await page.getByRole('button', { name: 'Clear', exact: true }).click()
  const clearConfirmation = page.getByRole('alertdialog', { name: 'Clear the panel?' })
  await expect(clearConfirmation).toBeVisible()
  await expect(page.locator('.panel-sidebar-color-count')).toHaveText('(16 colors)')
  await clearConfirmation.getByRole('button', { name: 'Cancel' }).click()
  await expect(clearConfirmation).toBeHidden()
  await page.getByRole('button', { name: 'Clear', exact: true }).click()
  await clearConfirmation.getByRole('button', { name: 'Clear panel' }).click()
  await expect(page.locator('.panel-sidebar-color-count')).toHaveText('(0 colors)')
  await expect(panelSizeInput).toHaveValue('16')
  await expect(page.getByRole('combobox', { name: 'Marker 1 name' })).toContainText('Select marker')
  await expect(page.getByRole('combobox', { name: 'Color for marker 1', exact: true })).toContainText('Auto-select')
  await expect(page.getByRole('combobox', { name: 'Antigen density for marker 1', exact: true })).toContainText('Medium')
  await expect(page.getByRole('combobox', { name: 'Color for marker 2' })).toContainText('Auto-select')
  await expect(recommendationsTab).toBeDisabled()

  await page.getByRole('button', { name: 'Close panel wizard' }).click()
  const undoButton = page.getByRole('button', { name: 'Undo last edit' })
  const redoButton = page.getByRole('button', { name: 'Redo last edit' })
  await expect(undoButton).toBeEnabled()
  await undoButton.click()
  await expect(page.locator('.panel-sidebar-color-count')).toHaveText('(16 colors)')
  await expect(redoButton).toBeEnabled()
  await redoButton.click()
  await expect(page.locator('.panel-sidebar-color-count')).toHaveText('(0 colors)')
  await page.getByRole('button', { name: 'Open panel wizard' }).click()

  await panelSizeInput.fill('6')
  for (const [index, name] of ['CD3', 'CD4', 'CD8', 'CD19', 'CD25', 'Live/Dead'].entries()) {
    await page.getByRole('combobox', { name: `Marker ${index + 1} name` }).click()
    await page.getByRole('searchbox', { name: 'Search or enter marker' }).fill(name)
    await page.getByRole('option', { name, exact: true }).click()
  }
  const originalViewport = page.viewportSize()!
  await page.setViewportSize({ ...originalViewport, height: 600 })
  const wizardTopBeforeFrequencyMenu = await wizard.evaluate((dialog) => dialog.getBoundingClientRect().top)
  const bottomFrequencyTrigger = page.getByRole('combobox', { name: 'Antigen density for marker 6' })
  const bottomFrequencyTriggerBox = await bottomFrequencyTrigger.boundingBox()
  await bottomFrequencyTrigger.click()
  const frequencyMenu = page.locator('.wizard-frequency-select-menu.is-portal')
  await expect(frequencyMenu).toBeVisible()
  const frequencyMenuBox = await frequencyMenu.boundingBox()
  expect(frequencyMenuBox).not.toBeNull()
  expect(frequencyMenuBox!.y).toBeGreaterThanOrEqual(0)
  expect(frequencyMenuBox!.y + frequencyMenuBox!.height).toBeLessThanOrEqual(
    await page.evaluate(() => window.innerHeight),
  )
  expect(frequencyMenuBox!.y + frequencyMenuBox!.height).toBeLessThanOrEqual(bottomFrequencyTriggerBox!.y)
  expect(await page.evaluate(() => window.scrollY)).toBe(0)
  expect(Math.abs(await wizard.evaluate((dialog) => (
    dialog.getBoundingClientRect().top
  )) - wizardTopBeforeFrequencyMenu)).toBeLessThan(1)
  await page.getByRole('option', { name: 'Medium', exact: true }).click()
  await page.setViewportSize(originalViewport)
  await chooseOption(page, 'Antigen density for marker 1', 'High')
  const wizardTopBeforeColorMenu = await wizard.evaluate((dialog) => dialog.getBoundingClientRect().top)
  await page.getByRole('combobox', { name: 'Color for marker 2' }).click()
  expect(await page.evaluate(() => window.scrollY)).toBe(0)
  expect(Math.abs(await wizard.evaluate((dialog) => (
    dialog.getBoundingClientRect().top
  )) - wizardTopBeforeColorMenu)).toBeLessThan(1)
  const portalMenu = page.locator('.wizard-color-select-menu.is-portal')
  await expect(portalMenu).toBeVisible()
  expect(await portalMenu.evaluate((menu) => menu.parentElement?.classList.contains('panel-builder'))).toBe(true)
  await page.getByRole('searchbox', { name: 'Search colors' }).fill('egfp')
  await expect(page.getByRole('option', { name: 'EGFP', exact: true })).toHaveCount(0)
  await page.getByRole('searchbox', { name: 'Search colors' }).fill('live dead nir')
  await expect(page.getByRole('option', { name: 'LIVE DEAD NIR', exact: true })).toHaveCount(0)
  await page.getByRole('searchbox', { name: 'Search colors' }).fill('zombie')
  await expect(page.getByRole('option', { name: /^Zombie / })).toHaveCount(0)
  await page.getByRole('searchbox', { name: 'Search colors' }).fill('fit')
  await expect(page.getByRole('option', { name: 'Alexa Fluor 488', exact: true })).toHaveCount(0)
  await page.getByRole('option', { name: 'FITC', exact: true }).click()
  await page.getByRole('combobox', { name: 'Color for marker 6' }).click()
  await page.getByRole('searchbox', { name: 'Search colors' }).fill('fitc')
  await expect(page.getByRole('option', { name: 'FITC', exact: true })).toHaveCount(0)
  await page.getByRole('searchbox', { name: 'Search colors' }).fill('pe')
  await expect(page.getByRole('option', { name: 'PE', exact: true })).toHaveCount(0)
  await page.getByRole('searchbox', { name: 'Search colors' }).fill('zombie')
  await expect(page.getByRole('option', { name: 'Zombie NIR', exact: true })).toBeVisible()
  await expect(page.getByRole('option', { name: /^Zombie / })).toHaveCount(7)
  await page.getByRole('combobox', { name: 'Color for marker 6' }).click()
  await expect(page.getByLabel('Marker setup complete')).toBeVisible()
  await expect(page.locator('.frequency-table thead th')).toHaveCount(3)
  expect(await page.locator('.frequency-table').evaluate((table) => table.getBoundingClientRect().width)).toBeLessThan(1100)
  expect(await page.getByRole('button', { name: /Marker setup/ }).evaluate((button) => (
    getComputedStyle(button).transitionDuration
  ))).not.toBe('0s')
  await expect(page.getByRole('button', { name: /Finalize/ })).toHaveCount(0)

  await page.getByRole('button', { name: /Co-expression/ }).click()
  await page.getByRole('button', { name: 'Auto-fill', exact: true }).click()
  const autofillDialog = page.getByRole('dialog', { name: 'Auto-fill co-expression' })
  await expect(autofillDialog).toBeVisible()
  await expect(autofillDialog.locator('.wizard-context-select')).toHaveCount(4)
  const contextSelectStyle = await autofillDialog.getByRole('combobox', { name: 'Species' }).evaluate((trigger) => {
    const style = getComputedStyle(trigger)
    return { borderRadius: style.borderRadius, paddingLeft: style.paddingLeft }
  })
  expect(contextSelectStyle.borderRadius).toBe(markerSelectStyle.borderRadius)
  expect(Number.parseFloat(contextSelectStyle.paddingLeft)).toBeGreaterThan(
    Number.parseFloat(markerSelectStyle.paddingLeft),
  )
  await autofillDialog.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(page.getByLabel('Co-expression complete')).toHaveCount(0)
  await expect(page.locator('.coexpression-cell')).toHaveCount(15)
  expect(Math.round(await page.locator('.coexpression-matrix thead th').first().evaluate((cell) => (
    cell.getBoundingClientRect().width
  )))).toBe(87)
  expect(Math.round(await page.locator('.coexpression-matrix td').first().evaluate((cell) => (
    cell.getBoundingClientRect().width
  )))).toBe(46)
  expect(Math.round(await page.locator('.coexpression-matrix tbody tr').first().evaluate((row) => (
    row.getBoundingClientRect().height
  )))).toBe(44)
  await expect(page.locator('.coexpression-matrix tbody th').first()).toHaveText('CD3')
  const noneLegend = wizard.locator('.coexpression-legend .level-0')
  expect(Math.round(await noneLegend.evaluate((swatch) => swatch.getBoundingClientRect().width))).toBe(16)
  await expect(noneLegend).toHaveCSS('background-color', 'rgb(204, 213, 209)')
  await page.getByRole('button', { name: 'Toggle theme' }).evaluate((button) => (button as HTMLButtonElement).click())
  await expect(noneLegend).toHaveCSS('background-color', 'rgb(89, 102, 96)')
  await page.getByRole('button', { name: 'Toggle theme' }).evaluate((button) => (button as HTMLButtonElement).click())
  await page.getByRole('button', { name: 'CD3 and CD4 co-expression: Medium' }).click()
  await expect(page.getByRole('button', { name: 'CD3 and CD4 co-expression: High' })).toBeVisible()
  await expect(recommendationsTab).toBeEnabled()
  await recommendationsTab.click()
  await expect(page.getByLabel('Co-expression complete')).toBeVisible()
  await expect(page.getByLabel('Recommendations complete')).toHaveCount(0)

  await page.getByRole('button', { name: 'Calculate recommendations' }).click()
  const primaryRecommendations = page.locator('.primary-recommendation-table')
  await expect(primaryRecommendations.locator('tbody tr')).toHaveCount(6, { timeout: 60_000 })
  await expect(primaryRecommendations.getByRole('columnheader', { name: '#' })).toHaveCount(0)
  await expect(primaryRecommendations.getByRole('columnheader', { name: 'Brightness' })).toBeVisible()
  const existingRow = primaryRecommendations.locator('tbody tr').first()
  await expect(existingRow).toHaveClass(/is-existing/)
  await expect(existingRow.locator('.marker-color-pair')).toContainText('CD4')
  await expect(existingRow.locator('.marker-color-pair')).toContainText('FITC')
  await expect(existingRow.getByRole('img', { name: 'Brightness 3 of 5' })).toBeVisible()
  await expect(existingRow.locator('.brightness-dot.is-filled')).toHaveCount(3)
  await expect(page.getByLabel('Recommendations complete')).toBeVisible()
  await expect(primaryRecommendations.getByRole('columnheader', { name: 'Spectral fit' })).toHaveCount(0)
  await expect(primaryRecommendations.locator('tbody tr').first().locator('.score-pill')).toHaveCount(0)
  await expect(primaryRecommendations.locator('tbody tr').first().locator('.availability-tier')).toHaveCount(0)
  await expect(primaryRecommendations.locator('tbody tr').first().locator('.marker-color-pair strong')).toHaveCount(2)
  await expect(primaryRecommendations.locator('tbody tr').first().locator('.conflict-pair')).toContainText(/\d\.\d{2}/)
  await expect(primaryRecommendations.locator('tbody tr').first()).not.toContainText(/frequency|\/100|Curated|Estimated/)
  await page.getByRole('button', { name: 'How recommendation score is calculated' }).focus()
  await expect(page.getByRole('tooltip').filter({ hasText: 'availability is weighted most strongly' })).toBeVisible()
  expect(await page.getByRole('tooltip').filter({ hasText: 'availability is weighted most strongly' }).evaluate((tooltip) => (
    Number.parseFloat(getComputedStyle(tooltip).fontSize)
  ))).toBeGreaterThanOrEqual(16)
  await page.getByRole('button', { name: 'About panel wizard calculations' }).focus()
  await expect(page.getByRole('tooltip').filter({ hasText: 'use antigen density' })).toBeVisible()
  await expect(page.locator('.wizard-alternatives')).toContainText('Other fluorophores')
  await page.locator('.wizard-alternatives summary').click()
  const primaryHeaders = await primaryRecommendations.locator('thead th').allTextContents()
  const alternativeHeaders = await page.locator('.alternative-table thead th').allTextContents()
  expect(alternativeHeaders.map((value) => value.trim())).toEqual(primaryHeaders.map((value) => value.trim()))
  await expect(page.locator('.alternative-table tbody tr').first()).not.toContainText('Unassigned')
  await expect(page.locator('.alternative-table').getByRole('img', { name: 'Brightness unavailable' }).first()).toBeVisible()
  await chooseOption(page, 'Sort ranked colors', 'Availability')
  await expect(primaryRecommendations.locator('tbody tr').first()).toHaveClass(/is-existing/)
  await expect(primaryRecommendations.locator('tbody tr').first()).toContainText('FITC')
  await page.getByRole('button', { name: 'Best spectral fit' }).click()
  await expect(page.locator('.result-mode button.active')).toHaveText('Best spectral fit')

  await page.getByRole('button', { name: 'Close panel wizard' }).click()
  const wizardProjectDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  await page.getByRole('menuitem', { name: /Export project/ }).click()
  const wizardProjectFile = await wizardProjectDownload
  const wizardProjectStream = await wizardProjectFile.createReadStream()
  let wizardProjectText = ''
  for await (const chunk of wizardProjectStream) wizardProjectText += chunk.toString()
  const wizardProject = JSON.parse(wizardProjectText) as {
    wizard: {
      desiredSize: number
      markers: Array<{ name: string; antigenDensity: string; currentFluorophore: string }>
      coexpression: Record<string, number>
      coexpressionVisited: boolean
      coexpressionCompleted: boolean
      activeTab: string
      results: unknown
      resultMode: string
      resultSort: string
    }
  }
  expect(wizardProject.wizard.desiredSize).toBe(6)
  expect(wizardProject.wizard.markers[0]).toMatchObject({
    name: 'CD3',
    antigenDensity: 'high',
    currentFluorophore: '',
  })
  expect(wizardProject.wizard.markers[1]).toMatchObject({
    antigenDensity: 'medium',
    currentFluorophore: 'FITC',
  })
  expect(wizardProject.wizard.coexpression['marker-0::marker-1']).toBe(3)
  expect(wizardProject.wizard.coexpressionVisited).toBe(true)
  expect(wizardProject.wizard.coexpressionCompleted).toBe(true)
  expect(wizardProject.wizard.activeTab).toBe('recommendations')
  expect(wizardProject.wizard.results).not.toBeNull()
  expect(wizardProject.wizard.resultMode).toBe('bestFit')
  expect(wizardProject.wizard.resultSort).toBe('availability')

  await page.getByRole('button', { name: 'Open panel wizard' }).click()
  await expect(page.locator('.wizard-tabs button.active')).toContainText('Recommendations')
  await expect(page.locator('.primary-recommendation-table tbody tr')).toHaveCount(6)
  await page.getByRole('button', { name: 'Apply 6-color panel' }).click()
  await expect(wizard).toHaveCount(0)
  await expect(page.getByPlaceholder('Select fluorophore')).toHaveCount(6)
  await expect(page.getByPlaceholder('Select fluorophore').first()).not.toHaveValue('')
  await expect(page.locator('.panel-sidebar-color-count')).toHaveText('(6 colors)')
  expect(await page.locator('.matrix-marker-input').evaluateAll((inputs) => (
    inputs.some((input) => (input as HTMLInputElement).value === 'CD3')
  ))).toBe(true)
  await page.waitForTimeout(650)
  await page.reload()
  await expect(page.getByPlaceholder('Select fluorophore')).toHaveCount(6)
  await expect(page.locator('.panel-sidebar-color-count')).toHaveText('(6 colors)')
  expect(await page.locator('.matrix-marker-input').evaluateAll((inputs) => (
    inputs.some((input) => (input as HTMLInputElement).value === 'CD3')
  ))).toBe(true)
  await page.getByRole('button', { name: 'Open panel wizard' }).click()
  await expect(page.locator('.wizard-tabs button.active')).toContainText('Recommendations')
  await expect(page.locator('.primary-recommendation-table tbody tr')).toHaveCount(6)
  await page.getByRole('button', { name: 'Close panel wizard' }).click()
})

test('reopens the complete application offline after the first load', async ({ page, context }) => {
  await page.goto(APP_PATH)
  await expect(page.getByRole('form', { name: 'Panel configuration' })).toBeVisible()
  await openEmptyPanel(page)
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>((resolve) => {
        navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true })
      })
    }
  })

  await context.setOffline(true)
  try {
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByLabel('Panel name')).toBeVisible()
    await expect(page.locator('.panel-sidebar-color-count')).toHaveText('(0 colors)')
    await expect(page.getByPlaceholder('Select fluorophore').first()).toBeVisible()
  } finally {
    await context.setOffline(false)
  }
})
