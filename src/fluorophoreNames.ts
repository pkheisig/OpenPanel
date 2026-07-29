export const LIVE_DEAD_NIR = 'LIVE DEAD NIR'

const LIVE_DEAD_NIR_ALIASES = new Set([
  'livedeadnir',
  'livedeadnearir',
  'livedeadfixablenearir',
])

function normalizeFluorophoreName(value: string): string {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '')
}

export function canonicalizeFluorophoreName(value: string): string {
  return LIVE_DEAD_NIR_ALIASES.has(normalizeFluorophoreName(value))
    ? LIVE_DEAD_NIR
    : value
}
