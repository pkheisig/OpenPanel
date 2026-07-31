import { coexpressionKey } from './panelWizardEngine'
import type {
  CoexpressionLevel,
  WizardMarker,
} from './panelWizardEngine'
import { OMIP_CATALOG_RECORDS } from './omipCatalog'
import { SPECTRAL_OMIP_TEMPLATE_ROWS } from './omipSpectralTemplateData'
import type { UiSelectOption } from './UiSelect'

type MarkerEntry = {
  name: string
  aliases?: string[]
}

const MARKERS: MarkerEntry[] = [
  { name: '7-AAD' },
  { name: 'Annexin V', aliases: ['Annexin 5', 'AnnV'] },
  { name: 'B220', aliases: ['CD45R'] },
  { name: 'CCR2', aliases: ['CD192'] },
  { name: 'CCR3', aliases: ['CD193'] },
  { name: 'CCR4', aliases: ['CD194'] },
  { name: 'CCR5', aliases: ['CD195'] },
  { name: 'CCR6', aliases: ['CD196'] },
  { name: 'CCR7', aliases: ['CD197'] },
  { name: 'CCR8', aliases: ['CD198'] },
  { name: 'CCR9', aliases: ['CD199'] },
  { name: 'CCR10' },
  { name: 'CLA', aliases: ['Cutaneous lymphocyte antigen'] },
  { name: 'CTLA-4', aliases: ['CD152', 'CTLA4'] },
  { name: 'CX3CR1' },
  { name: 'CXCR2', aliases: ['CD182'] },
  { name: 'CXCR3', aliases: ['CD183'] },
  { name: 'CXCR4', aliases: ['CD184'] },
  { name: 'CXCR5', aliases: ['CD185'] },
  { name: 'CXCR6', aliases: ['CD186'] },
  { name: 'EpCAM', aliases: ['CD326', 'EPCAM'] },
  { name: 'FoxP3', aliases: ['FOXP3'] },
  { name: 'Granzyme B', aliases: ['GZMB'] },
  { name: 'HLA-A/B/C', aliases: ['MHC I', 'HLA class I'] },
  { name: 'HLA-DR', aliases: ['MHC II', 'HLA class II'] },
  { name: 'IFN-γ', aliases: ['IFNG', 'Interferon gamma'] },
  { name: 'IgD' },
  { name: 'IgM' },
  { name: 'IL-2' },
  { name: 'IL-4' },
  { name: 'IL-10' },
  { name: 'IL-17A' },
  { name: 'Integrin β7', aliases: ['Integrin beta 7', 'ITGB7'] },
  { name: 'Ki-67', aliases: ['MKI67', 'Ki67'] },
  { name: 'LAG-3', aliases: ['CD223', 'LAG3'] },
  { name: 'Live/Dead', aliases: ['Live dead', 'Viability'] },
  { name: 'PD-1', aliases: ['CD279', 'PDCD1', 'PD1'] },
  { name: 'PD-L1', aliases: ['CD274', 'PDL1'] },
  { name: 'Perforin', aliases: ['PRF1'] },
  { name: 'T-bet', aliases: ['TBX21'] },
  { name: 'TCR α/β', aliases: ['TCR alpha beta', 'TCRab'] },
  { name: 'TCR γ/δ', aliases: ['TCR gamma delta', 'TCRgd'] },
  { name: 'TIM-3', aliases: ['CD366', 'HAVCR2', 'TIM3'] },
  { name: 'TNF-α', aliases: ['TNF', 'TNFA'] },
  { name: 'Vimentin', aliases: ['VIM'] },
  ...[
    'CD1a', 'CD1c', 'CD2', 'CD3', 'CD4', 'CD5', 'CD7', 'CD8', 'CD9', 'CD10',
    'CD11a', 'CD11b', 'CD11c', 'CD13', 'CD14', 'CD15', 'CD16', 'CD18', 'CD19',
    'CD20', 'CD21', 'CD22', 'CD23', 'CD24', 'CD25', 'CD27', 'CD28', 'CD29',
    'CD30', 'CD31', 'CD32', 'CD33', 'CD34', 'CD35', 'CD36', 'CD37', 'CD38',
    'CD39', 'CD40', 'CD41', 'CD42b', 'CD43', 'CD44', 'CD45', 'CD45RA',
    'CD45RO', 'CD46', 'CD47', 'CD48', 'CD49a', 'CD49b', 'CD49d', 'CD49e',
    'CD50', 'CD52', 'CD54', 'CD55', 'CD56', 'CD57', 'CD58', 'CD61', 'CD62L',
    'CD62P', 'CD63', 'CD64', 'CD66b', 'CD68', 'CD69', 'CD70', 'CD71', 'CD73',
    'CD74', 'CD80', 'CD81', 'CD83', 'CD84', 'CD85j', 'CD86', 'CD88', 'CD90',
    'CD93', 'CD94', 'CD95', 'CD97', 'CD103', 'CD105', 'CD106', 'CD107a',
    'CD112', 'CD115', 'CD116', 'CD117', 'CD123', 'CD124', 'CD125', 'CD127',
    'CD135', 'CD137', 'CD138', 'CD141', 'CD144', 'CD146', 'CD147', 'CD161',
    'CD163', 'CD166', 'CD169', 'CD172a', 'CD200', 'CD206', 'CD209', 'CD235a',
    'CD271', 'CD300e', 'CD304', 'CD309', 'CD371',
  ].map((name) => ({ name })),
].sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }))

export type MarkerDictionaryRow = {
  marker?: string
  aliases?: string
}

function normalizeMarkerOptionKey(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, '')
}

function splitMarkerAliases(value: string): string[] {
  return value
    .split(';')
    .map((alias) => alias.trim())
    .filter(Boolean)
}

export function buildMarkerOptions(rows: MarkerDictionaryRow[] = []): UiSelectOption[] {
  const entries = new Map<string, MarkerEntry>()
  const addEntry = (name: string, aliases: string[]) => {
    const cleanName = name.trim()
    const key = normalizeMarkerOptionKey(cleanName)
    if (!key) return
    const existing = entries.get(key)
    const canonicalName = existing?.name ?? cleanName
    const aliasMap = new Map<string, string>()
    for (const alias of [...(existing?.aliases ?? []), ...aliases]) {
      const cleanAlias = alias.trim()
      const aliasKey = normalizeMarkerOptionKey(cleanAlias)
      if (aliasKey && aliasKey !== key && !aliasMap.has(aliasKey)) {
        aliasMap.set(aliasKey, cleanAlias)
      }
    }
    entries.set(key, { name: canonicalName, aliases: [...aliasMap.values()] })
  }

  MARKERS.forEach(({ name, aliases = [] }) => addEntry(name, aliases))
  rows.forEach(({ marker = '', aliases = '' }) => addEntry(marker, splitMarkerAliases(aliases)))

  return [...entries.values()]
    .sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }))
    .map(({ name, aliases = [] }) => ({
      value: name,
      label: name,
      searchText: [name, ...aliases].join(' '),
    }))
}

export const MARKER_OPTIONS = buildMarkerOptions()

export type CoexpressionContext = {
  species: 'human' | 'mouse'
  tissue: 'peripheral-blood' | 'pbmc' | 'bone-marrow' | 'spleen' | 'tumor'
  population: 'all' | 't-cells' | 'b-cells' | 'nk-cells' | 'myeloid' | 'tumor-stroma'
  condition: 'baseline' | 'inflammatory' | 'tumor'
}

export const DEFAULT_COEXPRESSION_CONTEXT: CoexpressionContext = {
  species: 'human',
  tissue: 'pbmc',
  population: 'all',
  condition: 'baseline',
}

type ReferencePopulation = {
  group: CoexpressionContext['population']
  tissues: CoexpressionContext['tissue'][]
  markers: Record<string, number>
}

const IMMUNE_TISSUES: CoexpressionContext['tissue'][] = [
  'peripheral-blood',
  'pbmc',
  'bone-marrow',
  'spleen',
  'tumor',
]

const REFERENCE_POPULATIONS: ReferencePopulation[] = [
  {
    group: 't-cells',
    tissues: IMMUNE_TISSUES,
    markers: {
      CD2: 4, CD3: 4, CD4: 4, CD5: 4, CD7: 4, CD27: 3, CD28: 3, CD45: 4,
      CD45RA: 2, CD45RO: 2, CD62L: 2, CD127: 3, CCR7: 2, 'TCR Α/Β': 4,
    },
  },
  {
    group: 't-cells',
    tissues: IMMUNE_TISSUES,
    markers: {
      CD2: 4, CD3: 4, CD5: 4, CD7: 4, CD8: 4, CD27: 3, CD28: 3, CD45: 4,
      CD45RA: 2, CD45RO: 2, CD57: 2, CD62L: 2, CCR7: 2, 'TCR Α/Β': 4,
    },
  },
  {
    group: 't-cells',
    tissues: IMMUNE_TISSUES,
    markers: {
      CD2: 4, CD3: 4, CD4: 4, CD25: 4, CD45: 4, CD45RO: 3, CD127: 1,
      CCR4: 3, FOXP3: 4, CTLA4: 3,
    },
  },
  {
    group: 'b-cells',
    tissues: IMMUNE_TISSUES,
    markers: {
      CD19: 4, CD20: 4, CD21: 3, CD22: 4, CD24: 3, CD27: 2, CD38: 2,
      CD40: 3, CD45: 4, CD74: 4, CD80: 2, CD86: 2, 'HLA-DR': 4, IGD: 3, IGM: 3,
    },
  },
  {
    group: 'b-cells',
    tissues: ['bone-marrow', 'spleen', 'tumor'],
    markers: {
      CD19: 2, CD27: 4, CD38: 4, CD45: 3, CD138: 4,
    },
  },
  {
    group: 'nk-cells',
    tissues: IMMUNE_TISSUES,
    markers: {
      CD2: 3, CD7: 4, CD16: 3, CD45: 4, CD56: 4, CD57: 2, CD94: 3,
      CD107A: 2, GRANZYMEB: 4, PERFORIN: 4,
    },
  },
  {
    group: 'myeloid',
    tissues: IMMUNE_TISSUES,
    markers: {
      CD11B: 4, CD13: 3, CD14: 4, CD16: 2, CD33: 4, CD36: 3, CD45: 4,
      CD64: 4, CD88: 3, CD115: 3, CD163: 2, CD172A: 4, 'HLA-DR': 3,
    },
  },
  {
    group: 'myeloid',
    tissues: ['peripheral-blood', 'bone-marrow', 'spleen', 'tumor'],
    markers: {
      CD11B: 4, CD13: 3, CD15: 4, CD16: 4, CD33: 3, CD45: 4, CD66B: 4,
      CD88: 3,
    },
  },
  {
    group: 'myeloid',
    tissues: IMMUNE_TISSUES,
    markers: {
      CD1C: 4, CD11C: 4, CD33: 3, CD45: 4, CD123: 2, CD141: 2,
      CD172A: 3, 'HLA-DR': 4,
    },
  },
  {
    group: 'tumor-stroma',
    tissues: ['tumor'],
    markers: {
      EPCAM: 4, CD47: 3, CD54: 2, CD71: 3, CD274: 2, VIMENTIN: 2,
    },
  },
  {
    group: 'tumor-stroma',
    tissues: ['tumor'],
    markers: {
      CD90: 3, CD105: 3, CD146: 2, CD271: 2, VIMENTIN: 4,
    },
  },
]

function normalizeMarkerName(name: string): string {
  const normalized = name
    .trim()
    .toLocaleUpperCase()
    .replace(/Β/g, 'B')
    .replace(/Α/g, 'A')
    .replace(/Γ/g, 'G')
    .replace(/[^A-Z0-9]+/g, '')
  const aliases: Record<string, string> = {
    CD152: 'CTLA4',
    CD183: 'CXCR3',
    CD185: 'CXCR5',
    CD193: 'CCR3',
    CD194: 'CCR4',
    CD195: 'CCR5',
    CD196: 'CCR6',
    CD197: 'CCR7',
    CD274: 'CD274',
    CD279: 'PD1',
    CTLA4: 'CTLA4',
    EPCAM: 'EPCAM',
    FOXP3: 'FOXP3',
    GZMB: 'GRANZYMEB',
    HAVCR2: 'TIM3',
    HLADR: 'HLA-DR',
    ITGB7: 'INTEGRINB7',
    PDCD1: 'PD1',
    PDL1: 'CD274',
    PRF1: 'PERFORIN',
  }
  return aliases[normalized] ?? normalized
}

const POPULATION_MARKERS: Partial<Record<CoexpressionContext['population'], string[]>> = {
  't-cells': ['CD3', 'CD4', 'CD8', 'CD25', 'CD27', 'CD28', 'CD45RA', 'CD45RO', 'CD62L', 'CCR7', 'PD-1'],
  'b-cells': ['CD19', 'CD20', 'CD21', 'CD22', 'CD27', 'CD38', 'CD138', 'HLA-DR', 'IgD', 'IgM'],
  'nk-cells': ['CD3', 'CD16', 'CD56', 'CD57', 'CD94', 'CD107a', 'Granzyme B', 'Perforin'],
  myeloid: ['CD1c', 'CD11b', 'CD11c', 'CD14', 'CD16', 'CD33', 'CD64', 'CD123', 'CD141', 'HLA-DR'],
  'tumor-stroma': ['EpCAM', 'CD47', 'CD54', 'CD71', 'PD-L1', 'CD90', 'CD105', 'CD146', 'Vimentin'],
}

export function markerOptionsForPanel(
  population: CoexpressionContext['population'],
  selectedNames: string[],
  species: CoexpressionContext['species'],
  options: UiSelectOption[] = MARKER_OPTIONS,
): UiSelectOption[] {
  const contextual = new Set(
    (POPULATION_MARKERS[population] ?? []).map(normalizeMarkerName),
  )
  if (species === 'mouse') contextual.add('B220')
  const selected = new Set(selectedNames.map(normalizeMarkerName))
  return [...options].sort((left, right) => {
    const leftName = normalizeMarkerName(left.value)
    const rightName = normalizeMarkerName(right.value)
    return (
      Number(contextual.has(rightName)) - Number(contextual.has(leftName))
      || Number(selected.has(leftName)) - Number(selected.has(rightName))
      || left.label.localeCompare(right.label, undefined, { numeric: true })
    )
  })
}

function contextualMarkerLevel(
  population: ReferencePopulation,
  marker: string,
  context: CoexpressionContext,
): number | null {
  let level = population.markers[marker]
  if (level === undefined) {
    if (marker === 'LIVEDEAD' || marker.startsWith('VIAB')) return 4
    if (marker === 'KI67') level = context.condition === 'baseline' ? 1 : 3
    if (marker === 'CD69' || marker === 'PD1' || marker === 'TIM3' || marker === 'LAG3') {
      level = context.condition === 'baseline' ? 1 : 3
    }
  }
  if (level === undefined) return null
  if (context.species === 'mouse' && marker === 'CD56') return null
  return level
}

export function inferCoexpression(
  markers: WizardMarker[],
  context: CoexpressionContext,
  previous: Record<string, CoexpressionLevel>,
): Record<string, CoexpressionLevel> {
  const populations = REFERENCE_POPULATIONS.filter((population) => (
    population.tissues.includes(context.tissue)
    && (context.population === 'all' || population.group === context.population)
  ))
  const next = { ...previous }
  markers.forEach((left, leftIndex) => {
    markers.slice(leftIndex + 1).forEach((right) => {
      const leftName = normalizeMarkerName(left.name)
      const rightName = normalizeMarkerName(right.name)
      const inferred = populations
        .map((population) => {
          const leftLevel = contextualMarkerLevel(population, leftName, context)
          const rightLevel = contextualMarkerLevel(population, rightName, context)
          return leftLevel === null || rightLevel === null ? null : Math.min(leftLevel, rightLevel)
        })
        .filter((value): value is number => value !== null)
      if (inferred.length > 0) {
        next[coexpressionKey(left.id, right.id)] = Math.max(...inferred) as CoexpressionLevel
      }
    })
  })
  return next
}

export type OmipTemplateMarker = {
  name: string
  fluorophore?: string
}

export type OmipTemplate = {
  id: string
  name: string
  summary: string
  sourceUrl: string
  context: CoexpressionContext
  markers: OmipTemplateMarker[]
}

export type OmipCatalogEntry = {
  id: string
  name: string
  summary: string
  year: string
  cytometers: string[]
  species: 'human' | 'mouse' | 'non-human-primate' | 'other'
  cellTypes: string[]
  method: 'spectral' | 'mass' | 'imaging' | 'conventional'
  sourceUrl: string
  template: OmipTemplate | null
}

function normalizeOmipFluorophore(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, '')
}

export function omipTemplateAssignmentsForPanel(
  template: OmipTemplate,
  availableFluorophores: readonly string[],
  maxPanelSize?: number,
): { marker: string; fluorophore: string }[] | null {
  if (template.markers.length === 0) return null
  if (maxPanelSize !== undefined && template.markers.length > maxPanelSize) return null

  const availableByName = new Map(
    availableFluorophores.map((fluorophore) => [normalizeOmipFluorophore(fluorophore), fluorophore]),
  )
  const usedFluorophores = new Set<string>()
  const assignments: { marker: string; fluorophore: string }[] = []

  for (const templateMarker of template.markers) {
    const key = normalizeOmipFluorophore(templateMarker.fluorophore ?? '')
    const fluorophore = availableByName.get(key)
    if (!templateMarker.name.trim() || !fluorophore || usedFluorophores.has(key)) return null
    usedFluorophores.add(key)
    assignments.push({ marker: templateMarker.name.trim(), fluorophore })
  }

  return assignments
}

export const OMIP_DATABASE_URL = 'https://isac-net.org/omip-and-flow-repository-database/'

type LegacyOmipMetadata = Omit<OmipTemplate, 'markers'>

const LEGACY_OMIP_METADATA: LegacyOmipMetadata[] = [
  {
    id: 'omip-042',
    name: 'OMIP-042',
    summary: '21-color human blood immunophenotyping',
    sourceUrl: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC6077845/',
    context: {
      species: 'human',
      tissue: 'peripheral-blood',
      population: 'all',
      condition: 'baseline',
    },
  },
  {
    id: 'omip-051',
    name: 'OMIP-051',
    summary: '28-color human B-cell and myeloid panel',
    sourceUrl: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC6546165/',
    context: {
      species: 'human',
      tissue: 'pbmc',
      population: 'all',
      condition: 'baseline',
    },
  },
  {
    id: 'omip-069',
    name: 'OMIP-069',
    summary: '40-color human blood deep immunophenotyping',
    sourceUrl: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC8132182/',
    context: {
      species: 'human',
      tissue: 'peripheral-blood',
      population: 'all',
      condition: 'baseline',
    },
  },
  {
    id: 'omip-077',
    name: 'OMIP-077',
    summary: '14-color human myeloid panel',
    sourceUrl: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC9292053/',
    context: {
      species: 'human',
      tissue: 'peripheral-blood',
      population: 'myeloid',
      condition: 'baseline',
    },
  },
  {
    id: 'omip-090',
    name: 'OMIP-090',
    summary: '18-color human T-cell trafficking panel',
    sourceUrl: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC10952450/',
    context: {
      species: 'human',
      tissue: 'pbmc',
      population: 't-cells',
      condition: 'baseline',
    },
  },
  {
    id: 'omip-101',
    name: 'OMIP-101',
    summary: '27-color fixed human whole-blood panel',
    sourceUrl: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC10958279/',
    context: {
      species: 'human',
      tissue: 'peripheral-blood',
      population: 'all',
      condition: 'baseline',
    },
  },
]

const legacyOmipMetadataById = new Map(
  LEGACY_OMIP_METADATA.map((template) => [template.id, template]),
)

function omipSpecies(title: string, template: OmipTemplate | null): OmipCatalogEntry['species'] {
  if (template?.context.species === 'human' || template?.context.species === 'mouse') {
    return template.context.species
  }
  const normalized = title.toLocaleLowerCase()
  if (/\b(human|people|patient|pbmc)\b/.test(normalized)) return 'human'
  if (/\b(mouse|mice|murine)\b/.test(normalized)) return 'mouse'
  if (/\b(macaque|baboon|rhesus|nonhuman primate|non-human primate)\b/.test(normalized)) {
    return 'non-human-primate'
  }
  return 'other'
}

export function inferOmipCellTypes(description: string): string[] {
  const normalized = description.toLocaleLowerCase()
  const cellTypes = new Set<string>()
  const addWhen = (label: string, pattern: RegExp) => {
    if (pattern.test(normalized)) cellTypes.add(label)
  }

  addWhen('T cells', /\bt[\s-]?cells?\b|\btregs?\b|regulatory t|\bthymop|\bthymocytes?\b|\bth(?:1|2|17)\b|γδ/)
  addWhen('Regulatory T cells', /regulatory t|\btregs?\b/)
  addWhen('B cells', /\bb[\s-]?cells?\b|plasma cells?|antibody secreting/)
  addWhen('NK cells', /natural killer|\bnk[\s-]?cells?\b/)
  addWhen('Dendritic cells', /dendritic/)
  addWhen('Monocytes', /monocytes?/)
  addWhen('Macrophages', /macrophages?/)
  addWhen('Granulocytes', /granulocytes?|neutrophils?|eosinophils?|basophils?/)
  addWhen('Platelets', /platelets?|megakaryocytes?/)
  addWhen('Innate lymphoid cells', /innate lymphoid/)
  addWhen('Stem / progenitor cells', /stem cells?|progenitors?|hematopoiesis/)
  addWhen('Tumor cells', /tumou?r cells?|cancer cells?/)

  if (/major immune|immune cell landscape|comprehensive immunophenotyping|major leukocyte|major lineages|peripheral blood leukocytes|human immune system|lymphoid subsets/.test(normalized)) {
    cellTypes.add('Mixed immune cells')
  }
  if (cellTypes.size === 0) cellTypes.add('Mixed immune cells')
  return [...cellTypes]
}

// PubMed title/abstract query:
// OMIP[Title] AND (spectral OR full spectrum OR Cytek Aurora OR spectral cytometer)
const SPECTRAL_OMIP_NUMBERS = new Set([
  120, 119, 118, 117, 116, 115, 114, 112, 111, 110, 109, 105,
  104, 102, 99, 97, 95, 94, 93, 86, 84, 83, 69,
])

// Native acquisition systems reported by the OMIP publications. These labels
// describe the validated source panel; import compatibility is checked
// separately against the active OpenPanel detector configuration.
const SPECTRAL_OMIP_CYTOMETERS: Record<number, string[]> = {
  120: ['Cytek Aurora 4L (UV-V-B-R)'],
  119: ['Cytek Aurora 5L (UV-V-B-YG-R)'],
  118: ['Cytek Aurora 5L (UV-V-B-YG-R)'],
  117: ['Cytek Aurora 5L (UV-V-B-YG-R)'],
  116: ['BD FACSymphony A5 SE'],
  115: ['Sony ID7000'],
  114: ['Cytek Aurora 5L (UV-V-B-YG-R)'],
  112: ['Sony ID7000 5L (UV-V-B-YG-R)'],
  111: ['Sony ID7000'],
  110: ['Cytek Aurora 5L (UV-V-B-YG-R)'],
  109: ['Cytek Aurora 5L (UV-V-B-YG-R)'],
  105: ['BD FACSymphony A5 SE'],
  104: ['Cytek Aurora 5L (UV-V-B-YG-R)'],
  102: ['Sony ID7000 7L', 'BD FACSDiscover S8 5L'],
  99: ['Cytek Aurora 5L (UV-V-B-YG-R)'],
  97: ['Cytek Northern Lights 3L (V-B-R)'],
  95: ['Cytek Aurora 5L (UV-V-B-YG-R)'],
  94: ['Cytek Aurora 3L (V-B-R)'],
  93: ['Cytek Aurora 5L (UV-V-B-YG-R)'],
  86: ['Cytek Aurora 5L (UV-V-B-YG-R)'],
  84: ['Cytek Aurora 5L (UV-V-B-YG-R)'],
  83: ['Cytek Aurora 3L (V-B-R)'],
  69: ['Cytek Aurora 5L (UV-V-B-YG-R)'],
}

function spectralOmipContext(title: string): CoexpressionContext {
  const normalized = title.toLocaleLowerCase()
  const species: CoexpressionContext['species'] = /\b(mouse|mice|murine)\b/.test(normalized)
    ? 'mouse'
    : 'human'
  const tissue: CoexpressionContext['tissue'] = /\b(tumou?r|cancer|osteosarcoma)\b/.test(normalized)
    ? 'tumor'
    : /\bbone marrow\b/.test(normalized)
      ? 'bone-marrow'
      : /\b(spleen|splenocyte|lymphoid tissue)\b/.test(normalized)
        ? 'spleen'
        : /\b(peripheral blood|whole blood|platelet)\b/.test(normalized)
          ? 'peripheral-blood'
          : 'pbmc'
  const population: CoexpressionContext['population'] = /\bnatural killer\b|\bnk cell\b/.test(normalized)
    ? 'nk-cells'
    : /\bt cell\b|\bt-cell\b|\bthymop/.test(normalized)
      ? 't-cells'
      : 'all'

  return {
    species,
    tissue,
    population,
    condition: /\b(tumou?r|cancer|osteosarcoma)\b/.test(normalized) ? 'tumor' : 'baseline',
  }
}

export const OMIP_TEMPLATES: OmipTemplate[] = OMIP_CATALOG_RECORDS
  .filter(([number]) => SPECTRAL_OMIP_NUMBERS.has(number))
  .map(([number, pmid, , title]) => {
    const paddedNumber = String(number).padStart(3, '0')
    const id = `omip-${paddedNumber}`
    const legacyMetadata = legacyOmipMetadataById.get(id)

    return {
      id,
      name: `OMIP-${paddedNumber}`,
      summary: legacyMetadata?.summary ?? title,
      sourceUrl: legacyMetadata?.sourceUrl ?? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
      context: legacyMetadata?.context ?? spectralOmipContext(title),
      markers: (SPECTRAL_OMIP_TEMPLATE_ROWS[number] ?? []).map(([name, fluorophore]) => ({
        name,
        fluorophore,
      })),
    }
  })

const omipTemplatesById = new Map(OMIP_TEMPLATES.map((template) => [template.id, template]))

export const OMIP_CATALOG: OmipCatalogEntry[] = OMIP_CATALOG_RECORDS
  .filter(([number]) => SPECTRAL_OMIP_NUMBERS.has(number))
  .map(
    ([number, pmid, year, title]) => {
      const paddedNumber = String(number).padStart(3, '0')
      const id = `omip-${paddedNumber}`
      const template = omipTemplatesById.get(id) ?? null

      return {
        id,
        name: `OMIP-${paddedNumber}`,
        summary: template?.summary ?? title,
        year,
        cytometers: SPECTRAL_OMIP_CYTOMETERS[number] ?? ['Not reported'],
        species: omipSpecies(title, template),
        cellTypes: inferOmipCellTypes(title),
        method: 'spectral',
        sourceUrl: template?.sourceUrl ?? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
        template,
      }
    },
  )
