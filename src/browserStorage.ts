function localStorageOrNull(): Storage | null {
  try {
    if (typeof window === 'undefined') return null
    return window.localStorage
  } catch {
    return null
  }
}

export type LocalStorageRead = {
  available: boolean
  value: string | null
}

export function readLocalStorageResult(key: string): LocalStorageRead {
  const storage = localStorageOrNull()
  if (!storage) return { available: false, value: null }
  try {
    return { available: true, value: storage.getItem(key) }
  } catch {
    return { available: false, value: null }
  }
}

export function readLocalStorage(key: string): string | null {
  return readLocalStorageResult(key).value
}

export function writeLocalStorageChecked(key: string, value: string): boolean {
  const storage = localStorageOrNull()
  if (!storage) return false
  try {
    storage.setItem(key, value)
    return storage.getItem(key) === value
  } catch {
    return false
  }
}

export function writeLocalStorage(key: string, value: string): void {
  try {
    localStorageOrNull()?.setItem(key, value)
  } catch {
    // Current-session functionality must continue when persistence is restricted.
  }
}

export function removeLocalStorageChecked(key: string): boolean {
  const storage = localStorageOrNull()
  if (!storage) return false
  try {
    storage.removeItem(key)
    return storage.getItem(key) === null
  } catch {
    return false
  }
}

export function removeLocalStorage(key: string): void {
  try {
    localStorageOrNull()?.removeItem(key)
  } catch {
    // Current-session functionality must continue when persistence is restricted.
  }
}
