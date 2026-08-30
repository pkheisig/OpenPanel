// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  openTextFile,
  projectJsonFilename,
  projectNameFromFilename,
  readTextFileWithinLimit,
  saveBlob,
} from '../src/browserFiles'
import { createRefreshSequence } from '../src/refreshSequence'
import { installStaleChunkRecovery, isStaleChunkLoadError, shouldReloadStaleChunk, STALE_CHUNK_RELOAD_COOLDOWN_MS } from '../src/staleChunkRecovery'
import { readThemePreference, saveThemePreference } from '../src/themePreference'

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.documentElement.dataset.theme = ''
})

const fileOptions = {
  description: 'OpenPanel project',
  mimeType: 'application/json',
  extensions: ['.json'],
}

describe('browser file helpers', () => {
  test('rejects declared and actual files above the read limit', async () => {
    const declaredTooLarge = { size: 11, text: vi.fn(async () => 'small') } as unknown as File
    await expect(readTextFileWithinLimit(declaredTooLarge, 10, 'OpenPanel project')).rejects.toThrow('too large')

    const actualTooLarge = { size: 0, text: vi.fn(async () => '0123456789a') } as unknown as File
    await expect(readTextFileWithinLimit(actualTooLarge, 10, 'OpenPanel project')).rejects.toThrow('too large')
    expect(actualTooLarge.text).toHaveBeenCalledTimes(1)
  })

  test('sanitizes project filenames and recovers project names', () => {
    expect(projectJsonFilename('  Panel:/one?  ')).toBe('Panel__one__OpenPanel.json')
    expect(projectJsonFilename('\u0000   ')).toBe('Untitled panel_OpenPanel.json')
    expect(projectNameFromFilename('Panel_One_OpenPanel.JSON')).toBe('Panel One')
    expect(projectNameFromFilename('Panel-One.op')).toBe('Panel One')
    expect(projectNameFromFilename('')).toBe('Imported panel')
  })

  test('writes through the native save picker and handles cancellation', async () => {
    const write = vi.fn(async () => undefined)
    const close = vi.fn(async () => undefined)
    const showSaveFilePicker = vi.fn(async () => ({ createWritable: async () => ({ write, close }) }))
    vi.stubGlobal('window', { showSaveFilePicker })
    await saveBlob(new Blob(['data']), { suggestedName: 'panel.json', ...fileOptions })
    expect(showSaveFilePicker).toHaveBeenCalledWith(expect.objectContaining({ suggestedName: 'panel.json' }))
    expect(write).toHaveBeenCalled()
    expect(close).toHaveBeenCalled()

    const abortPicker = vi.fn(async () => { throw new DOMException('cancelled', 'AbortError') })
    vi.stubGlobal('window', { showSaveFilePicker: abortPicker })
    await expect(saveBlob(new Blob(['data']), { suggestedName: 'panel.json', ...fileOptions })).resolves.toBeUndefined()
  })

  test('falls back when a picker is present but rejected by browser policy', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:policy'), revokeObjectURL: vi.fn() })
    vi.stubGlobal('window', {
      showSaveFilePicker: vi.fn(async () => { throw new Error('policy denied') }),
    })
    await saveBlob(new Blob(['data']), { suggestedName: 'panel.json', ...fileOptions })
    expect(click).toHaveBeenCalled()

    const input = document.createElement('input')
    const inputClick = vi.spyOn(input, 'click').mockImplementation(() => undefined)
    vi.stubGlobal('window', {
      showOpenFilePicker: vi.fn(async () => { throw new Error('policy denied') }),
    })
    await expect(openTextFile(fileOptions, input)).resolves.toBeNull()
    expect(inputClick).toHaveBeenCalled()

    vi.stubGlobal('window', {
      showOpenFilePicker: vi.fn(async () => []),
    })
    await expect(openTextFile(fileOptions, null)).resolves.toBeNull()
  })

  test('falls back to a download and file input when pickers are unavailable', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    vi.stubGlobal('window', {})
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:test'), revokeObjectURL: vi.fn() })
    await saveBlob(new Blob(['data']), { suggestedName: 'panel.json', ...fileOptions })
    expect(click).toHaveBeenCalled()

    const input = document.createElement('input')
    const inputClick = vi.spyOn(input, 'click').mockImplementation(() => undefined)
    await expect(openTextFile(fileOptions, input)).resolves.toBeNull()
    expect(inputClick).toHaveBeenCalled()
  })

  test('returns a file from the native open picker and ignores aborts', async () => {
    const file = new File(['hello'], 'panel.json', { type: 'application/json' })
    vi.stubGlobal('window', {
      showOpenFilePicker: vi.fn(async () => [{ getFile: async () => file }]),
    })
    await expect(openTextFile(fileOptions, null)).resolves.toBe(file)
    vi.stubGlobal('window', { showOpenFilePicker: vi.fn(async () => { throw new DOMException('cancelled', 'AbortError') }) })
    await expect(openTextFile(fileOptions, null)).resolves.toBeNull()
  })
})

describe('refresh and stale chunk recovery', () => {
  test('tracks only the latest refresh sequence', () => {
    const sequence = createRefreshSequence()
    const first = sequence.begin()
    const second = sequence.begin()
    expect(sequence.isCurrent(first)).toBe(false)
    expect(sequence.isCurrent(second)).toBe(true)
  })

  test('recognizes stale module errors and cooldown boundaries', () => {
    expect(isStaleChunkLoadError(new Error('Failed to fetch dynamically imported module'))).toBe(true)
    expect(isStaleChunkLoadError('Loading CSS chunk 4 failed')).toBe(true)
    expect(isStaleChunkLoadError(undefined)).toBe(false)
    expect(isStaleChunkLoadError(new Error('unrelated'))).toBe(false)
    expect(shouldReloadStaleChunk(Number.NaN, 1)).toBe(true)
    expect(shouldReloadStaleChunk(0, 1)).toBe(true)
    expect(shouldReloadStaleChunk(10, 10 + STALE_CHUNK_RELOAD_COOLDOWN_MS - 1)).toBe(false)
    expect(shouldReloadStaleChunk(10, 10 + STALE_CHUNK_RELOAD_COOLDOWN_MS)).toBe(true)
  })

  test('reloads stale chunks once and cleans up listeners and cooldown state', () => {
    vi.useFakeTimers()
    const listeners = new Map<string, EventListener>()
    const values = new Map<string, string>()
    const sessionStorage = {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => values.set(key, value)),
      removeItem: vi.fn((key: string) => values.delete(key)),
    }
    const reload = vi.fn()
    vi.stubGlobal('window', {
      sessionStorage,
      location: { reload },
      addEventListener: vi.fn((type: string, listener: EventListener) => listeners.set(type, listener)),
      removeEventListener: vi.fn((type: string) => listeners.delete(type)),
      setTimeout,
      clearTimeout,
    })
    const dispose = installStaleChunkRecovery()
    const event = { preventDefault: vi.fn() } as unknown as Event
    listeners.get('vite:preloadError')?.(event)
    expect(event.preventDefault).toHaveBeenCalled()
    expect(reload).toHaveBeenCalled()
    listeners.get('vite:preloadError')?.(event)
    expect(reload).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(STALE_CHUNK_RELOAD_COOLDOWN_MS)
    expect(sessionStorage.removeItem).toHaveBeenCalled()
    dispose()
    expect(listeners.has('vite:preloadError')).toBe(false)
  })

  test('continues stale recovery when session storage is restricted', () => {
    vi.useFakeTimers()
    const listeners = new Map<string, EventListener>()
    const reload = vi.fn()
    const sessionStorage = {
      getItem: vi.fn(() => { throw new Error('blocked') }),
      setItem: vi.fn(() => { throw new Error('blocked') }),
      removeItem: vi.fn(() => { throw new Error('blocked') }),
    }
    vi.stubGlobal('window', {
      sessionStorage,
      location: { reload },
      addEventListener: vi.fn((type: string, listener: EventListener) => listeners.set(type, listener)),
      removeEventListener: vi.fn((type: string) => listeners.delete(type)),
      setTimeout,
      clearTimeout,
    })
    const dispose = installStaleChunkRecovery()
    const event = { preventDefault: vi.fn() } as unknown as Event
    listeners.get('vite:preloadError')?.(event)
    expect(event.preventDefault).toHaveBeenCalled()
    expect(reload).toHaveBeenCalled()
    vi.advanceTimersByTime(STALE_CHUNK_RELOAD_COOLDOWN_MS)
    dispose()
  })

  test('does not clear an unset stale-chunk cooldown', () => {
    vi.useFakeTimers()
    const listeners = new Map<string, EventListener>()
    const sessionStorage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    }
    vi.stubGlobal('window', {
      sessionStorage,
      location: { reload: vi.fn() },
      addEventListener: vi.fn((type: string, listener: EventListener) => listeners.set(type, listener)),
      removeEventListener: vi.fn((type: string) => listeners.delete(type)),
      setTimeout,
      clearTimeout,
    })
    const dispose = installStaleChunkRecovery()
    vi.advanceTimersByTime(STALE_CHUNK_RELOAD_COOLDOWN_MS)
    expect(sessionStorage.removeItem).not.toHaveBeenCalled()
    dispose()
  })
})

describe('theme preference', () => {
  test('reads, saves, and migrates theme preferences', () => {
    vi.stubGlobal('window', {
      localStorage: window.localStorage,
      matchMedia: vi.fn(() => ({ matches: true })),
    })
    expect(readThemePreference()).toBe('dark')
    saveThemePreference('light')
    expect(readThemePreference()).toBe('light')
    window.localStorage.removeItem('spectreasy-theme')
    window.localStorage.setItem('spectreasy_theme', 'dark')
    expect(readThemePreference('light')).toBe('dark')
    window.localStorage.setItem('spectreasy_theme', 'invalid')
    expect(readThemePreference('light')).toBe('light')
    expect(document.documentElement.dataset.theme).toBe('light')
  })
})
