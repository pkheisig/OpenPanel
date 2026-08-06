function localStorageOrNull(): Storage | null {
  try {
    if (typeof window === 'undefined') return null
    return window.localStorage
  } catch {
    return null
  }
}

export function readLocalStorage(key: string): string | null {
  try {
    return localStorageOrNull()?.getItem(key) ?? null
  } catch {
    return null
  }
}

export function writeLocalStorage(key: string, value: string): void {
  try {
    localStorageOrNull()?.setItem(key, value)
  } catch {
    // Current-session functionality must continue when persistence is restricted.
  }
}

export function removeLocalStorage(key: string): void {
  try {
    localStorageOrNull()?.removeItem(key)
  } catch {
    // Current-session functionality must continue when persistence is restricted.
  }
}
