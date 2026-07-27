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
  await expect(page.locator('.panel-topbar p')).toContainText('0 fluorophores selected')
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
  await expect(page.locator('.panel-topbar p')).toContainText('ID7000 4L: V/B/YG/R')
  await expect(page.getByPlaceholder('Select fluorophore')).toHaveCount(18)
  await expect(page.getByPlaceholder('Select fluorophore').first()).toHaveValue('')
  await expect(page.getByLabel('Panel name')).toHaveValue('T-cell panel')
  const editorCytometer = page.getByRole('combobox', { name: 'Cytometer' })
  await expect(editorCytometer).toBeVisible()
  await expect(page.locator('.panel-sidebar-head select')).toHaveCount(0)
  expect(await editorCytometer.evaluate((element) => getComputedStyle(element).fontSize)).toBe('10px')
  expect(await editorCytometer.evaluate((element) => getComputedStyle(element).borderTopStyle)).toBe('solid')
  expect(await editorCytometer.evaluate((element) => getComputedStyle(element).borderTopWidth)).toBe('1px')
  const editorConfiguration = page.getByRole('combobox', { name: 'Detector configuration' })
  expect(await editorConfiguration.evaluate((element) => getComputedStyle(element).borderTopStyle)).toBe('solid')
  expect(await editorConfiguration.evaluate((element) => getComputedStyle(element).borderTopWidth)).toBe('1px')
  expect(await page.getByRole('button', { name: 'PANEL MATRIX' }).evaluate((element) => getComputedStyle(element).fontSize)).toBe('12px')
  await editorCytometer.click()
  await expect(page.getByRole('listbox', { name: 'Cytometer' })).toBeVisible()
  await expect(page.getByRole('option', { name: 'Sony ID7000' })).toBeVisible()
  await page.keyboard.press('Escape')
  const spectrum = page.getByRole('img', { name: 'Combined spectral signatures' })
  const baseWidth = Number(await spectrum.getAttribute('width'))
  const baseHeight = Number(await spectrum.getAttribute('height'))
  const baseViewBox = await spectrum.getAttribute('viewBox')
  const [, , viewBoxWidth, viewBoxHeight] = String(baseViewBox).split(' ').map(Number)
  expect(baseWidth).toBe(Math.round(viewBoxWidth * 0.8))
  expect(baseHeight).toBe(Math.round(viewBoxHeight * 0.8))
  await page.getByRole('button', { name: 'Decrease plot size' }).click()
  await expect(spectrum).toHaveAttribute('width', String(Math.round(viewBoxWidth * 0.7)))
  await expect(spectrum).toHaveAttribute('height', String(Math.round(viewBoxHeight * 0.7)))
  await expect(spectrum).toHaveAttribute('viewBox', String(baseViewBox))
  await page.getByRole('button', { name: 'Increase plot size' }).click()
  await page.getByRole('button', { name: 'Increase plot size' }).click()
  const expandedWidth = Math.round(viewBoxWidth * 0.9)
  const expandedHeight = Math.round(viewBoxHeight * 0.9)
  await expect(spectrum).toHaveAttribute('width', String(expandedWidth))
  await expect(spectrum).toHaveAttribute('height', String(expandedHeight))
  await expect(spectrum).toHaveAttribute('viewBox', String(baseViewBox))
  await selectFluorophore(page, 0, 'Alexa Fluor 488')
  await page.waitForTimeout(650)
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
  await expect(page.locator('.panel-topbar p')).toContainText('1 fluorophore selected')
  await expect(page.getByRole('img', { name: 'Combined spectral signatures' })).toHaveAttribute('width', String(expandedWidth))
  await expect(page.getByRole('img', { name: 'Combined spectral signatures' })).toHaveAttribute('height', String(expandedHeight))
  await page.reload()
  await expect(page.getByLabel('Panel name')).toBeVisible()
  await expect(page.getByLabel('Panel name')).toHaveValue('T-cell panel')
  await expect(page.locator('.panel-topbar p')).toContainText('1 fluorophore selected')
  await expect(page.getByRole('img', { name: 'Combined spectral signatures' })).toHaveAttribute('width', String(expandedWidth))
  await expect(page.getByRole('img', { name: 'Combined spectral signatures' })).toHaveAttribute('height', String(expandedHeight))
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
      }, 'active')
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
    db.close()
  })

  await page.reload()
  await expect(page.getByLabel('Panel name')).toBeVisible()
  await expect(page.getByLabel('Panel name')).toHaveValue('Recovered panel')
  await expect(page.locator('.panel-topbar p')).toContainText('1 fluorophore selected')
  await expect(page.getByRole('button', { name: 'SIMILARITY MATRIX' })).toHaveClass(/active/)
  await page.getByRole('button', { name: 'Open panel library' }).click()
  await expect(page.getByRole('button', { name: 'Open Recovered panel' })).toContainText('1 color')
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
  await expect(page.locator('.panel-topbar p')).toContainText('2 fluorophores selected')
  await expect(page.locator('.complexity-badge')).toContainText('1.02')

  await page.locator('.matrix-marker-input').first().fill('CD3')
  await page.getByRole('button', { name: 'SIMILARITY MATRIX' }).click()
  await expect(page.locator('.similarity-table')).toContainText('Alexa Fluor 488')
  await expect(page.locator('.similarity-table')).toContainText('Alexa Fluor 647')

  const csvDownload = page.waitForEvent('download')
  await page.getByTitle('Export panel CSV').click()
  const downloadedCsv = await csvDownload
  expect(downloadedCsv.suggestedFilename()).toBe('spectreasy_aurora_5l_uv_v_b_yg_r_panel.csv')
  const csvStream = await downloadedCsv.createReadStream()
  let csv = ''
  for await (const chunk of csvStream) csv += chunk.toString()
  expect(csv).toContain('"Marker","Fluorophore"')
  expect(csv).toContain('"CD3","Alexa Fluor 488"')

  const projectDownload = page.waitForEvent('download')
  await page.getByTitle('Save project').click()
  const downloadedProject = await projectDownload
  const projectStream = await downloadedProject.createReadStream()
  let projectText = ''
  for await (const chunk of projectStream) projectText += chunk.toString()
  const project = JSON.parse(projectText) as { kind: string; slots: string[]; markers: Record<string, string> }
  expect(project.kind).toBe('OpenPanel project')
  expect(project.slots.slice(0, 2)).toEqual(['Alexa Fluor 488', 'Alexa Fluor 647'])
  expect(project.markers['0']).toBe('CD3')

  await page.getByTitle('Clear selection').click()
  await expect(page.locator('.panel-topbar p')).toContainText('0 fluorophores selected')
  await page.locator('input[accept*=".openpanel.json"]').setInputFiles({
    name: 'roundtrip.openpanel.json',
    mimeType: 'application/json',
    buffer: Buffer.from(projectText),
  })
  await expect(page.locator('.panel-topbar p')).toContainText('2 fluorophores selected')
  await page.getByRole('button', { name: 'PANEL MATRIX' }).click()
  await expect(page.locator('.matrix-marker-input').first()).toHaveValue('CD3')

  await page.locator('input[accept^=".csv"]').setInputFiles({
    name: 'panel.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Marker,Fluorophore\nCD4,Alexa Fluor 488\nCD8,Alexa Fluor 532\n'),
  })
  await expect(page.locator('.panel-topbar p')).toContainText('2 fluorophores selected')
  await expect(page.locator('.matrix-marker-input').first()).toHaveValue('CD4')

  const pdfDownload = page.waitForEvent('download')
  await page.getByTitle('Export overview PDF').click()
  await page.getByRole('button', { name: 'Generate PDF' }).click()
  const downloadedPdf = await pdfDownload
  expect(downloadedPdf.suggestedFilename()).toMatch(/panel_overview\.pdf$/)

  expect(remoteRequests).toEqual([])
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
    await expect(page.locator('.panel-topbar p')).toContainText('0 fluorophores selected')
    await expect(page.getByPlaceholder('Select fluorophore').first()).toBeVisible()
  } finally {
    await context.setOffline(false)
  }
})
