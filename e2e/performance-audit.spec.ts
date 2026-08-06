import { expect, test } from '@playwright/test'

const slots = [
  'Alexa Fluor 488', 'Alexa Fluor 532', 'Alexa Fluor 647', 'Alexa Fluor 700',
  'APC', 'APC-R700', 'APC-Fire 750', 'APC-Fire 810', 'APC-H7', 'APC-Cy7',
  'BB515', 'BB630', 'BB660', 'BB700', 'BB755', 'BB790', 'BYG584', 'BUV395',
  'BUV563', 'BUV615', 'BUV661', 'BUV737', 'BUV805', 'BV421', 'BV480', 'BV510',
  'BV570', 'BV605', 'BV650', 'BV711', 'BV750', 'BV785', 'BV786', 'BYG750',
  'eFluor 450', 'Pacific Blue',
]

test('audit editor interaction rendering', async ({ page }) => {
  const state = {
    cytometer: 'aurora',
    configuration: '5l_uv_v_b_yg_r',
    slots,
    markers: Object.fromEntries(slots.map((_, index) => [index, `Marker ${index + 1}`])),
    tab: 'panel',
    theme: 'light',
    sidebarWidth: 214,
    sidebarCollapsed: false,
    plotScale: 80,
    plotScaleMode: 'fit-width',
    wizard: null,
    cytometerPanels: {
      aurora: {
        configuration: '5l_uv_v_b_yg_r',
        slots,
        markers: Object.fromEntries(slots.map((_, index) => [index, `Marker ${index + 1}`])),
        wizard: null,
      },
    },
  }
  await page.addInitScript(({ projectState }) => {
    Object.defineProperty(window, 'indexedDB', { configurable: true, value: undefined })
    const panel = {
      id: 'performance-audit',
      name: 'Performance audit',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      state: projectState,
    }
    localStorage.setItem('openpanel.panel-library.v1', JSON.stringify([panel]))
    localStorage.setItem('openpanel.active-panel-id', panel.id)
    localStorage.setItem('openpanel.current-surface', 'editor')
  }, { projectState: state })

  await page.goto('/OpenPanel/')
  await page.getByLabel('Panel name').waitFor()
  const initialNodes = await page.locator('*').count()
  const measureTab = async (label: string) => page.evaluate(async (tabLabel) => {
    const button = Array.from(document.querySelectorAll<HTMLButtonElement>('.tab-button'))
      .find((candidate) => candidate.textContent?.trim() === tabLabel)
    if (!button) throw new Error(`Missing tab ${tabLabel}`)
    const started = performance.now()
    button.click()
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    return {
      duration: performance.now() - started,
      nodes: document.querySelectorAll('*').length,
      svgNodes: document.querySelectorAll('svg *').length,
    }
  }, label)

  const spectra = await measureTab('SPECTRA')
  const spectrumPlots = page.getByRole('img', { name: / spectrum$/ })
  await expect(spectrumPlots).toHaveCount(slots.length)
  await expect.poll(async () => Number(await spectrumPlots.first().getAttribute('width'))).toBeGreaterThan(1)
  const firstSpectrumPainted = await spectrumPlots.first().evaluate((plot) => {
    const canvas = plot as HTMLCanvasElement
    const context = canvas.getContext('2d')
    if (!context) return false
    const x = Math.floor(canvas.width / 2)
    const y = Math.floor(canvas.height * 0.3)
    return context.getImageData(x, y, 1, 1).data[3] > 0
  })
  expect(firstSpectrumPainted).toBe(true)
  await spectrumPlots.last().scrollIntoViewIfNeeded()
  await expect.poll(async () => Number(await spectrumPlots.last().getAttribute('width'))).toBeGreaterThan(1)

  const result = {
    initialNodes,
    spectra,
    similarity: await measureTab('SIMILARITY'),
    overview: await measureTab('PANEL'),
  }
  expect(result.spectra.nodes).toBeLessThan(2_500)
  expect(result.spectra.svgNodes).toBeLessThan(2_000)

  const wizardButton = page.getByRole('button', { name: 'Open panel wizard' })
  await wizardButton.hover()
  await page.waitForTimeout(60)
  const wizardOpenDuration = await page.evaluate(async () => {
    const button = document.querySelector<HTMLButtonElement>('[aria-label="Open panel wizard"]')
    if (!button) throw new Error('Missing panel wizard button')
    const started = performance.now()
    button.click()
    await new Promise<void>((resolve) => {
      const observer = new MutationObserver(() => {
        if (!document.querySelector('[role="dialog"]')) return
        observer.disconnect()
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      })
      observer.observe(document.body, { childList: true, subtree: true })
    })
    return performance.now() - started
  })
  const colorMenuDuration = await page.evaluate(async () => {
    const colorTrigger = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="combobox"]'))
      .find((button) => document.getElementById(button.getAttribute('aria-labelledby') ?? '')?.textContent === 'Color for marker 1')
    if (!colorTrigger) throw new Error('Missing wizard color selector')
    const started = performance.now()
    colorTrigger.click()
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    return performance.now() - started
  })
  await page.getByRole('searchbox', { name: 'Search colors' }).waitFor()
  const colorMenuNodes = await page.locator('.wizard-color-select-menu *').count()
  expect(colorMenuNodes).toBeLessThan(500)
  console.log(`WIZARD_PERFORMANCE ${JSON.stringify({ wizardOpenDuration, colorMenuDuration, colorMenuNodes })}`)
  console.log(`PERFORMANCE_AUDIT ${JSON.stringify(result)}`)
})
