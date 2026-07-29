import { expect, test } from '@playwright/test'

const APP_PATH = '/OpenPanel/'

async function selectFluorophore(page: import('@playwright/test').Page, slot: number, name: string) {
  const input = page.getByPlaceholder('Select fluorophore').nth(slot)
  await input.fill(name)
  await input.press('Enter')
}

async function openEmptyPanel(page: import('@playwright/test').Page) {
  await expect(page.getByRole('form', { name: 'Panel configuration' })).toBeVisible()
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

test('selects the instrument and configuration before opening a clean workspace', async ({ page }) => {
  await page.goto(APP_PATH)
  await page.getByLabel('Panel name').fill('T-cell panel')
  await page.getByRole('button', { name: 'Use dark mode' }).click()
  await expect(page.locator('.launch-screen')).toHaveClass(/dark/)
  await page.getByRole('combobox', { name: 'CYTOMETER' }).focus()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('combobox', { name: 'CYTOMETER' })).toContainText('BD FACSDiscover')
  await chooseOption(page, 'CYTOMETER', 'Thermo Fisher Attune Xenith')
  await expect(page.getByRole('combobox', { name: 'DETECTOR CONFIGURATION' })).toHaveCount(0)
  await expect(page.getByText('Detector layout', { exact: true })).toHaveCount(0)
  await chooseOption(page, 'CYTOMETER', 'Sony ID7000')
  await expect(page.getByRole('combobox', { name: 'DETECTOR CONFIGURATION' })).toContainText('ID7000 5L')
  await chooseOption(page, 'DETECTOR CONFIGURATION', 'ID7000 4L: V/B/YG/R')
  await openEmptyPanel(page)
  await expect(page.locator('.panel-builder')).toHaveClass(/dark/)
  await expect(page.locator('.configuration-sidebar-select .ui-select-trigger')).toContainText('ID7000 4L: V/B/YG/R')
  await expect(page.getByPlaceholder('Select fluorophore')).toHaveCount(18)
  await expect(page.getByPlaceholder('Select fluorophore').first()).toHaveValue('')
  await expect(page.getByLabel('Panel name')).toHaveValue('T-cell panel')
  const editorCytometer = page.getByRole('combobox', { name: 'Cytometer' })
  await expect(editorCytometer).toBeVisible()
  await expect(page.locator('.panel-sidebar-head select')).toHaveCount(0)
  expect(await editorCytometer.evaluate((element) => getComputedStyle(element).fontSize)).toBe('14px')
  expect(await editorCytometer.evaluate((element) => getComputedStyle(element).borderTopStyle)).toBe('solid')
  expect(await editorCytometer.evaluate((element) => getComputedStyle(element).borderTopWidth)).toBe('1px')
  const editorConfiguration = page.getByRole('combobox', { name: 'Detector configuration' })
  expect(await editorConfiguration.evaluate((element) => getComputedStyle(element).fontSize)).toBe('14px')
  expect(await editorConfiguration.evaluate((element) => getComputedStyle(element).borderTopStyle)).toBe('solid')
  expect(await editorConfiguration.evaluate((element) => getComputedStyle(element).borderTopWidth)).toBe('1px')
  expect(await page.getByRole('button', { name: 'PANEL MATRIX' }).evaluate((element) => getComputedStyle(element).fontSize)).toBe('12px')
  await editorCytometer.click()
  await expect(page.getByRole('listbox', { name: 'Cytometer' })).toBeVisible()
  await expect(page.getByRole('option', { name: 'Sony ID7000' })).toBeVisible()
  await page.keyboard.press('Escape')
  const spectrum = page.getByRole('img', { name: 'Combined spectral signatures' })
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
  await page.getByRole('button', { name: 'SIGNATURES' }).click()
  const signature = page.getByRole('img', { name: 'Alexa Fluor 488 signature' })
  await expect(signature).toBeVisible()
  await page.waitForTimeout(220)
  const signatureBox = await signature.boundingBox()
  const signatureContentWidth = await page.locator('.signature-card').evaluate((element) => {
    const style = getComputedStyle(element)
    return element.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight)
  })
  expect(signatureBox!.width).toBeCloseTo(signatureContentWidth, 0)
  const anchoredTabsY = (await page.locator('.tabs-bar').boundingBox())!.y
  await page.getByRole('button', { name: 'SIMILARITY MATRIX' }).click()
  expect((await page.locator('.tabs-bar').boundingBox())!.y).toBeCloseTo(anchoredTabsY, 0)
  await page.getByRole('button', { name: 'PANEL MATRIX' }).click()
  expect((await page.locator('.tabs-bar').boundingBox())!.y).toBeCloseTo(anchoredTabsY, 0)
  await page.getByRole('button', { name: 'SIGNATURES' }).click()
  expect((await page.locator('.tabs-bar').boundingBox())!.y).toBeCloseTo(anchoredTabsY, 0)
  await page.getByRole('button', { name: 'Increase plot size' }).click()
  await page.waitForTimeout(220)
  const signatureAfterZoomBox = await signature.boundingBox()
  expect(signatureAfterZoomBox!.width).toBeCloseTo(signatureBox!.width, 0)
  expect(signatureAfterZoomBox!.height).toBeCloseTo(signatureBox!.height, 0)
  await page.getByRole('button', { name: 'Open panel library' }).click()
  await expect(page.getByRole('form', { name: 'Panel configuration' })).toBeVisible()
  const savedPanel = page.getByRole('button', { name: 'Open T-cell panel' })
  await expect(savedPanel).toContainText('1 color')
  await expect(savedPanel).toContainText('Sony ID7000')
  await expect(savedPanel).toContainText('ID7000 4L: V/B/YG/R')
  await page.getByLabel('Panel name').fill('B-cell panel')
  await openEmptyPanel(page)
  await page.getByRole('button', { name: 'Open panel library' }).click()
  await expect(page.getByRole('button', { name: 'Open B-cell panel' })).toContainText('0 colors')
  await expect(page.getByRole('button', { name: 'Open T-cell panel' })).toBeVisible()
  await savedPanel.click()
  await expect(page.locator('.panel-sidebar-color-count')).toHaveText('(1 color)')
  await page.waitForTimeout(220)
  const reopenedSpectrumBox = await page.getByRole('img', { name: 'Combined spectral signatures' }).boundingBox()
  expect(reopenedSpectrumBox!.width).toBeCloseTo(expandedBox!.width, 0)
  expect(reopenedSpectrumBox!.height).toBeCloseTo(expandedBox!.height, 0)
  await page.reload()
  await expect(page.getByLabel('Panel name')).toBeVisible()
  await expect(page.getByLabel('Panel name')).toHaveValue('T-cell panel')
  await expect(page.locator('.panel-sidebar-color-count')).toHaveText('(1 color)')
  await page.waitForTimeout(220)
  const reloadedSpectrumBox = await page.getByRole('img', { name: 'Combined spectral signatures' }).boundingBox()
  expect(reloadedSpectrumBox!.width).toBeCloseTo(expandedBox!.width, 0)
  expect(reloadedSpectrumBox!.height).toBeCloseTo(expandedBox!.height, 0)
})

test('migrates the previous single active autosave into the named panel library', async ({ page }) => {
  await page.goto(APP_PATH)
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
  await expect(page.getByLabel('Panel name')).toBeVisible()
  await expect(page.getByLabel('Panel name')).toHaveValue('Recovered panel')
  await expect(page.locator('.panel-sidebar-color-count')).toHaveText('(1 color)')
  await expect(page.getByRole('button', { name: 'SIMILARITY MATRIX' })).toHaveClass(/active/)
  const migratedSpectrumWidth = (await page.getByRole('img', { name: 'Combined spectral signatures' }).boundingBox())!.width
  const migratedSpectrumContainerWidth = await page.locator('.top-spectrum').evaluate((element) => {
    const style = getComputedStyle(element)
    return element.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight)
  })
  expect(migratedSpectrumWidth).toBeCloseTo(migratedSpectrumContainerWidth, 0)
  await page.getByRole('button', { name: 'Open panel library' }).click()
  await expect(page.getByRole('button', { name: 'Open Recovered panel' })).toContainText('1 color')
})

test('keeps independent panel workspaces for each cytometer', async ({ page }) => {
  await page.goto(APP_PATH)
  await openEmptyPanel(page)

  await selectFluorophore(page, 0, 'PE')
  await page.locator('.matrix-marker-input').first().fill('CD3')
  await expect(page.locator('.panel-sidebar-color-count')).toHaveText('(1 color)')

  await chooseOption(page, 'Cytometer', 'Sony ID7000')
  await expect(page.locator('.panel-sidebar-color-count')).toHaveText('(0 colors)')
  await expect(page.getByPlaceholder('Select fluorophore').first()).toHaveValue('')

  await selectFluorophore(page, 0, 'APC')
  await page.locator('.matrix-marker-input').first().fill('CD19')
  await expect(page.locator('.panel-sidebar-color-count')).toHaveText('(1 color)')

  await chooseOption(page, 'Cytometer', 'Cytek Aurora')
  await expect(page.locator('.panel-sidebar-color-count')).toHaveText('(1 color)')
  await expect(page.getByPlaceholder('Select fluorophore').first()).toHaveValue('PE')
  await expect(page.locator('.matrix-marker-input').first()).toHaveValue('CD3')
  await expect(page.getByRole('combobox', { name: 'Detector configuration' })).toContainText('Aurora 5L')

  await chooseOption(page, 'Cytometer', 'Sony ID7000')
  await expect(page.getByPlaceholder('Select fluorophore').first()).toHaveValue('APC')
  await expect(page.locator('.matrix-marker-input').first()).toHaveValue('CD19')
  await page.waitForTimeout(650)

  await page.reload()
  await expect(page.getByRole('combobox', { name: 'Cytometer' })).toContainText('Sony ID7000')
  await expect(page.getByPlaceholder('Select fluorophore').first()).toHaveValue('APC')
  await expect(page.locator('.matrix-marker-input').first()).toHaveValue('CD19')

  await chooseOption(page, 'Cytometer', 'Cytek Aurora')
  await expect(page.getByPlaceholder('Select fluorophore').first()).toHaveValue('PE')
  await expect(page.locator('.matrix-marker-input').first()).toHaveValue('CD3')
})

test('runs representative panel, import, export, and project round-trip workflows locally', async ({ page }) => {
  const remoteRequests: string[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.origin !== 'http://127.0.0.1:4173') remoteRequests.push(request.url())
  })

  await page.goto(APP_PATH)
  await expect(page).toHaveTitle(/OpenPanel/)
  await expect(page.getByRole('combobox', { name: 'CYTOMETER' })).toContainText('Cytek Aurora')
  await expect(page.getByRole('combobox', { name: 'DETECTOR CONFIGURATION' })).toContainText('Aurora 5L')
  await openEmptyPanel(page)

  await selectFluorophore(page, 0, 'Alexa Fluor 488')
  await selectFluorophore(page, 1, 'Alexa Fluor 647')
  await expect(page.locator('.panel-sidebar-color-count')).toHaveText('(2 colors)')
  await expect(page.locator('.complexity-badge')).toContainText('1.02')

  await page.locator('.matrix-marker-input').first().fill('CD3')
  await page.getByRole('button', { name: 'SIMILARITY MATRIX' }).click()
  await expect(page.locator('.similarity-table')).toContainText('Alexa Fluor 488')
  await expect(page.locator('.similarity-table')).toContainText('Alexa Fluor 647')
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

  await page.getByTitle('Clear selection').click()
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
  await page.getByRole('button', { name: 'PANEL MATRIX' }).click()
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
  await expect(page.getByLabel('Marker 1 name')).toHaveValue('')
  const recommendationsTab = page.getByRole('button', { name: /Recommendations/ })
  await expect(recommendationsTab).toBeDisabled()
  await expect(page.getByLabel('Marker setup complete')).toHaveCount(0)

  await panelSizeInput.fill('6')
  for (const [index, name] of ['CD3', 'CD4', 'CD8', 'CD19', 'CD25', 'Live/Dead'].entries()) {
    await page.getByLabel(`Marker ${index + 1} name`).fill(name)
  }
  await page.getByRole('combobox', { name: 'Cell type for marker 1' }).click()
  const cellTypeSearch = page.getByRole('searchbox', { name: 'Search or enter cell type' })
  await cellTypeSearch.fill('t')
  const rankedCellTypes = await page.getByRole('option').allTextContents()
  expect(rankedCellTypes.slice(0, 2).map((label) => label.trim())).toEqual([
    'T cells',
    'Tumor cells',
  ])
  await cellTypeSearch.fill('T cells')
  await page.getByRole('option', { name: 'T cells', exact: true }).click()
  await page.getByRole('combobox', { name: 'Cell type for marker 2' }).click()
  await page.getByRole('searchbox', { name: 'Search or enter cell type' }).fill('Activated lymphocytes')
  await page.getByRole('option', { name: 'Use “Activated lymphocytes”', exact: true }).click()
  await expect(page.getByRole('combobox', { name: 'Cell type for marker 2' })).toContainText('Activated lymphocytes')
  const originalViewport = page.viewportSize()!
  await page.setViewportSize({ ...originalViewport, height: 600 })
  const wizardTopBeforeFrequencyMenu = await wizard.evaluate((dialog) => dialog.getBoundingClientRect().top)
  const bottomFrequencyTrigger = page.getByRole('combobox', { name: 'Expected positive frequency for marker 6' })
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
  await chooseOption(page, 'Expected positive frequency for marker 1', 'High')
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
  await expect(page.locator('.frequency-table thead th')).toHaveCount(4)
  expect(await page.locator('.frequency-table').evaluate((table) => table.getBoundingClientRect().width)).toBeLessThan(1100)
  expect(await page.getByRole('button', { name: /Marker setup/ }).evaluate((button) => (
    getComputedStyle(button).transitionDuration
  ))).not.toBe('0s')
  await expect(page.getByRole('button', { name: /Finalize/ })).toHaveCount(0)

  await page.getByRole('button', { name: /Co-expression/ }).click()
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
  await page.getByRole('button', { name: 'CD3 and CD4 co-expression: Possible' }).click()
  await expect(page.getByRole('button', { name: 'CD3 and CD4 co-expression: Strong' })).toBeVisible()
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
  await expect(existingRow.locator('.marker-color-pair')).toContainText('CD3')
  await expect(existingRow.locator('.marker-color-pair')).toContainText('Alexa Fluor 488')
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
  await expect(page.getByRole('tooltip').filter({ hasText: 'prioritize co-expressed' })).toBeVisible()
  await expect(page.locator('.wizard-alternatives')).toContainText('Other fluorophores')
  await page.locator('.wizard-alternatives summary').click()
  const primaryHeaders = await primaryRecommendations.locator('thead th').allTextContents()
  const alternativeHeaders = await page.locator('.alternative-table thead th').allTextContents()
  expect(alternativeHeaders.map((value) => value.trim())).toEqual(primaryHeaders.map((value) => value.trim()))
  await expect(page.locator('.alternative-table tbody tr').first()).not.toContainText('Unassigned')
  await expect(page.locator('.alternative-table').getByRole('img', { name: 'Brightness unavailable' }).first()).toBeVisible()
  await chooseOption(page, 'Sort ranked colors', 'Availability')
  await expect(primaryRecommendations.locator('tbody tr').first()).toHaveClass(/is-existing/)
  await expect(primaryRecommendations.locator('tbody tr').first()).toContainText('Alexa Fluor 488')
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
      markers: Array<{ name: string; cellType: string; frequency: string; currentFluorophore: string }>
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
    cellType: 'T cells',
    frequency: 'high',
    currentFluorophore: 'Alexa Fluor 488',
  })
  expect(wizardProject.wizard.markers[1]).toMatchObject({
    cellType: 'Activated lymphocytes',
    currentFluorophore: 'FITC',
  })
  expect(wizardProject.wizard.coexpression['marker-0::marker-1']).toBe(2)
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
  await expect(page.getByPlaceholder('Select fluorophore').first()).toHaveValue('Alexa Fluor 488')
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
