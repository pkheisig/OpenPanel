import { PINNED_FLUOROPHORE_ALIAS_TO_CANONICAL } from './spectralLibraryManifest'

export const LIVE_DEAD_NIR = 'LIVE DEAD NIR'

const LIVE_DEAD_NIR_ALIASES = new Set([
  'livedeadnir',
  'livedeadnearir',
  'livedeadfixablenearir',
])

function normalizeFluorophoreName(value: string): string {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '')
}

export function normalizeFluorophoreToken(value: unknown): string {
  return String(value ?? '').trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, '')
}

export function canonicalizeFluorophoreName(value: string): string {
  return LIVE_DEAD_NIR_ALIASES.has(normalizeFluorophoreName(value))
    ? LIVE_DEAD_NIR
    : value
}

export function resolveBundledFluorophoreKey(value: string): string | undefined {
  return PINNED_FLUOROPHORE_ALIAS_TO_CANONICAL[normalizeFluorophoreToken(canonicalizeFluorophoreName(value))]
}
