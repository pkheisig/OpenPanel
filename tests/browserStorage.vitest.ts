import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  readLocalStorage,
  removeLocalStorage,
  writeLocalStorage,
} from '../src/browserStorage'

function memoryStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('browser storage guards', () => {
  test('reads, writes, and removes values when storage is available', () => {
    const storage = memoryStorage()
    vi.stubGlobal('window', { localStorage: storage })

    expect(readLocalStorage('missing')).toBeNull()
    writeLocalStorage('theme', 'dark')
    expect(readLocalStorage('theme')).toBe('dark')
    removeLocalStorage('theme')
    expect(readLocalStorage('theme')).toBeNull()
  })

  test('turns storage access failures into no-op persistence', () => {
    vi.stubGlobal('window', {
      get localStorage() {
        throw new Error('storage blocked')
      },
    })

    expect(readLocalStorage('theme')).toBeNull()
    expect(() => writeLocalStorage('theme', 'dark')).not.toThrow()
    expect(() => removeLocalStorage('theme')).not.toThrow()
  })
})
