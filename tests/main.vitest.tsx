// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from 'vitest'

const render = vi.fn()
const createRoot = vi.fn(() => ({ render }))
const registerSW = vi.fn()
const installStaleChunkRecovery = vi.fn()

vi.mock('react-dom/client', () => ({ createRoot }))
vi.mock('virtual:pwa-register', () => ({ registerSW }), { virtual: true })
vi.mock('../src/staleChunkRecovery.ts', () => ({ installStaleChunkRecovery }))
vi.mock('../src/App.tsx', () => ({ default: () => <div>App</div> }))

afterEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  document.body.innerHTML = ''
})

describe('application entrypoint', () => {
  test('installs recovery, registers the service worker, and renders the app root', async () => {
    const root = document.createElement('div')
    root.id = 'root'
    document.body.append(root)

    await import('../src/main.tsx')

    expect(installStaleChunkRecovery).toHaveBeenCalledTimes(1)
    expect(registerSW).toHaveBeenCalledWith({ immediate: true })
    expect(createRoot).toHaveBeenCalledWith(root)
    expect(render).toHaveBeenCalledTimes(1)
    expect(render.mock.calls[0]?.[0]?.type).toBe(Symbol.for('react.strict_mode'))
  })
})
