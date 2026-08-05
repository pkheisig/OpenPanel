import type { OmipCatalogEntry } from './panelWizardKnowledge'
import { isCytometerSetupMatch } from './cytometerCompatibility'

export function isOmipDesignedForActiveSetup(
  entry: Pick<OmipCatalogEntry, 'cytometers'>,
  activeCytometerLabel?: string,
  activeConfigurationLabel = '',
): boolean {
  if (!activeCytometerLabel) return true
  return entry.cytometers.some((reportedCytometer) => isCytometerSetupMatch(
    reportedCytometer,
    activeCytometerLabel,
    activeConfigurationLabel,
  ))
}

function omipNumber(entry: Pick<OmipCatalogEntry, 'name'>): number {
  const value = Number(entry.name.match(/\d+$/)?.[0] ?? '')
  return Number.isFinite(value) ? value : -1
}

export function sortOmipEntriesForActiveSetup(
  entries: readonly OmipCatalogEntry[],
  activeCytometerLabel?: string,
  activeConfigurationLabel = '',
): OmipCatalogEntry[] {
  return [...entries].sort((left, right) => (
    Number(isOmipDesignedForActiveSetup(right, activeCytometerLabel, activeConfigurationLabel))
      - Number(isOmipDesignedForActiveSetup(left, activeCytometerLabel, activeConfigurationLabel))
    || omipNumber(right) - omipNumber(left)
  ))
}
