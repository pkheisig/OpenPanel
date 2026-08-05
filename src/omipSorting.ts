import type { OmipCatalogEntry } from './panelWizardKnowledge'

function normalizedInstrumentFamily(value: string): string {
  const normalized = value.toLocaleLowerCase()
  if (normalized.includes('northern lights')) return 'northern-lights'
  if (normalized.includes('aurora')) return 'aurora'
  if (normalized.includes('id7000')) return 'id7000'
  if (normalized.includes('facsdiscover')) return 'facsdiscover'
  if (normalized.includes('facsymphony')) return 'facsymphony'
  if (normalized.includes('fortessa')) return 'fortessa'
  if (normalized.includes('facscelesta') || normalized.includes('celesta')) return 'celesta'
  if (normalized.includes('attunenxt') || normalized.includes('attune nxt')) return 'attune-nxt'
  if (normalized.includes('accuri')) return 'accuri-c6-plus'
  if (normalized.includes('facscalibur') || normalized.includes('calibur')) return 'facscalibur'
  if (normalized.includes('facscanto') || normalized.includes('canto ii')) return 'canto'
  if (normalized.includes('facslyric') || normalized.includes('facs lyric')) return 'lyric'
  if (normalized.includes('ze5')) return 'ze5'
  if (normalized.includes('cytpix')) return 'cytpix'
  if (normalized.includes('quanteon') || normalized.includes('novocyte')) return 'quanteon'
  if (normalized.includes('macsquant')) return 'macsquant'
  if (normalized.includes('facsverse')) return 'facsverse'
  if (normalized.includes('lsr ii') || normalized.includes('lsrii')) return 'lsrii'
  if (normalized.includes('cytoflex')) return 'cytoflex-lx'
  if (normalized.includes('navios')) return 'navios'
  if (normalized.includes('dxflex')) return 'dxflex'
  if (normalized.includes('facsaria fusion') || normalized.includes('aria fusion')) return 'facsaria-fusion'
  if (normalized.includes('xenith')) return 'xenith'
  return normalized.replace(/[^a-z0-9]+/g, '-')
}

function reportedConfigurationMatches(value: string, activeConfigurationLabel: string): boolean {
  const reportedLasers = value.match(/\b([34567])l\b/i)?.[1]
  if (!reportedLasers) return true
  return new RegExp(`\\b${reportedLasers}l\\b`, 'i').test(activeConfigurationLabel)
}

export function isOmipDesignedForActiveSetup(
  entry: Pick<OmipCatalogEntry, 'cytometers'>,
  activeCytometerLabel?: string,
  activeConfigurationLabel = '',
): boolean {
  if (!activeCytometerLabel) return true
  return entry.cytometers.some((reportedCytometer) => (
    normalizedInstrumentFamily(reportedCytometer) === normalizedInstrumentFamily(activeCytometerLabel)
    && reportedConfigurationMatches(reportedCytometer, activeConfigurationLabel)
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
