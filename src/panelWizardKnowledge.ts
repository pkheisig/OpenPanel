import { coexpressionKey } from './panelWizardEngine'
import type {
  CoexpressionLevel,
  MarkerFrequency,
  WizardMarker,
} from './panelWizardEngine'
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

export const MARKER_OPTIONS: UiSelectOption[] = MARKERS.map(({ name, aliases = [] }) => ({
  value: name,
  label: name,
  searchText: [name, ...aliases].join(' '),
}))

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

const CELL_TYPE_MARKERS: Array<[RegExp, string[]]> = [
  [/regulatory t/i, ['CD3', 'CD4', 'CD25', 'CD127', 'FoxP3', 'CTLA-4']],
  [/(?:cd4 )?t cells?/i, ['CD3', 'CD4', 'CD8', 'CD25', 'CD27', 'CD28', 'CD45RA', 'CD45RO', 'CD62L', 'CCR7', 'PD-1']],
  [/b cells?|plasma/i, ['CD19', 'CD20', 'CD21', 'CD22', 'CD27', 'CD38', 'CD138', 'HLA-DR', 'IgD', 'IgM']],
  [/nk|nkt/i, ['CD3', 'CD16', 'CD56', 'CD57', 'CD94', 'CD107a', 'Granzyme B', 'Perforin']],
  [/mono|macrophage/i, ['CD11b', 'CD14', 'CD16', 'CD33', 'CD36', 'CD45', 'CD64', 'CD88', 'CD163', 'CD206', 'HLA-DR']],
  [/dendritic/i, ['CD1c', 'CD11c', 'CD123', 'CD141', 'CD304', 'HLA-DR']],
  [/neutrophil|eosinophil|basophil/i, ['CD11b', 'CD15', 'CD16', 'CD45', 'CD66b', 'CCR3']],
  [/tumor|epithelial/i, ['EpCAM', 'CD47', 'CD54', 'CD71', 'PD-L1', 'Vimentin']],
  [/fibroblast|stromal/i, ['CD90', 'CD105', 'CD146', 'CD271', 'Vimentin']],
]

export function markerOptionsForPanel(
  cellType: string,
  selectedNames: string[],
  species: CoexpressionContext['species'],
): UiSelectOption[] {
  const contextual = new Set(
    CELL_TYPE_MARKERS.find(([pattern]) => pattern.test(cellType))?.[1].map(normalizeMarkerName) ?? [],
  )
  if (species === 'mouse') contextual.add('B220')
  const selected = new Set(selectedNames.map(normalizeMarkerName))
  return [...MARKER_OPTIONS].sort((left, right) => {
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
  cellType?: string
  frequency?: MarkerFrequency
}

export type OmipTemplate = {
  id: string
  name: string
  summary: string
  sourceUrl: string
  context: CoexpressionContext
  markers: OmipTemplateMarker[]
}

export const OMIP_DATABASE_URL = 'https://public.tableau.com/app/profile/fanny2212/viz/OMIP_ISAC/Menu'

export const OMIP_TEMPLATES: OmipTemplate[] = [
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
    markers: [
      { name: 'CD14', fluorophore: 'BUV395', cellType: 'Monocytes' },
      { name: 'Live/Dead', frequency: 'low' },
      { name: 'CD16', fluorophore: 'BUV496', cellType: 'Monocytes' },
      { name: 'HLA-DR', fluorophore: 'BUV661' },
      { name: 'CD56', fluorophore: 'BUV737', cellType: 'NK cells' },
      { name: 'CD38', fluorophore: 'BV421' },
      { name: 'CD20', fluorophore: 'BV450', cellType: 'B cells' },
      { name: 'CD4', fluorophore: 'BV510', cellType: 'CD4 T cells' },
      { name: 'CCR4', fluorophore: 'BV605', cellType: 'T cells' },
      { name: 'CD8', fluorophore: 'BV650', cellType: 'CD8 T cells' },
      { name: 'CD25', fluorophore: 'BV711', cellType: 'Regulatory T cells' },
      { name: 'CCR6', fluorophore: 'BV785', cellType: 'T cells' },
      { name: 'CD3', fluorophore: 'Alexa Fluor 488', cellType: 'T cells', frequency: 'high' },
      { name: 'CD45RA', fluorophore: 'PerCP-Cy5.5', cellType: 'T cells' },
      { name: 'CXCR3', fluorophore: 'PE', cellType: 'T cells' },
      { name: 'CCR7', fluorophore: 'PE-CF594', cellType: 'T cells' },
      { name: 'CD11c', fluorophore: 'PE-Cy5', cellType: 'Dendritic cells' },
      { name: 'CXCR5', fluorophore: 'PE-Cy7', cellType: 'T cells' },
      { name: 'CCR10', fluorophore: 'APC', cellType: 'T cells', frequency: 'low' },
      { name: 'CD123', fluorophore: 'Alexa Fluor 700', cellType: 'Dendritic cells' },
      { name: 'CD127', fluorophore: 'APC-eFluor 780', cellType: 'T cells' },
    ],
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
    markers: [
      { name: 'CD19', fluorophore: 'APC-H7', cellType: 'B cells', frequency: 'high' },
      { name: 'CD20', fluorophore: 'BUV805', cellType: 'B cells' },
      { name: 'CD141', fluorophore: 'BB630', cellType: 'Dendritic cells', frequency: 'low' },
      { name: 'CD123', fluorophore: 'BB660', cellType: 'Dendritic cells' },
      { name: 'CD11c', fluorophore: 'PE-Cy5.5', cellType: 'Dendritic cells' },
      { name: 'CD1c', fluorophore: 'BUV395', cellType: 'Dendritic cells' },
      { name: 'HLA-DR', fluorophore: 'BUV661' },
      { name: 'CD14', fluorophore: 'BV510', cellType: 'Monocytes' },
      { name: 'CD27', fluorophore: 'APC-R700', cellType: 'B cells' },
      { name: 'IgA', fluorophore: 'APC', cellType: 'B cells' },
      { name: 'IgD', fluorophore: 'BB790', cellType: 'B cells' },
      { name: 'CD21', fluorophore: 'BUV496', cellType: 'B cells' },
      { name: 'IgG', fluorophore: 'BUV737', cellType: 'B cells' },
      { name: 'IgM', fluorophore: 'BV570', cellType: 'B cells' },
      { name: 'CD10', fluorophore: 'BV650', cellType: 'B cells' },
      { name: 'CD23', fluorophore: 'BV711', cellType: 'B cells' },
      { name: 'CD16', fluorophore: 'BB700', cellType: 'Monocytes' },
      { name: 'CD32', fluorophore: 'PE' },
      { name: 'CD64', fluorophore: 'BV786', cellType: 'Monocytes' },
      { name: 'CD73', fluorophore: 'BB515', cellType: 'B cells' },
      { name: 'CD85j', fluorophore: 'PE-Cy5' },
      { name: 'CD40', fluorophore: 'PE-Dazzle 594', cellType: 'B cells' },
      { name: 'TACI', fluorophore: 'BUV563', cellType: 'B cells' },
      { name: 'IL-21R', fluorophore: 'BV421', cellType: 'B cells' },
      { name: 'BAFF-R', fluorophore: 'BV605', cellType: 'B cells' },
      { name: 'CXCR3', fluorophore: 'PE-Cy7', cellType: 'B cells' },
      { name: 'CXCR5', fluorophore: 'BV750', cellType: 'B cells' },
      { name: 'Live/Dead', fluorophore: 'LIVE DEAD Blue', frequency: 'low' },
    ],
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
    markers: [
      { name: 'Live/Dead', fluorophore: 'LIVE DEAD Blue', frequency: 'low' },
      { name: 'CD45', fluorophore: 'PerCP', frequency: 'high' },
      { name: 'CD3', fluorophore: 'BV510', cellType: 'T cells', frequency: 'high' },
      { name: 'CD4', fluorophore: 'cFluor YG584', cellType: 'CD4 T cells' },
      { name: 'CD8', fluorophore: 'BUV805', cellType: 'CD8 T cells' },
      { name: 'CD25', fluorophore: 'PE-Alexa Fluor 700', cellType: 'Regulatory T cells' },
      { name: 'TCR γ/δ', fluorophore: 'PerCP-eFluor 710', cellType: 'T cells', frequency: 'low' },
      { name: 'CD14', fluorophore: 'Spark Blue 550', cellType: 'Monocytes' },
      { name: 'CD16', fluorophore: 'BUV496', cellType: 'Monocytes' },
      { name: 'CD11c', fluorophore: 'eFluor 450', cellType: 'Dendritic cells' },
      { name: 'CD19', fluorophore: 'Spark NIR 685', cellType: 'B cells' },
      { name: 'CD20', fluorophore: 'Pacific Orange', cellType: 'B cells' },
      { name: 'CD24', fluorophore: 'PE-Alexa Fluor 610', cellType: 'B cells' },
      { name: 'CD39', fluorophore: 'BUV661' },
      { name: 'IgD', fluorophore: 'BV480', cellType: 'B cells' },
      { name: 'IgG', fluorophore: 'BV605', cellType: 'B cells' },
      { name: 'IgM', fluorophore: 'BV570', cellType: 'B cells' },
      { name: 'CD141', fluorophore: 'BB515', cellType: 'Dendritic cells' },
      { name: 'CD1c', fluorophore: 'Alexa Fluor 647', cellType: 'Dendritic cells' },
      { name: 'CD123', fluorophore: 'Super Bright 436', cellType: 'Dendritic cells' },
      { name: 'CD2', fluorophore: 'PerCP-Cy5.5', cellType: 'T cells' },
      { name: 'CD56', fluorophore: 'BUV737', cellType: 'NK cells' },
      { name: 'CCR7', fluorophore: 'BV421', cellType: 'T cells' },
      { name: 'CD27', fluorophore: 'APC-H7' },
      { name: 'CD28', fluorophore: 'BV650', cellType: 'T cells' },
      { name: 'CD45RA', fluorophore: 'BUV395', cellType: 'T cells' },
      { name: 'CD95', fluorophore: 'PE-Cy5', cellType: 'T cells' },
      { name: 'CD127', fluorophore: 'APC-R700', cellType: 'T cells' },
      { name: 'CD337', fluorophore: 'PE-Dazzle 594', cellType: 'NK cells' },
      { name: 'CCR6', fluorophore: 'BV711', cellType: 'T cells' },
      { name: 'CCR5', fluorophore: 'BUV563', cellType: 'T cells' },
      { name: 'CXCR5', fluorophore: 'BV750', cellType: 'T cells' },
      { name: 'CXCR3', fluorophore: 'PE-Cy7', cellType: 'T cells' },
      { name: 'HLA-DR', fluorophore: 'PE-Fire 810' },
      { name: 'CD38', fluorophore: 'APC-Fire 810' },
      { name: 'CD57', fluorophore: 'FITC' },
      { name: 'PD-1', fluorophore: 'BV785', cellType: 'T cells' },
      { name: 'CD159a', fluorophore: 'APC', cellType: 'NK cells' },
      { name: 'CD159c', fluorophore: 'PE', cellType: 'NK cells' },
      { name: 'CD314', fluorophore: 'BUV615', cellType: 'NK cells' },
    ],
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
    markers: [
      { name: 'CD1c', fluorophore: 'PE', cellType: 'Dendritic cells' },
      { name: 'CD3', fluorophore: 'BV605', cellType: 'T cells', frequency: 'high' },
      { name: 'CD14', fluorophore: 'BV711', cellType: 'Monocytes' },
      { name: 'CD15', fluorophore: 'PerCP-Cy5.5', cellType: 'Neutrophils' },
      { name: 'CD16', cellType: 'Monocytes' },
      { name: 'CD19', fluorophore: 'APC-R700', cellType: 'B cells' },
      { name: 'CD34', fluorophore: 'FITC', cellType: 'Hematopoietic stem/progenitor cells', frequency: 'low' },
      { name: 'CD38', fluorophore: 'BV421' },
      { name: 'CD45', fluorophore: 'BV480', frequency: 'high' },
      { name: 'CD56', fluorophore: 'PE-Cy7', cellType: 'NK cells' },
      { name: 'CD123', fluorophore: 'BV650', cellType: 'Dendritic cells' },
      { name: 'CD141', fluorophore: 'APC', cellType: 'Dendritic cells', frequency: 'low' },
      { name: 'CCR3', fluorophore: 'PE-CF594', cellType: 'Eosinophils' },
      { name: 'HLA-DR', fluorophore: 'BV786' },
    ],
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
    markers: [
      { name: 'CD3', fluorophore: 'Alexa Fluor 700', cellType: 'T cells', frequency: 'high' },
      { name: 'CD4', fluorophore: 'BUV395', cellType: 'CD4 T cells', frequency: 'high' },
      { name: 'CD25', fluorophore: 'PE-CF594', cellType: 'Regulatory T cells' },
      { name: 'CD127', fluorophore: 'BV786', cellType: 'T cells' },
      { name: 'CD45RA', fluorophore: 'BUV496', cellType: 'T cells' },
      { name: 'CD28', fluorophore: 'BV711', cellType: 'T cells' },
      { name: 'CD95', fluorophore: 'BUV737', cellType: 'T cells' },
      { name: 'CCR3', fluorophore: 'BV510', cellType: 'T cells', frequency: 'low' },
      { name: 'CCR4', fluorophore: 'BV605', cellType: 'T cells' },
      { name: 'CCR5', fluorophore: 'PE-Cy7', cellType: 'T cells' },
      { name: 'CCR6', fluorophore: 'APC', cellType: 'T cells' },
      { name: 'CCR7', fluorophore: 'BV421', cellType: 'T cells' },
      { name: 'CCR10', fluorophore: 'PerCP-Cy5.5', cellType: 'T cells', frequency: 'low' },
      { name: 'CXCR3', fluorophore: 'PE-Cy5', cellType: 'T cells' },
      { name: 'CXCR5', fluorophore: 'PE', cellType: 'T cells' },
      { name: 'Integrin β7', fluorophore: 'BV650', cellType: 'T cells' },
      { name: 'CLA', fluorophore: 'FITC', cellType: 'T cells' },
      { name: 'Live/Dead', fluorophore: 'LIVE DEAD NIR', frequency: 'low' },
    ],
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
    markers: [
      { name: 'CD45', fluorophore: 'BV785', frequency: 'high' },
      { name: 'CD66b', fluorophore: 'BV750', cellType: 'Neutrophils' },
      { name: 'CD33', fluorophore: 'PE-Cy5', cellType: 'Monocytes' },
      { name: 'CD14', fluorophore: 'BB660', cellType: 'Monocytes' },
      { name: 'CD11c', fluorophore: 'BUV661', cellType: 'Dendritic cells' },
      { name: 'CD19', fluorophore: 'R718', cellType: 'B cells' },
      { name: 'CD56', fluorophore: 'BV711', cellType: 'NK cells' },
      { name: 'CD127', fluorophore: 'PE-Cy5.5', cellType: 'T cells' },
      { name: 'CD3', fluorophore: 'BUV496', cellType: 'T cells', frequency: 'high' },
      { name: 'CD4', fluorophore: 'BV480', cellType: 'CD4 T cells' },
      { name: 'CD8', fluorophore: 'BV570', cellType: 'CD8 T cells' },
      { name: 'TCR γ/δ', fluorophore: 'BUV395', cellType: 'T cells', frequency: 'low' },
      { name: 'TRAV1.2', fluorophore: 'PE', cellType: 'T cells', frequency: 'low' },
      { name: 'CD161', fluorophore: 'BV650' },
      { name: 'CD38', fluorophore: 'BB700' },
      { name: 'HLA-DR', fluorophore: 'BUV563' },
      { name: 'CD32', fluorophore: 'BB630' },
      { name: 'CD16', fluorophore: 'BV605' },
      { name: 'IgD', fluorophore: 'BUV737', cellType: 'B cells' },
      { name: 'CD27', fluorophore: 'BUV805' },
      { name: 'CD57', fluorophore: 'BB515' },
      { name: 'CD45RA', fluorophore: 'APC-eFluor 780', cellType: 'T cells' },
      { name: 'CCR7', fluorophore: 'PE-CF594', cellType: 'T cells' },
      { name: 'Vδ2', fluorophore: 'BB790', cellType: 'T cells', frequency: 'low' },
      { name: 'Perforin', fluorophore: 'BV421', cellType: 'T cells' },
      { name: 'Granzyme B', fluorophore: 'Alexa Fluor 647', cellType: 'T cells' },
      { name: 'Ki-67', fluorophore: 'PE-Cy7' },
    ],
  },
]
