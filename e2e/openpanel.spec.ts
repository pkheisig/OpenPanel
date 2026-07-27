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
  await expect(page.getByRole('heading', { name: 'Spectral Panel Builder' })).toBeVisible()
  await expect(page.locator('.panel-topbar p')).toContainText('0 fluorophores selected')
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined })
    Object.defineProperty(window, 'showOpenFilePicker', { configurable: true, value: undefined })
    localStorage.setItem('spectreasy_slots', JSON.stringify(['APC', 'PE', 'FITC', 'BV421']))
    localStorage.setItem('spectreasy_markers', JSON.stringify({ 0: 'TCR', 1: 'TCR' }))
  })
})

test('selects the instrument and configuration before opening a clean workspace', async ({ page }) => {
  await page.goto(APP_PATH)
  await page.getByLabel('Cytometer').selectOption('id7000')
  await expect(page.getByLabel('Detector configuration')).toHaveValue('id7000_5l')
  await page.getByLabel('Detector configuration').selectOption('id7000_4l')
  await openEmptyPanel(page)
  await expect(page.locator('.panel-topbar p')).toContainText('ID7000 4L: V/B/YG/R')
  await expect(page.getByPlaceholder('Select fluorophore')).toHaveCount(18)
  await expect(page.getByPlaceholder('Select fluorophore').first()).toHaveValue('')
  await page.getByTitle('New panel').click()
  await expect(page.getByRole('form', { name: 'Panel configuration' })).toBeVisible()
})

test('runs representative panel, import, export, and project round-trip workflows locally', async ({ page }) => {
  const remoteRequests: string[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.origin !== 'http://127.0.0.1:4173') remoteRequests.push(request.url())
  })

  await page.goto(APP_PATH)
  await expect(page).toHaveTitle(/OpenPanel/)
  await expect(page.getByLabel('Cytometer')).toHaveValue('aurora')
  await expect(page.getByLabel('Detector configuration')).toHaveValue('5l_uv_v_b_yg_r')
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
    await expect(page.getByRole('form', { name: 'Panel configuration' })).toBeVisible()
    await openEmptyPanel(page)
    await expect(page.getByPlaceholder('Select fluorophore').first()).toBeVisible()
  } finally {
    await context.setOffline(false)
  }
})
