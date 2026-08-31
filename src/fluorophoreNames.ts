import {
  PINNED_CONVENTIONAL_ESTIMATE_FLUOROPHORE_KEYS,
  PINNED_FLUOROPHORE_ALIAS_TO_CANONICAL,
  PINNED_SPECTRAL_FLUOROPHORE_KEYS,
} from './spectralLibraryManifest'

export const LIVE_DEAD_NIR = 'LIVE DEAD NIR'

const LIVE_DEAD_NIR_ALIASES = new Set([
  'livedeadnir',
  'livedeadnearir',
  'livedeadfixablenearir',
])

const PINNED_CANONICAL_FLUOROPHORE_KEYS = new Set([
  ...Object.values(PINNED_SPECTRAL_FLUOROPHORE_KEYS).flat(),
  ...PINNED_CONVENTIONAL_ESTIMATE_FLUOROPHORE_KEYS,
])

function normalizeFluorophoreName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

export function normalizeFluorophoreToken(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '')
}

export function canonicalizeFluorophoreName(value: string): string {
  return LIVE_DEAD_NIR_ALIASES.has(normalizeFluorophoreName(value))
    ? LIVE_DEAD_NIR
    : value
}

export function resolveBundledFluorophoreKey(value: string): string | undefined {
  return PINNED_FLUOROPHORE_ALIAS_TO_CANONICAL[normalizeFluorophoreToken(canonicalizeFluorophoreName(value))]
}

export function fluorophoreIdentity(value: unknown): string {
  const canonical = canonicalizeFluorophoreName(String(value ?? '')).trim()
  const normalized = normalizeFluorophoreToken(canonical)
  // Preserve distinct bundled entries such as GFP and EGFP. Non-canonical
  // aliases still resolve to the canonical entry for duplicate detection.
  return PINNED_CANONICAL_FLUOROPHORE_KEYS.has(normalized)
    ? normalized
    : resolveBundledFluorophoreKey(canonical) ?? normalized
}
