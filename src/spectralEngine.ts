import { Matrix, SingularValueDecomposition } from 'ml-matrix'
import { canonicalizeFluorophoreName, fluorophoreIdentity, resolveBundledFluorophoreKey } from './fluorophoreNames'
import {
  PINNED_FLUOROPHORE_ALIAS_TO_CANONICAL,
  PINNED_CONVENTIONAL_ESTIMATE_FLUOROPHORE_KEYS,
  PINNED_CONVENTIONAL_DETECTOR_METADATA,
  PINNED_MARKER_ALIASES,
  PINNED_MARKER_KEYS,
  PINNED_PANEL_WIZARD_BRIGHTNESS_KEYS,
  PINNED_PANEL_WIZARD_BRIGHTNESS_SCORES,
  PINNED_BUNDLED_DATA_SHA256,
  PINNED_SPECTRAL_FLUOROPHORE_KEYS,
} from './spectralLibraryManifest'
import type {
  ConfigurationInfo,
  DetectorInfo,
  FluorInfo,
  LibraryInfo,
  NumericRow,
  PanelMeasurementMode,
  PanelPayload,
  ResponseMatrixProvenance,
} from './panelBuilderShared'
import { responseProvenanceForCytometer } from './panelBuilderShared'

export { resolveBundledFluorophoreKey } from './fluorophoreNames'

type CytometerId =
  | 'aurora'
  | 'discover'
  | 'id7000'
  | 'xenith'
  | 'symphony'
  | 'fortessa'
  | 'celesta'
  | 'attune_nxt'
  | 'accuri_c6_plus'
  | 'facscalibur'
  | 'canto'
  | 'lyric'
  | 'ze5'
  | 'cytpix'
  | 'quanteon'
  | 'macsquant'
  | 'facsverse'
  | 'lsrii'
  | 'cytoflex_lx'
  | 'navios'
  | 'dxflex'
  | 'facsaria_fusion'

type CsvRow = Record<string, string>

export type BundledDataValidationOptions = {
  requireComplete?: boolean
}

type FluorophoreMapping = {
  confidence: 'curated' | 'estimated'
  source?: string
  note?: string
}

export type SpectralLibrary = {
  detectors: string[]
  fluorophores: string[]
  values: number[][]
  response_provenance: ResponseMatrixProvenance
  fluorophoreMappings?: Map<string, FluorophoreMapping>
}

export const BUNDLED_DATA_FILES = [
  'aurora_spectra.csv',
  'discover_spectra.csv',
  'id7000_spectra.csv',
  'xenith_spectra.csv',
  'symphony_spectra.csv',
  'cytometer_dictionary.csv',
  'fluorophore_dictionary.csv',
  'conventional_detector_dictionary.csv',
  'conventional_fluorophore_estimates.csv',
  'marker_dictionary.csv',
  'panel_wizard_brightness.csv',
  'panel_wizard_antigen_density.csv',
] as const

type SpectralResponseDomain = {
  minimum: number
  maximum: number
  meaningfulThreshold: number
  description: string
}

const DEFAULT_SPECTRAL_RESPONSE_DOMAIN: SpectralResponseDomain = {
  minimum: -1,
  maximum: 1,
  meaningfulThreshold: 1e-12,
  description: 'signed normalized response domain [-1, 1]; retained baseline residuals may be negative',
}

const SPECTRAL_RESPONSE_DOMAINS: Record<string, SpectralResponseDomain> = {
  'aurora_spectra.csv': DEFAULT_SPECTRAL_RESPONSE_DOMAIN,
  'discover_spectra.csv': DEFAULT_SPECTRAL_RESPONSE_DOMAIN,
  'id7000_spectra.csv': DEFAULT_SPECTRAL_RESPONSE_DOMAIN,
  'xenith_spectra.csv': DEFAULT_SPECTRAL_RESPONSE_DOMAIN,
  'symphony_spectra.csv': DEFAULT_SPECTRAL_RESPONSE_DOMAIN,
}

type SpectralLibraryExpectation = {
  detectors: readonly string[]
  fluorophoreCount: number
}

function detectorRange(prefix: string, first: number, last: number): string[] {
  return Array.from({ length: last - first + 1 }, (_, index) => `${prefix}${first + index}-A`)
}

function indexedWavelengthDetectors(prefix: string, wavelengths: readonly number[]): string[] {
  return wavelengths.map((wavelength, index) => `${prefix}${index + 1} (${wavelength})-A`)
}

function wavelengthDetectors(prefix: string, wavelengths: readonly number[]): string[] {
  return wavelengths.map((wavelength) => `${prefix}${wavelength}-A`)
}

// These dimensions and channel sets are part of the bundled-data contract.
// Keep them pinned so a truncated or substituted response cannot silently
// produce a partial panel payload.
const SPECTRAL_LIBRARY_EXPECTATIONS: Record<string, SpectralLibraryExpectation> = {
  'aurora_spectra.csv': {
    detectors: [
      ...detectorRange('UV', 1, 16),
      ...detectorRange('V', 1, 16),
      ...detectorRange('B', 1, 14),
      ...detectorRange('YG', 1, 10),
      ...detectorRange('R', 1, 8),
    ],
    fluorophoreCount: 395,
  },
  'discover_spectra.csv': {
    detectors: [
      ...indexedWavelengthDetectors('UV', [375, 390, 420, 440, 460, 475, 500, 515, 530, 545, 575, 590, 605, 625, 655, 675, 700, 725, 750, 780, 810, 845]),
      ...indexedWavelengthDetectors('V', [420, 440, 460, 475, 500, 515, 530, 545, 575, 590, 605, 625, 655, 675, 700, 725, 750, 780, 810, 845]),
      ...indexedWavelengthDetectors('B', [500, 515, 530, 545, 575, 590, 605, 625, 655, 675, 700, 725, 750, 780, 810, 845]),
      ...indexedWavelengthDetectors('YG', [575, 590, 605, 625, 655, 675, 700, 725, 750, 780, 810, 845]),
      ...indexedWavelengthDetectors('R', [655, 675, 700, 725, 750, 780, 810, 845]),
    ],
    fluorophoreCount: 78,
  },
  'id7000_spectra.csv': {
    detectors: [
      ...detectorRange('320CH', 1, 35),
      ...detectorRange('355CH', 1, 35),
      ...detectorRange('405CH', 1, 35),
      ...detectorRange('488CH', 4, 35),
      ...detectorRange('561CH', 10, 35),
      ...detectorRange('637CH', 17, 35),
    ],
    fluorophoreCount: 65,
  },
  'xenith_spectra.csv': {
    detectors: Array.from({ length: 51 }, (_, index) => `FL${String(index).padStart(2, '0')}-A`),
    fluorophoreCount: 63,
  },
  'symphony_spectra.csv': {
    detectors: [
      ...wavelengthDetectors('UV', [379, 446, 515, 540, 585, 610, 660, 695, 736, 809]),
      ...wavelengthDetectors('V', [427, 450, 470, 510, 540, 576, 595, 615, 660, 680, 710, 750, 785, 845]),
      ...wavelengthDetectors('B', [510, 537, 576, 602, 660, 675, 710, 750, 810]),
      ...wavelengthDetectors('YG', [585, 602, 660, 670, 695, 730, 750, 780, 825]),
      ...wavelengthDetectors('R', [660, 675, 680, 710, 730, 780]),
    ],
    fluorophoreCount: 24,
  },
}

export class BundledDataValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BundledDataValidationError'
  }
}

const LIBRARIES: LibraryInfo[] = [
  { id: 'aurora', label: 'Cytek Aurora', measurement_mode: 'spectral', response_provenance: responseProvenanceForCytometer('aurora', 'spectral', 'aurora_spectra.csv') },
  { id: 'discover', label: 'BD FACSDiscover', measurement_mode: 'spectral', response_provenance: responseProvenanceForCytometer('discover', 'spectral', 'discover_spectra.csv') },
  { id: 'id7000', label: 'Sony ID7000', measurement_mode: 'spectral', response_provenance: responseProvenanceForCytometer('id7000', 'spectral', 'id7000_spectra.csv') },
  { id: 'xenith', label: 'Thermo Fisher Attune Xenith', measurement_mode: 'spectral', response_provenance: responseProvenanceForCytometer('xenith', 'spectral', 'xenith_spectra.csv') },
  { id: 'symphony', label: 'BD FACSymphony A5 SE', measurement_mode: 'conventional', response_provenance: responseProvenanceForCytometer('symphony', 'conventional') },
  { id: 'fortessa', label: 'BD LSRFortessa', measurement_mode: 'conventional', response_provenance: responseProvenanceForCytometer('fortessa', 'conventional') },
  { id: 'celesta', label: 'BD FACSCelesta', measurement_mode: 'conventional', response_provenance: responseProvenanceForCytometer('celesta', 'conventional') },
  { id: 'attune_nxt', label: 'Thermo Fisher Attune NxT', measurement_mode: 'conventional', response_provenance: responseProvenanceForCytometer('attune_nxt', 'conventional') },
  { id: 'accuri_c6_plus', label: 'BD Accuri C6 Plus', measurement_mode: 'conventional', response_provenance: responseProvenanceForCytometer('accuri_c6_plus', 'conventional') },
  { id: 'facscalibur', label: 'BD FACSCalibur', measurement_mode: 'conventional', response_provenance: responseProvenanceForCytometer('facscalibur', 'conventional') },
  { id: 'canto', label: 'BD FACSCanto II', measurement_mode: 'conventional', response_provenance: responseProvenanceForCytometer('canto', 'conventional') },
  { id: 'lyric', label: 'BD FACSLyric', measurement_mode: 'conventional', response_provenance: responseProvenanceForCytometer('lyric', 'conventional') },
  { id: 'ze5', label: 'Bio-Rad ZE5', measurement_mode: 'conventional', response_provenance: responseProvenanceForCytometer('ze5', 'conventional') },
  { id: 'cytpix', label: 'Thermo Fisher Attune CytPix', measurement_mode: 'conventional', response_provenance: responseProvenanceForCytometer('cytpix', 'conventional') },
  { id: 'quanteon', label: 'Agilent NovoCyte Quanteon', measurement_mode: 'conventional', response_provenance: responseProvenanceForCytometer('quanteon', 'conventional') },
  { id: 'macsquant', label: 'Miltenyi MACSQuant', measurement_mode: 'conventional', response_provenance: responseProvenanceForCytometer('macsquant', 'conventional') },
  { id: 'facsverse', label: 'BD FACSVerse', measurement_mode: 'conventional', response_provenance: responseProvenanceForCytometer('facsverse', 'conventional') },
  { id: 'lsrii', label: 'BD LSR II', measurement_mode: 'conventional', response_provenance: responseProvenanceForCytometer('lsrii', 'conventional') },
  { id: 'cytoflex_lx', label: 'Beckman Coulter CytoFLEX LX', measurement_mode: 'conventional', response_provenance: responseProvenanceForCytometer('cytoflex_lx', 'conventional') },
  { id: 'navios', label: 'Beckman Coulter Navios', measurement_mode: 'conventional', response_provenance: responseProvenanceForCytometer('navios', 'conventional') },
  { id: 'dxflex', label: 'Beckman Coulter DxFLEX', measurement_mode: 'conventional', response_provenance: responseProvenanceForCytometer('dxflex', 'conventional') },
  { id: 'facsaria_fusion', label: 'BD FACSAria Fusion', measurement_mode: 'conventional', response_provenance: responseProvenanceForCytometer('facsaria_fusion', 'conventional') },
]

const LIBRARY_FILES: Partial<Record<CytometerId, string>> = {
  aurora: 'aurora_spectra.csv',
  discover: 'discover_spectra.csv',
  id7000: 'id7000_spectra.csv',
  xenith: 'xenith_spectra.csv',
  symphony: 'symphony_spectra.csv',
}

const CYTOMETER_ALIASES: Record<string, CytometerId> = {
  aurora: 'aurora',
  cytekaurora: 'aurora',
  discover: 'discover',
  facsdiscover: 'discover',
  bdfacsdiscover: 'discover',
  discovers8: 'discover',
  discovera8: 'discover',
  id7000: 'id7000',
  sonyid7000: 'id7000',
  xenith: 'xenith',
  attunexenith: 'xenith',
  thermofisherxenith: 'xenith',
  thermofisherattunexenith: 'xenith',
  thermoscientificxenith: 'xenith',
  thermoscientificattunexenith: 'xenith',
  symphony: 'symphony',
  facsymphony: 'symphony',
  facssymphony: 'symphony',
  bdfacsymphony: 'symphony',
  a5se: 'symphony',
  bdfacsymphonya5se: 'symphony',
  bdfacssymphonya5se: 'symphony',
  fortessa: 'fortessa',
  lsrfortessa: 'fortessa',
  bdlsrfortessa: 'fortessa',
  celesta: 'celesta',
  facscelesta: 'celesta',
  bdfacscelesta: 'celesta',
  bdcelesta: 'celesta',
  attune: 'attune_nxt',
  attunenxt: 'attune_nxt',
  thermofisherattunenxt: 'attune_nxt',
  thermoscientificattunenxt: 'attune_nxt',
  accuri: 'accuri_c6_plus',
  accuric6: 'accuri_c6_plus',
  accuric6plus: 'accuri_c6_plus',
  bdaccuric6plus: 'accuri_c6_plus',
  facscalibur: 'facscalibur',
  bdfacscalibur: 'facscalibur',
  calibur: 'facscalibur',
  canto: 'canto',
  facscanto: 'canto',
  facscanto2: 'canto',
  facscantoii: 'canto',
  bdfacscanto: 'canto',
  bdfacscanto2: 'canto',
  bdfacscantoii: 'canto',
  lyric: 'lyric',
  facslyric: 'lyric',
  bdfacslyric: 'lyric',
  ze5: 'ze5',
  bioradze5: 'ze5',
  bioradze5cellanalyzer: 'ze5',
  cytpix: 'cytpix',
  attunecytpix: 'cytpix',
  thermofisherattunecytpix: 'cytpix',
  thermoscientificattunecytpix: 'cytpix',
  quanteon: 'quanteon',
  novocytequanteon: 'quanteon',
  agilentnovocytequanteon: 'quanteon',
  macsquant: 'macsquant',
  macsquantanalyzer: 'macsquant',
  macsquantanalyzer10: 'macsquant',
  macsquantanalyzer16: 'macsquant',
  macsquantvyb: 'macsquant',
  miltenyimacsquantanalyzer10: 'macsquant',
  miltenyimacsquantanalyzer16: 'macsquant',
  miltenyimacsquantvyb: 'macsquant',
  miltenyimacsquant: 'macsquant',
  facsverse: 'facsverse',
  bdfacsverse: 'facsverse',
  lsr2: 'lsrii',
  lsrii: 'lsrii',
  bdlsr2: 'lsrii',
  bdlsrii: 'lsrii',
  cytoflex: 'cytoflex_lx',
  cytoflexlx: 'cytoflex_lx',
  beckmancytoflexlx: 'cytoflex_lx',
  beckmancoultercytoflexlx: 'cytoflex_lx',
  navios: 'navios',
  naviosex: 'navios',
  beckmannavios: 'navios',
  beckmancoulternavios: 'navios',
  dxf: 'dxflex',
  dxflex: 'dxflex',
  beckmandxflex: 'dxflex',
  beckmancoulterdxflex: 'dxflex',
  facsariafusion: 'facsaria_fusion',
  bdfacsariafusion: 'facsaria_fusion',
  ariafusion: 'facsaria_fusion',
}

const CONFIGURATIONS: Record<CytometerId, ConfigurationInfo[]> = {
  aurora: [
    { id: '5l_uv_v_b_yg_r', label: 'Aurora 5L: UV/V/B/YG/R', description: '16UV-16V-14B-10YG-8R' },
    { id: '4l_uv_v_b_r', label: 'Aurora 4L: UV/V/B/R', description: '16UV-16V-14B-8R' },
    { id: '4l_v_b_yg_r', label: 'Aurora 4L: V/B/YG/R', description: '16V-14B-10YG-8R' },
    { id: '3l_v_b_r', label: 'Aurora 3L: V/B/R', description: '16V-14B-8R' },
  ],
  discover: [
    { id: 'discover_s8', label: 'FACSDiscover S8: UV/V/B/YG/R', description: '22UV-20V-16B-12YG-8R' },
    { id: 'discover_a8', label: 'FACSDiscover A8: UV/V/B/YG/R', description: '22UV-20V-16B-12YG-8R' },
  ],
  id7000: [
    { id: 'id7000_5l', label: 'ID7000 5L: UV/V/B/YG/R', description: '147 fluorescence detectors' },
    { id: 'id7000_4l', label: 'ID7000 4L: V/B/YG/R', description: '112 fluorescence detectors' },
    { id: 'id7000_3l', label: 'ID7000 3L: V/B/R', description: '86 fluorescence detectors' },
  ],
  xenith: [
    { id: 'full', label: 'Thermo Fisher Attune Xenith full detector set', description: 'All packaged detectors' },
  ],
  symphony: [
    { id: 'symphony_a5se', label: 'BD FACSymphony A5 SE: UV/V/B/YG/R', description: '10UV-14V-9B-9YG-6R' },
  ],
  fortessa: [
    { id: 'fortessa_3l', label: 'BD LSRFortessa 3L: V/B/R', description: '14 fluorescence detectors' },
    { id: 'fortessa_4l', label: 'BD LSRFortessa 4L: V/B/YG/R', description: '16 fluorescence detectors' },
  ],
  celesta: [
    { id: 'celesta_bv', label: 'BD FACSCelesta: Blue/Violet', description: '10 fluorescence detectors' },
    { id: 'celesta_bvr', label: 'BD FACSCelesta: Blue/Violet/Red', description: '12 fluorescence detectors' },
    { id: 'celesta_bvuv', label: 'BD FACSCelesta: Blue/Violet/UV', description: '12 fluorescence detectors' },
    { id: 'celesta_bvyg', label: 'BD FACSCelesta: Blue/Violet/Yellow-Green', description: '12 fluorescence detectors' },
  ],
  attune_nxt: [
    { id: 'attune_nxt_4l', label: 'Thermo Fisher Attune NxT: B/R/V/Y', description: '14 fluorescence detectors' },
  ],
  accuri_c6_plus: [
    { id: 'accuri_c6_plus_standard', label: 'BD Accuri C6 Plus: standard 3-blue/1-red', description: '4 fluorescence detectors' },
  ],
  facscalibur: [
    { id: 'facscalibur_2l_4', label: 'BD FACSCalibur: 2-laser 4-color', description: '4 fluorescence detectors' },
  ],
  canto: [
    { id: 'canto_2l_4_2', label: 'BD FACSCanto II: 2-laser 4-2', description: '6 fluorescence detectors' },
    { id: 'canto_3l_4_2_2', label: 'BD FACSCanto II: 3-laser 4-2-2', description: '8 fluorescence detectors' },
    { id: 'canto_2l_5_3', label: 'BD FACSCanto II: 2-laser 5-3', description: '8 fluorescence detectors' },
  ],
  lyric: [
    { id: 'lyric_2l_4', label: 'BD FACSLyric: 2-laser 4-color (3-1)', description: '4 fluorescence detectors' },
    { id: 'lyric_2l_6', label: 'BD FACSLyric: 2-laser 6-color (4-2)', description: '6 fluorescence detectors' },
    { id: 'lyric_3l_8', label: 'BD FACSLyric: 3-laser 8-color (4-2-2)', description: '8 fluorescence detectors' },
    { id: 'lyric_3l_10', label: 'BD FACSLyric: 3-laser 10-color (4-3-3)', description: '10 fluorescence detectors' },
    { id: 'lyric_3l_12', label: 'BD FACSLyric: 3-laser 12-color (4-3-5)', description: '12 fluorescence detectors' },
  ],
  ze5: [
    { id: 'ze5_3l_17', label: 'Bio-Rad ZE5: 3-laser (17 colors)', description: '17 fluorescence detectors' },
    { id: 'ze5_3l_17_option2', label: 'Bio-Rad ZE5: 3-laser option 2 (17 colors)', description: '17 fluorescence detectors' },
    { id: 'ze5_3l_20', label: 'Bio-Rad ZE5: 3-laser (20 colors)', description: '20 fluorescence detectors' },
    { id: 'ze5_4l_24', label: 'Bio-Rad ZE5: 4-laser (24 colors)', description: '24 fluorescence detectors' },
    { id: 'ze5_5l_27', label: 'Bio-Rad ZE5: 5-laser (27 colors)', description: '27 fluorescence detectors' },
  ],
  cytpix: [
    { id: 'cytpix_byxx', label: 'Thermo Fisher Attune CytPix: BYXX', description: '7 fluorescence detectors' },
    { id: 'cytpix_brxx', label: 'Thermo Fisher Attune CytPix: BRXX', description: '7 fluorescence detectors' },
    { id: 'cytpix_bv4xx', label: 'Thermo Fisher Attune CytPix: BV4XX', description: '7 fluorescence detectors' },
    { id: 'cytpix_bv6xx', label: 'Thermo Fisher Attune CytPix: BV6XX', description: '9 fluorescence detectors' },
    { id: 'cytpix_byrx', label: 'Thermo Fisher Attune CytPix: BYRX', description: '11 fluorescence detectors' },
    { id: 'cytpix_byv4x', label: 'Thermo Fisher Attune CytPix: BYV4X', description: '11 fluorescence detectors' },
    { id: 'cytpix_brv6x', label: 'Thermo Fisher Attune CytPix: BRV6X', description: '12 fluorescence detectors' },
    { id: 'cytpix_byrv6', label: 'Thermo Fisher Attune CytPix: BYRV6', description: '14 fluorescence detectors' },
    { id: 'cytpix_byrv4', label: 'Thermo Fisher Attune CytPix: BYRV4', description: '14 fluorescence detectors' },
  ],
  quanteon: [
    { id: 'quanteon_4025', label: 'Agilent NovoCyte Quanteon: 4025', description: '25 fluorescence detectors' },
  ],
  macsquant: [
    { id: 'macsquant_analyzer10', label: 'Miltenyi MACSQuant Analyzer 10', description: '8 fluorescence detectors' },
    { id: 'macsquant_analyzer16', label: 'Miltenyi MACSQuant Analyzer 16', description: '14 fluorescence detectors' },
    { id: 'macsquant_vyb', label: 'Miltenyi MACSQuant VYB', description: '8 fluorescence detectors' },
  ],
  facsverse: [
    { id: 'facsverse_1l_4', label: 'BD FACSVerse: 1-laser 4-color (4-0-0)', description: '4 fluorescence detectors' },
    { id: 'facsverse_2l_6', label: 'BD FACSVerse: 2-laser 6-color (4-2-0)', description: '6 fluorescence detectors' },
    { id: 'facsverse_3l_8', label: 'BD FACSVerse: 3-laser 8-color (4-2-2)', description: '8 fluorescence detectors' },
  ],
  lsrii: [
    { id: 'lsrii_6b_0v_0uv_3r', label: 'BD LSR II: 6B-0V-0UV-3R', description: '9 fluorescence detectors' },
    { id: 'lsrii_6b_2v_0uv_3r', label: 'BD LSR II: 6B-2V-0UV-3R', description: '11 fluorescence detectors' },
    { id: 'lsrii_6b_0v_2uv_3r', label: 'BD LSR II: 6B-0V-2UV-3R', description: '11 fluorescence detectors' },
    { id: 'lsrii_6b_2v_2uv_3r', label: 'BD LSR II: 6B-2V-2UV-3R', description: '13 fluorescence detectors' },
    { id: 'lsrii_6b_6v_0uv_3r', label: 'BD LSR II: 6B-6V-0UV-3R', description: '15 fluorescence detectors' },
    { id: 'lsrii_6b_6v_0uv_4r', label: 'BD LSR II: 6B-6V-0UV-4R', description: '16 fluorescence detectors' },
    { id: 'lsrii_6b_6v_2uv_3r', label: 'BD LSR II: 6B-6V-2UV-3R', description: '17 fluorescence detectors' },
    { id: 'lsrii_6b_6v_2uv_4r', label: 'BD LSR II: 6B-6V-2UV-4R', description: '18 fluorescence detectors' },
  ],
  cytoflex_lx: [
    { id: 'cytoflex_lx_u3_v5_b3_y5_r3_i0', label: 'Beckman Coulter CytoFLEX LX: UV3-V5-B3-Y5-R3-I0', description: '19 fluorescence detectors' },
  ],
  navios: [
    { id: 'navios_2l_8', label: 'Beckman Coulter Navios: 2-laser 8-color', description: '8 fluorescence detectors' },
  ],
  dxflex: [
    { id: 'dxflex_b5_r3_v5', label: 'Beckman Coulter DxFLEX: B5-R3-V5', description: '13 fluorescence detectors' },
  ],
  facsaria_fusion: [
    { id: 'facsaria_fusion_buv', label: 'BD FACSAria Fusion: BUV-optimized facility configuration', description: '18 fluorescence detectors' },
  ],
}

export function getSpectralPanelLibraries(): LibraryInfo[] {
  return LIBRARIES.map((library) => ({ ...library }))
}

export function getSpectralPanelConfigurations(cytometer: unknown = 'aurora'): ConfigurationInfo[] {
  return CONFIGURATIONS[resolveCytometer(cytometer)].map((configuration) => ({ ...configuration }))
}

const CONFIGURATION_ALIASES: Record<string, string> = {
  full: 'full',
  discovers8: 'discover_s8',
  facsdiscovers8: 'discover_s8',
  bdfacsdiscovers8: 'discover_s8',
  discovera8: 'discover_a8',
  facsdiscovera8: 'discover_a8',
  bdfacsdiscovera8: 'discover_a8',
  id7000: 'id7000_5l',
  id70005l: 'id7000_5l',
  id70005laser: 'id7000_5l',
  id70005lcompact: 'id7000_5l',
  id70004l: 'id7000_4l',
  id70004laser: 'id7000_4l',
  id70003l: 'id7000_3l',
  id70003laser: 'id7000_3l',
  symphonya5se: 'symphony_a5se',
  facsymphonya5se: 'symphony_a5se',
  facssymphonya5se: 'symphony_a5se',
  a5se: 'symphony_a5se',
  fortessa3l: 'fortessa_3l',
  lsrfortessa3l: 'fortessa_3l',
  bdlsrfortessa3l: 'fortessa_3l',
  fortessa4l: 'fortessa_4l',
  lsrfortessa4l: 'fortessa_4l',
  bdlsrfortessa4l: 'fortessa_4l',
  celestabv: 'celesta_bv',
  facscelestabv: 'celesta_bv',
  celestabvr: 'celesta_bvr',
  facscelestabvr: 'celesta_bvr',
  celestabvuv: 'celesta_bvuv',
  facscelestabvuv: 'celesta_bvuv',
  celestabvyg: 'celesta_bvyg',
  facscelestabvyg: 'celesta_bvyg',
  attunenxt4l: 'attune_nxt_4l',
  thermofisherattunenxt4l: 'attune_nxt_4l',
  attune4l: 'attune_nxt_4l',
  accuric6plusstandard: 'accuri_c6_plus_standard',
  accuric6plus: 'accuri_c6_plus_standard',
  standard3blue1red: 'accuri_c6_plus_standard',
  facscalibur2l4: 'facscalibur_2l_4',
  facscalibur4: 'facscalibur_2l_4',
  canto2l42: 'canto_2l_4_2',
  '2l42': 'canto_2l_4_2',
  bdfacscanto2l42: 'canto_2l_4_2',
  canto3l422: 'canto_3l_4_2_2',
  '3l422': 'canto_3l_4_2_2',
  bdfacscanto3l422: 'canto_3l_4_2_2',
  canto2l53: 'canto_2l_5_3',
  '2l53': 'canto_2l_5_3',
  bdfacscanto2l53: 'canto_2l_5_3',
  lyric2l4: 'lyric_2l_4',
  lyric2laser4: 'lyric_2l_4',
  '2l4': 'lyric_2l_4',
  lyric2l6: 'lyric_2l_6',
  lyric2laser6: 'lyric_2l_6',
  '2l6': 'lyric_2l_6',
  lyric3l8: 'lyric_3l_8',
  lyric3laser8: 'lyric_3l_8',
  '3l8': 'lyric_3l_8',
  lyric3l10: 'lyric_3l_10',
  lyric3laser10: 'lyric_3l_10',
  '3l10': 'lyric_3l_10',
  lyric3l12: 'lyric_3l_12',
  lyric3laser12: 'lyric_3l_12',
  '3l12': 'lyric_3l_12',
  ze53l17: 'ze5_3l_17',
  '3l17': 'ze5_3l_17',
  ze53l17option2: 'ze5_3l_17_option2',
  '3l17option2': 'ze5_3l_17_option2',
  ze53l20: 'ze5_3l_20',
  '3l20': 'ze5_3l_20',
  ze54l24: 'ze5_4l_24',
  '4l24': 'ze5_4l_24',
  ze55l27: 'ze5_5l_27',
  '5l27': 'ze5_5l_27',
  cytpixbyxx: 'cytpix_byxx',
  byxx: 'cytpix_byxx',
  cytpixbrxx: 'cytpix_brxx',
  brxx: 'cytpix_brxx',
  cytpixbv4xx: 'cytpix_bv4xx',
  bv4xx: 'cytpix_bv4xx',
  cytpixbv6xx: 'cytpix_bv6xx',
  bv6xx: 'cytpix_bv6xx',
  cytpixbyrx: 'cytpix_byrx',
  byrx: 'cytpix_byrx',
  cytpixbyv4x: 'cytpix_byv4x',
  byv4x: 'cytpix_byv4x',
  cytpixbrv6x: 'cytpix_brv6x',
  brv6x: 'cytpix_brv6x',
  cytpixbyrv6: 'cytpix_byrv6',
  byrv6: 'cytpix_byrv6',
  cytpixbyrv4: 'cytpix_byrv4',
  byrv4: 'cytpix_byrv4',
  quanteon4025: 'quanteon_4025',
  novocytequanteon4025: 'quanteon_4025',
  macsquantanalyzer10: 'macsquant_analyzer10',
  analyzer10: 'macsquant_analyzer10',
  macsquantanalyzer16: 'macsquant_analyzer16',
  analyzer16: 'macsquant_analyzer16',
  macsquantvyb: 'macsquant_vyb',
  vyb: 'macsquant_vyb',
  facsverse1l4: 'facsverse_1l_4',
  facsverse2l6: 'facsverse_2l_6',
  facsverse3l8: 'facsverse_3l_8',
  lsrii6b0v0uv3r: 'lsrii_6b_0v_0uv_3r',
  lsrii6b2v0uv3r: 'lsrii_6b_2v_0uv_3r',
  lsrii6b0v2uv3r: 'lsrii_6b_0v_2uv_3r',
  lsrii6b2v2uv3r: 'lsrii_6b_2v_2uv_3r',
  lsrii6b6v0uv3r: 'lsrii_6b_6v_0uv_3r',
  lsrii6b6v0uv4r: 'lsrii_6b_6v_0uv_4r',
  lsrii6b6v2uv3r: 'lsrii_6b_6v_2uv_3r',
  lsrii6b6v2uv4r: 'lsrii_6b_6v_2uv_4r',
  cytoflexl5l19: 'cytoflex_lx_u3_v5_b3_y5_r3_i0',
  cytoflexlx5l19: 'cytoflex_lx_u3_v5_b3_y5_r3_i0',
  u3v5b3y5r3i0: 'cytoflex_lx_u3_v5_b3_y5_r3_i0',
  navios2l8: 'navios_2l_8',
  navios8: 'navios_2l_8',
  dxflexb5r3v5: 'dxflex_b5_r3_v5',
  b5r3v5: 'dxflex_b5_r3_v5',
  dxflex13: 'dxflex_b5_r3_v5',
  facsariafusionbuv: 'facsaria_fusion_buv',
  buvoptimized: 'facsaria_fusion_buv',
  aurora5l: '5l_uv_v_b_yg_r',
  aurora5laser: '5l_uv_v_b_yg_r',
  '5l': '5l_uv_v_b_yg_r',
  '5laser': '5l_uv_v_b_yg_r',
  '5luvvbygr': '5l_uv_v_b_yg_r',
  aurora4luv: '4l_uv_v_b_r',
  aurora4luvvbr: '4l_uv_v_b_r',
  '4luv': '4l_uv_v_b_r',
  '4luvvbr': '4l_uv_v_b_r',
  aurora4lyg: '4l_v_b_yg_r',
  aurora4lvbygr: '4l_v_b_yg_r',
  '4lyg': '4l_v_b_yg_r',
  '4lvbygr': '4l_v_b_yg_r',
  aurora3l: '3l_v_b_r',
  aurora3laser: '3l_v_b_r',
  '3l': '3l_v_b_r',
  '3laser': '3l_v_b_r',
  '3lvbr': '3l_v_b_r',
}

const CONFIGURATION_LASERS: Record<string, string[] | undefined> = {
  '5l_uv_v_b_yg_r': ['UV', 'Violet', 'Blue', 'YellowGreen', 'Red'],
  '4l_uv_v_b_r': ['UV', 'Violet', 'Blue', 'Red'],
  '4l_v_b_yg_r': ['Violet', 'Blue', 'YellowGreen', 'Red'],
  '3l_v_b_r': ['Violet', 'Blue', 'Red'],
  discover_s8: ['UV', 'Violet', 'Blue', 'YellowGreen', 'Red'],
  discover_a8: ['UV', 'Violet', 'Blue', 'YellowGreen', 'Red'],
  id7000_5l: ['UV', 'Violet', 'Blue', 'YellowGreen', 'Red'],
  id7000_4l: ['Violet', 'Blue', 'YellowGreen', 'Red'],
  id7000_3l: ['Violet', 'Blue', 'Red'],
  symphony_a5se: ['UV', 'Violet', 'Blue', 'YellowGreen', 'Red'],
  fortessa_3l: ['Violet', 'Blue', 'Red'],
  fortessa_4l: ['Violet', 'Blue', 'YellowGreen', 'Red'],
  celesta_bv: ['Violet', 'Blue'],
  celesta_bvr: ['Violet', 'Blue', 'Red'],
  celesta_bvuv: ['UV', 'Violet', 'Blue'],
  celesta_bvyg: ['Violet', 'Blue', 'YellowGreen'],
  attune_nxt_4l: ['Blue', 'Red', 'Violet', 'YellowGreen'],
  accuri_c6_plus_standard: ['Blue', 'Red'],
  facscalibur_2l_4: ['Blue', 'Red'],
  canto_2l_4_2: ['Blue', 'Red'],
  canto_3l_4_2_2: ['Violet', 'Blue', 'Red'],
  canto_2l_5_3: ['Blue', 'Red'],
  lyric_2l_4: ['Blue', 'Red'],
  lyric_2l_6: ['Blue', 'Red'],
  lyric_3l_8: ['Violet', 'Blue', 'Red'],
  lyric_3l_10: ['Violet', 'Blue', 'Red'],
  lyric_3l_12: ['Violet', 'Blue', 'Red'],
  ze5_3l_17: ['Violet', 'Blue', 'Red'],
  ze5_3l_17_option2: ['Blue', 'YellowGreen', 'Red'],
  ze5_3l_20: ['Violet', 'Blue', 'YellowGreen'],
  ze5_4l_24: ['Violet', 'Blue', 'YellowGreen', 'Red'],
  ze5_5l_27: ['UV', 'Violet', 'Blue', 'YellowGreen', 'Red'],
  cytpix_byxx: ['Blue', 'YellowGreen'],
  cytpix_brxx: ['Blue', 'Red'],
  cytpix_bv4xx: ['Blue', 'Violet'],
  cytpix_bv6xx: ['Blue', 'Violet'],
  cytpix_byrx: ['Blue', 'YellowGreen', 'Red'],
  cytpix_byv4x: ['Blue', 'YellowGreen', 'Violet'],
  cytpix_brv6x: ['Blue', 'Red', 'Violet'],
  cytpix_byrv6: ['Blue', 'YellowGreen', 'Red', 'Violet'],
  cytpix_byrv4: ['Blue', 'YellowGreen', 'Red', 'Violet'],
  quanteon_4025: ['Violet', 'Blue', 'YellowGreen', 'Red'],
  macsquant_analyzer10: ['Violet', 'Blue', 'Red'],
  macsquant_analyzer16: ['Violet', 'Blue', 'Red'],
  macsquant_vyb: ['Violet', 'Blue', 'YellowGreen'],
  facsverse_1l_4: ['Blue'],
  facsverse_2l_6: ['Blue', 'Red'],
  facsverse_3l_8: ['Blue', 'Red', 'Violet'],
  lsrii_6b_0v_0uv_3r: ['Blue', 'Red'],
  lsrii_6b_2v_0uv_3r: ['Blue', 'Violet', 'Red'],
  lsrii_6b_0v_2uv_3r: ['Blue', 'UV', 'Red'],
  lsrii_6b_2v_2uv_3r: ['Blue', 'Violet', 'UV', 'Red'],
  lsrii_6b_6v_0uv_3r: ['Blue', 'Violet', 'Red'],
  lsrii_6b_6v_0uv_4r: ['Blue', 'Violet', 'Red'],
  lsrii_6b_6v_2uv_3r: ['Blue', 'Violet', 'UV', 'Red'],
  lsrii_6b_6v_2uv_4r: ['Blue', 'Violet', 'UV', 'Red'],
  cytoflex_lx_u3_v5_b3_y5_r3_i0: ['UV', 'Violet', 'Blue', 'YellowGreen', 'Red'],
  navios_2l_8: ['Blue', 'Red'],
  dxflex_b5_r3_v5: ['Violet', 'Blue', 'Red'],
  facsaria_fusion_buv: ['UV', 'Violet', 'Blue', 'YellowGreen', 'Red'],
}

const CONFIGURATION_DETECTORS: Record<string, string[] | undefined> = {
  fortessa_3l: [
    '450/50-V-A', '525/50-V-A', '610/20-V-A', '670/30-V-A', '710/50-V-A', '780/60-V-A',
    '525/50-B-A', '575/26-B-A', '610/20-B-A', '695/40-B-A', '780/60-B-A',
    '670/30-R-A', '730/45-R-A', '780/60-R-A',
  ],
  fortessa_4l: [
    '450/50-V-A', '525/50-V-A', '610/20-V-A', '670/30-V-A', '710/50-V-A', '780/60-V-A',
    '529/24-B-A', '695/40-B-A',
    '582/15-YG-A', '610/20-YG-A', '670/14-YG-A', '710/50-YG-A', '780/60-YG-A',
    '670/30-R-A', '730/45-R-A', '780/60-R-A',
  ],
  celesta_bv: [
    '530/30-B-A', '575/25-B-A', '610/20-B-A', '695/40-B-A',
    '450/40-V-A', '525/50-V-A', '610/20-V-A', '670/30-V-A', '710/50-V-A', '780/60-V-A',
  ],
  celesta_bvr: [
    '530/30-B-A', '575/26-B-A', '610/20-B-A', '695/40-B-A',
    '450/40-V-A', '525/50-V-A', '610/20-V-A', '660/20-V-A', '780/60-V-A',
    '670/30-R-A', '730/45-R-A', '780/60-R-A',
  ],
  celesta_bvuv: [
    '530/30-B-A', '575/25-B-A', '610/20-B-A', '695/40-B-A',
    '450/40-V-A', '525/50-V-A', '610/20-V-A', '670/30-V-A', '710/50-V-A', '780/60-V-A',
    '379/28-UV-A', '740/35-UV-A',
  ],
  celesta_bvyg: [
    '530/30-B-A', '695/40-B-A',
    '450/40-V-A', '525/50-V-A', '610/20-V-A', '670/30-V-A', '710/50-V-A', '780/60-V-A',
    '586/15-YG-A', '610/20-YG-A', '670/30-YG-A', '780/60-YG-A',
  ],
  attune_nxt_4l: [
    '440/50-V-A', '512/25-V-A', '603/48-V-A', '710/50-V-A',
    '530/30-B-A', '590/40-B-A', '695/40-B-A',
    '585/16-Y-A', '620/15-Y-A', '695/40-Y-A', '780/60-Y-A',
    '670/14-R-A', '720/30-R-A', '780/60-R-A',
  ],
  accuri_c6_plus_standard: ['accuri_FL1', 'accuri_FL2', 'accuri_FL3', 'accuri_FL4'],
  facscalibur_2l_4: ['facscalibur_FL1', 'facscalibur_FL2', 'facscalibur_FL3', 'facscalibur_FL4'],
  canto_2l_4_2: [
    'canto_2l_4_2_530/30-B-A', 'canto_2l_4_2_585/42-B-A', 'canto_2l_4_2_670LP-B-A', 'canto_2l_4_2_780/60-B-A',
    'canto_2l_4_2_660/20-R-A', 'canto_2l_4_2_780/60-R-A',
  ],
  canto_3l_4_2_2: [
    'canto_3l_4_2_2_450/50-V-A', 'canto_3l_4_2_2_510/50-V-A',
    'canto_3l_4_2_2_530/30-B-A', 'canto_3l_4_2_2_585/42-B-A', 'canto_3l_4_2_2_670LP-B-A', 'canto_3l_4_2_2_780/60-B-A',
    'canto_3l_4_2_2_660/20-R-A', 'canto_3l_4_2_2_780/60-R-A',
  ],
  canto_2l_5_3: [
    'canto_2l_5_3_530/30-B-A', 'canto_2l_5_3_585/42-B-A', 'canto_2l_5_3_616/23-B-A', 'canto_2l_5_3_670LP-B-A', 'canto_2l_5_3_780/60-B-A',
    'canto_2l_5_3_660/20-R-A', 'canto_2l_5_3_712/21-R-A', 'canto_2l_5_3_780/60-R-A',
  ],
  lyric_2l_4: [
    'lyric_2l_4_527/32-B-A', 'lyric_2l_4_586/42-B-A', 'lyric_2l_4_700/54-B-A', 'lyric_2l_4_660/10-R-A',
  ],
  lyric_2l_6: [
    'lyric_2l_6_527/32-B-A', 'lyric_2l_6_586/42-B-A', 'lyric_2l_6_700/54-B-A', 'lyric_2l_6_783/56-B-A',
    'lyric_2l_6_660/10-R-A', 'lyric_2l_6_783/56-R-A',
  ],
  lyric_3l_8: [
    'lyric_3l_8_448/45-V-A', 'lyric_3l_8_528/45-V-A',
    'lyric_3l_8_527/32-B-A', 'lyric_3l_8_586/42-B-A', 'lyric_3l_8_700/54-B-A', 'lyric_3l_8_783/56-B-A',
    'lyric_3l_8_660/10-R-A', 'lyric_3l_8_783/56-R-A',
  ],
  lyric_3l_10: [
    'lyric_3l_10_448/45-V-A', 'lyric_3l_10_528/45-V-A', 'lyric_3l_10_606/36-V-A',
    'lyric_3l_10_527/32-B-A', 'lyric_3l_10_586/42-B-A', 'lyric_3l_10_700/54-B-A', 'lyric_3l_10_783/56-B-A',
    'lyric_3l_10_660/10-R-A', 'lyric_3l_10_720/30-R-A', 'lyric_3l_10_783/56-R-A',
  ],
  lyric_3l_12: [
    'lyric_3l_12_448/45-V-A', 'lyric_3l_12_528/45-V-A', 'lyric_3l_12_606/36-V-A', 'lyric_3l_12_715/50-V-A', 'lyric_3l_12_755LP-V-A',
    'lyric_3l_12_527/32-B-A', 'lyric_3l_12_586/42-B-A', 'lyric_3l_12_700/54-B-A', 'lyric_3l_12_783/56-B-A',
    'lyric_3l_12_660/10-R-A', 'lyric_3l_12_720/30-R-A', 'lyric_3l_12_783/56-R-A',
  ],
  ze5_3l_17: [
    'ze5_3l_17_420/10-V-A', 'ze5_3l_17_460/22-V-A', 'ze5_3l_17_525/50-V-A', 'ze5_3l_17_615/24-V-A', 'ze5_3l_17_670/30-V-A', 'ze5_3l_17_720/60-V-A', 'ze5_3l_17_750LP-V-A',
    'ze5_3l_17_509/24-B-A', 'ze5_3l_17_549/15-B-A', 'ze5_3l_17_583/30-B-A', 'ze5_3l_17_615/24-B-A', 'ze5_3l_17_692/80-B-A', 'ze5_3l_17_750LP-B-A',
    'ze5_3l_17_670/30-R-A', 'ze5_3l_17_720/60-R-A', 'ze5_3l_17_775/50-R-A', 'ze5_3l_17_800LP-R-A',
  ],
  ze5_3l_17_option2: [
    'ze5_3l_17_option2_509/24-B-A', 'ze5_3l_17_option2_549/15-B-A', 'ze5_3l_17_option2_583/30-B-A', 'ze5_3l_17_option2_615/24-B-A', 'ze5_3l_17_option2_692/80-B-A', 'ze5_3l_17_option2_750LP-B-A',
    'ze5_3l_17_option2_577/15-YG-A', 'ze5_3l_17_option2_589/15-YG-A', 'ze5_3l_17_option2_615/24-YG-A', 'ze5_3l_17_option2_640/20-YG-A', 'ze5_3l_17_option2_670/30-YG-A', 'ze5_3l_17_option2_720/60-YG-A', 'ze5_3l_17_option2_750LP-YG-A',
    'ze5_3l_17_option2_670/30-R-A', 'ze5_3l_17_option2_720/60-R-A', 'ze5_3l_17_option2_775/50-R-A', 'ze5_3l_17_option2_800LP-R-A',
  ],
  ze5_3l_20: [
    'ze5_3l_20_420/10-V-A', 'ze5_3l_20_460/22-V-A', 'ze5_3l_20_525/50-V-A', 'ze5_3l_20_615/24-V-A', 'ze5_3l_20_670/30-V-A', 'ze5_3l_20_720/60-V-A', 'ze5_3l_20_750LP-V-A',
    'ze5_3l_20_509/24-B-A', 'ze5_3l_20_549/15-B-A', 'ze5_3l_20_583/30-B-A', 'ze5_3l_20_615/24-B-A', 'ze5_3l_20_692/80-B-A', 'ze5_3l_20_750LP-B-A',
    'ze5_3l_20_577/15-YG-A', 'ze5_3l_20_589/15-YG-A', 'ze5_3l_20_615/24-YG-A', 'ze5_3l_20_640/20-YG-A', 'ze5_3l_20_670/30-YG-A', 'ze5_3l_20_720/60-YG-A', 'ze5_3l_20_750LP-YG-A',
  ],
  ze5_4l_24: [
    'ze5_4l_24_420/10-V-A', 'ze5_4l_24_460/22-V-A', 'ze5_4l_24_525/50-V-A', 'ze5_4l_24_615/24-V-A', 'ze5_4l_24_670/30-V-A', 'ze5_4l_24_720/60-V-A', 'ze5_4l_24_750LP-V-A',
    'ze5_4l_24_509/24-B-A', 'ze5_4l_24_549/15-B-A', 'ze5_4l_24_583/30-B-A', 'ze5_4l_24_615/24-B-A', 'ze5_4l_24_692/80-B-A', 'ze5_4l_24_750LP-B-A',
    'ze5_4l_24_577/15-YG-A', 'ze5_4l_24_589/15-YG-A', 'ze5_4l_24_615/24-YG-A', 'ze5_4l_24_640/20-YG-A', 'ze5_4l_24_670/30-YG-A', 'ze5_4l_24_720/60-YG-A', 'ze5_4l_24_750LP-YG-A',
    'ze5_4l_24_670/30-R-A', 'ze5_4l_24_720/60-R-A', 'ze5_4l_24_775/50-R-A', 'ze5_4l_24_800LP-R-A',
  ],
  ze5_5l_27: [
    'ze5_5l_27_387/11-UV-A', 'ze5_5l_27_447/60-UV-A', 'ze5_5l_27_525/50-UV-A', 'ze5_5l_27_670/30-UV-A', 'ze5_5l_27_700LP-UV-A',
    'ze5_5l_27_420/10-V-A', 'ze5_5l_27_460/22-V-A', 'ze5_5l_27_525/50-V-A', 'ze5_5l_27_615/24-V-A', 'ze5_5l_27_670/30-V-A', 'ze5_5l_27_720/60-V-A', 'ze5_5l_27_750LP-V-A',
    'ze5_5l_27_525/25-B-A', 'ze5_5l_27_593/52-B-A', 'ze5_5l_27_692/80-B-A', 'ze5_5l_27_750LP-B-A',
    'ze5_5l_27_577/15-YG-A', 'ze5_5l_27_589/15-YG-A', 'ze5_5l_27_615/24-YG-A', 'ze5_5l_27_640/20-YG-A', 'ze5_5l_27_670/30-YG-A', 'ze5_5l_27_720/60-YG-A', 'ze5_5l_27_750LP-YG-A',
    'ze5_5l_27_670/30-R-A', 'ze5_5l_27_720/60-R-A', 'ze5_5l_27_775/50-R-A', 'ze5_5l_27_800LP-R-A',
  ],
  cytpix_byxx: ['cytpix_byxx_BL1', 'cytpix_byxx_BL2', 'cytpix_byxx_BL3', 'cytpix_byxx_YL1', 'cytpix_byxx_YL2', 'cytpix_byxx_YL3', 'cytpix_byxx_YL4'],
  cytpix_brxx: ['cytpix_brxx_BL1', 'cytpix_brxx_BL2', 'cytpix_brxx_BL3', 'cytpix_brxx_BL4', 'cytpix_brxx_RL1', 'cytpix_brxx_RL2', 'cytpix_brxx_RL3'],
  cytpix_bv4xx: ['cytpix_bv4xx_BL1', 'cytpix_bv4xx_BL2', 'cytpix_bv4xx_BL3', 'cytpix_bv4xx_VL1', 'cytpix_bv4xx_VL2', 'cytpix_bv4xx_VL3', 'cytpix_bv4xx_VL4'],
  cytpix_bv6xx: ['cytpix_bv6xx_BL1', 'cytpix_bv6xx_BL2', 'cytpix_bv6xx_BL3', 'cytpix_bv6xx_VL1', 'cytpix_bv6xx_VL2', 'cytpix_bv6xx_VL3', 'cytpix_bv6xx_VL4', 'cytpix_bv6xx_VL5', 'cytpix_bv6xx_VL6'],
  cytpix_byrx: ['cytpix_byrx_BL1', 'cytpix_byrx_BL2', 'cytpix_byrx_BL3', 'cytpix_byrx_BL4', 'cytpix_byrx_YL1', 'cytpix_byrx_YL2', 'cytpix_byrx_YL3', 'cytpix_byrx_YL4', 'cytpix_byrx_RL1', 'cytpix_byrx_RL2', 'cytpix_byrx_RL3'],
  cytpix_byv4x: ['cytpix_byv4x_BL1', 'cytpix_byv4x_BL2', 'cytpix_byv4x_BL3', 'cytpix_byv4x_YL1', 'cytpix_byv4x_YL2', 'cytpix_byv4x_YL3', 'cytpix_byv4x_YL4', 'cytpix_byv4x_VL1', 'cytpix_byv4x_VL2', 'cytpix_byv4x_VL3', 'cytpix_byv4x_VL4'],
  cytpix_brv6x: ['cytpix_brv6x_BL1', 'cytpix_brv6x_BL2', 'cytpix_brv6x_BL3', 'cytpix_brv6x_RL1', 'cytpix_brv6x_RL2', 'cytpix_brv6x_RL3', 'cytpix_brv6x_VL1', 'cytpix_brv6x_VL2', 'cytpix_brv6x_VL3', 'cytpix_brv6x_VL4', 'cytpix_brv6x_VL5', 'cytpix_brv6x_VL6'],
  cytpix_byrv6: ['cytpix_byrv6_BL1', 'cytpix_byrv6_BL2', 'cytpix_byrv6_YL1', 'cytpix_byrv6_YL2', 'cytpix_byrv6_YL3', 'cytpix_byrv6_RL1', 'cytpix_byrv6_RL2', 'cytpix_byrv6_RL3', 'cytpix_byrv6_VL1', 'cytpix_byrv6_VL2', 'cytpix_byrv6_VL3', 'cytpix_byrv6_VL4', 'cytpix_byrv6_VL5', 'cytpix_byrv6_VL6'],
  cytpix_byrv4: ['cytpix_byrv4_BL1', 'cytpix_byrv4_BL2', 'cytpix_byrv4_BL3', 'cytpix_byrv4_YL1', 'cytpix_byrv4_YL2', 'cytpix_byrv4_YL3', 'cytpix_byrv4_YL4', 'cytpix_byrv4_RL1', 'cytpix_byrv4_RL2', 'cytpix_byrv4_RL3', 'cytpix_byrv4_VL1', 'cytpix_byrv4_VL2', 'cytpix_byrv4_VL3', 'cytpix_byrv4_VL4'],
  quanteon_4025: [
    'quanteon_4025_V445', 'quanteon_4025_V525', 'quanteon_4025_V586', 'quanteon_4025_V615', 'quanteon_4025_V667', 'quanteon_4025_V695', 'quanteon_4025_V725', 'quanteon_4025_V780',
    'quanteon_4025_B525', 'quanteon_4025_B586', 'quanteon_4025_B615', 'quanteon_4025_B667', 'quanteon_4025_B695', 'quanteon_4025_B725', 'quanteon_4025_B780',
    'quanteon_4025_Y586', 'quanteon_4025_Y615', 'quanteon_4025_Y667', 'quanteon_4025_Y695', 'quanteon_4025_Y725', 'quanteon_4025_Y780',
    'quanteon_4025_R667', 'quanteon_4025_R695', 'quanteon_4025_R725', 'quanteon_4025_R780',
  ],
  macsquant_analyzer10: [
    'macsquant_analyzer10_V1', 'macsquant_analyzer10_V2',
    'macsquant_analyzer10_B1', 'macsquant_analyzer10_B2', 'macsquant_analyzer10_B3', 'macsquant_analyzer10_B4',
    'macsquant_analyzer10_R1', 'macsquant_analyzer10_R2',
  ],
  macsquant_analyzer16: [
    'macsquant_analyzer16_V1', 'macsquant_analyzer16_V2', 'macsquant_analyzer16_V3', 'macsquant_analyzer16_V4', 'macsquant_analyzer16_V5',
    'macsquant_analyzer16_B1', 'macsquant_analyzer16_B2', 'macsquant_analyzer16_B3', 'macsquant_analyzer16_B4', 'macsquant_analyzer16_B5', 'macsquant_analyzer16_B6',
    'macsquant_analyzer16_R1', 'macsquant_analyzer16_R2', 'macsquant_analyzer16_R3',
  ],
  macsquant_vyb: [
    'macsquant_vyb_V1', 'macsquant_vyb_V2', 'macsquant_vyb_B1', 'macsquant_vyb_B2',
    'macsquant_vyb_Y1', 'macsquant_vyb_Y2', 'macsquant_vyb_Y3', 'macsquant_vyb_Y4',
  ],
  facsverse_1l_4: [
    'facsverse_BA', 'facsverse_BB', 'facsverse_BD', 'facsverse_BE',
  ],
  facsverse_2l_6: [
    'facsverse_BA', 'facsverse_BB', 'facsverse_BD', 'facsverse_BE',
    'facsverse_RA', 'facsverse_RB',
  ],
  facsverse_3l_8: [
    'facsverse_BA', 'facsverse_BB', 'facsverse_BD', 'facsverse_BE',
    'facsverse_RA', 'facsverse_RB', 'facsverse_VA', 'facsverse_VB',
  ],
  lsrii_6b_0v_0uv_3r: [
    'lsrii_B1', 'lsrii_B2', 'lsrii_B3', 'lsrii_B4', 'lsrii_B5', 'lsrii_B6',
    'lsrii_Rt1', 'lsrii_Rt2', 'lsrii_Rt3',
  ],
  lsrii_6b_2v_0uv_3r: [
    'lsrii_B1', 'lsrii_B2', 'lsrii_B3', 'lsrii_B4', 'lsrii_B5', 'lsrii_B6',
    'lsrii_Vt1', 'lsrii_Vt2', 'lsrii_Rt1', 'lsrii_Rt2', 'lsrii_Rt3',
  ],
  lsrii_6b_0v_2uv_3r: [
    'lsrii_B1', 'lsrii_B2', 'lsrii_B3', 'lsrii_B4', 'lsrii_B5', 'lsrii_B6',
    'lsrii_UV1', 'lsrii_UV2', 'lsrii_Rt1', 'lsrii_Rt2', 'lsrii_Rt3',
  ],
  lsrii_6b_2v_2uv_3r: [
    'lsrii_B1', 'lsrii_B2', 'lsrii_B3', 'lsrii_B4', 'lsrii_B5', 'lsrii_B6',
    'lsrii_Vt1', 'lsrii_Vt2', 'lsrii_UV1', 'lsrii_UV2', 'lsrii_Rt1', 'lsrii_Rt2', 'lsrii_Rt3',
  ],
  lsrii_6b_6v_0uv_3r: [
    'lsrii_B1', 'lsrii_B2', 'lsrii_B3', 'lsrii_B4', 'lsrii_B5', 'lsrii_B6',
    'lsrii_Vo1', 'lsrii_Vo2', 'lsrii_Vo3', 'lsrii_Vo4', 'lsrii_Vo5', 'lsrii_Vo6',
    'lsrii_Rt1', 'lsrii_Rt2', 'lsrii_Rt3',
  ],
  lsrii_6b_6v_0uv_4r: [
    'lsrii_B1', 'lsrii_B2', 'lsrii_B3', 'lsrii_B4', 'lsrii_B5', 'lsrii_B6',
    'lsrii_Vo1', 'lsrii_Vo2', 'lsrii_Vo3', 'lsrii_Vo4', 'lsrii_Vo5', 'lsrii_Vo6',
    'lsrii_Ro1', 'lsrii_Ro2', 'lsrii_Ro3', 'lsrii_Ro4',
  ],
  lsrii_6b_6v_2uv_3r: [
    'lsrii_B1', 'lsrii_B2', 'lsrii_B3', 'lsrii_B4', 'lsrii_B5', 'lsrii_B6',
    'lsrii_Vo1', 'lsrii_Vo2', 'lsrii_Vo3', 'lsrii_Vo4', 'lsrii_Vo5', 'lsrii_Vo6',
    'lsrii_UV1', 'lsrii_UV2', 'lsrii_Rt1', 'lsrii_Rt2', 'lsrii_Rt3',
  ],
  lsrii_6b_6v_2uv_4r: [
    'lsrii_B1', 'lsrii_B2', 'lsrii_B3', 'lsrii_B4', 'lsrii_B5', 'lsrii_B6',
    'lsrii_Vo1', 'lsrii_Vo2', 'lsrii_Vo3', 'lsrii_Vo4', 'lsrii_Vo5', 'lsrii_Vo6',
    'lsrii_UV1', 'lsrii_UV2', 'lsrii_Ro1', 'lsrii_Ro2', 'lsrii_Ro3', 'lsrii_Ro4',
  ],
  cytoflex_lx_u3_v5_b3_y5_r3_i0: [
    'cytoflex_U405', 'cytoflex_U525', 'cytoflex_U675',
    'cytoflex_V450', 'cytoflex_V525', 'cytoflex_V610', 'cytoflex_V660', 'cytoflex_V763',
    'cytoflex_B525', 'cytoflex_B610', 'cytoflex_B690',
    'cytoflex_Y585', 'cytoflex_Y610', 'cytoflex_Y675', 'cytoflex_Y710', 'cytoflex_Y763',
    'cytoflex_R660', 'cytoflex_R712', 'cytoflex_R763',
  ],
  navios_2l_8: [
    'navios_B1', 'navios_B2', 'navios_B3', 'navios_B4', 'navios_B5',
    'navios_R1', 'navios_R2', 'navios_R3',
  ],
  dxflex_b5_r3_v5: [
    'dxflex_V450', 'dxflex_V525', 'dxflex_V610', 'dxflex_V660', 'dxflex_V780',
    'dxflex_B525', 'dxflex_B585', 'dxflex_B610', 'dxflex_B690', 'dxflex_B780',
    'dxflex_R660', 'dxflex_R712', 'dxflex_R780',
  ],
  facsaria_fusion_buv: [
    'facsaria_B530', 'facsaria_B710',
    'facsaria_R670', 'facsaria_R712', 'facsaria_R780',
    'facsaria_V450', 'facsaria_V525', 'facsaria_V610', 'facsaria_V660', 'facsaria_V710', 'facsaria_V780',
    'facsaria_Y586', 'facsaria_Y610', 'facsaria_Y780',
    'facsaria_U379', 'facsaria_U515', 'facsaria_U740', 'facsaria_U800',
  ],
}

const LASER_PALETTE: Record<string, string> = {
  DeepUV: '#4c1d95',
  UV: '#6f006f',
  Violet: '#9d00d8',
  Blue: '#0757f2',
  YellowGreen: '#9acd2f',
  Red: '#ff140f',
  IR: '#7f1d1d',
  Other: '#64748b',
}

const LASER_ORDER = ['DeepUV', 'UV', 'Violet', 'Blue', 'YellowGreen', 'Red', 'IR', 'Other']
const CONVENTIONAL_CYTOMETERS = new Set<CytometerId>([
  'fortessa', 'celesta', 'attune_nxt', 'accuri_c6_plus', 'facscalibur', 'canto', 'lyric', 'ze5', 'cytpix', 'quanteon', 'macsquant',
  'facsverse', 'lsrii', 'cytoflex_lx',
  'navios', 'dxflex', 'facsaria_fusion',
])

let dictionaryInitialization: Promise<void> | null = null
const libraries = new Map<CytometerId, SpectralLibrary>()
const libraryInitializations = new Map<CytometerId, Promise<void>>()
let cytometerDictionary: CsvRow[] = []
let fluorophoreDictionary: CsvRow[] = []
let conventionalDetectorDictionary: CsvRow[] = []
let conventionalFluorophoreEstimateDictionary: CsvRow[] = []
const configurationBases = new Map<string, PanelConfigurationBase>()
const panelPayloadCache = new Map<string, PanelPayload>()
const MAX_PANEL_PAYLOAD_CACHE = 32

type PanelConfigurationBase = {
  detectorInfo: DetectorInfo[]
  fluorophores: FluorInfo[]
  retainedSignal: number[]
  normalizedRowsByLibraryIndex: Map<number, number[]>
  lookup: Map<string, number>
}

export type RequestedFluorophoreDiagnostic = {
  requested: string
  canonicalFluorophore: string | null
  status: 'unrecognized' | 'unavailable' | 'duplicate'
  reason: string
}

export type RequestedFluorophoreValidation = {
  accepted: string[]
  diagnostics: RequestedFluorophoreDiagnostic[]
}

export class PanelSelectionValidationError extends Error {
  diagnostics: RequestedFluorophoreDiagnostic[]

  constructor(diagnostics: RequestedFluorophoreDiagnostic[]) {
    const details = diagnostics.map((diagnostic) => (
      `${JSON.stringify(diagnostic.requested)}: ${diagnostic.reason}`
    )).join('; ')
    super(`Panel selection rejected ${diagnostics.length} fluorophore(s): ${details}`)
    this.name = 'PanelSelectionValidationError'
    this.diagnostics = diagnostics
  }
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  let quoteClosed = false

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    const next = text[index + 1]
    if (quoted) {
      if (character === '"') {
        if (next === '"') {
          cell += '"'
          index += 1
        } else {
          quoted = false
          quoteClosed = true
        }
      } else {
        cell += character
      }
    } else if (quoteClosed) {
      if (character === ',') {
        row.push(cell)
        cell = ''
        quoteClosed = false
      } else if (character === '\n' || character === '\r') {
        row.push(cell)
        cell = ''
        quoteClosed = false
        if (row.length > 1 || row.some((value) => value.length > 0)) rows.push(row)
        row = []
        if (character === '\r' && next === '\n') index += 1
      } else {
        throw new Error(`Malformed CSV: unexpected '${character}' after a closing quote at character ${index + 1}.`)
      }
    } else if (character === '"') {
      if (cell.length > 0) {
        throw new Error(`Malformed CSV: misplaced quote at character ${index + 1}.`)
      }
      quoted = true
    } else if (character === ',') {
      row.push(cell)
      cell = ''
    } else if (character === '\n' || character === '\r') {
      row.push(cell)
      cell = ''
      if (row.length > 1 || row.some((value) => value.length > 0)) rows.push(row)
      row = []
      if (character === '\r' && next === '\n') index += 1
    } else {
      cell += character
    }
  }
  if (quoted) throw new Error('Malformed CSV: unterminated quoted field.')
  row.push(cell)
  if (row.length > 1 || row.some((value) => value.length > 0)) rows.push(row)
  if (rows[0]?.[0]) rows[0][0] = rows[0][0].replace(/^\uFEFF/, '')
  return rows
}

export function rowsToObjects(rows: string[][]): CsvRow[] {
  const headers = rows[0] ?? []
  return rows.slice(1).map((values) => Object.fromEntries(
    headers.map((header, index) => [header, (values[index] ?? '').trim()]),
  ))
}

function sha256(value: string): string {
  const bytes = new TextEncoder().encode(value)
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64
  const padded = new Uint8Array(paddedLength)
  padded.set(bytes)
  padded[bytes.length] = 0x80
  const view = new DataView(padded.buffer)
  const bitLength = bytes.length * 8
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000) >>> 0)
  view.setUint32(paddedLength - 4, bitLength >>> 0)

  const rotateRight = (word: number, bits: number): number => (word >>> bits) | (word << (32 - bits))
  const roundConstants = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]
  let hash = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]

  for (let offset = 0; offset < padded.length; offset += 64) {
    const words = new Uint32Array(64)
    for (let index = 0; index < 16; index += 1) words[index] = view.getUint32(offset + index * 4)
    for (let index = 16; index < 64; index += 1) {
      const first = rotateRight(words[index - 15]!, 7) ^ rotateRight(words[index - 15]!, 18) ^ (words[index - 15]! >>> 3)
      const second = rotateRight(words[index - 2]!, 17) ^ rotateRight(words[index - 2]!, 19) ^ (words[index - 2]! >>> 10)
      words[index] = (words[index - 16]! + first + words[index - 7]! + second) >>> 0
    }
    let [a, b, c, d, e, f, g, h] = hash
    for (let index = 0; index < 64; index += 1) {
      const sigma1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25)
      const choice = (e & f) ^ (~e & g)
      const temp1 = (h + sigma1 + choice + roundConstants[index]! + words[index]!) >>> 0
      const sigma0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22)
      const majority = (a & b) ^ (a & c) ^ (b & c)
      const temp2 = (sigma0 + majority) >>> 0
      h = g
      g = f
      f = e
      e = (d + temp1) >>> 0
      d = c
      c = b
      b = a
      a = (temp1 + temp2) >>> 0
    }
    const workingHash = [a, b, c, d, e, f, g, h]
    hash = hash.map((value, index) => (value + workingHash[index]!) >>> 0)
  }
  return hash.map((word) => word.toString(16).padStart(8, '0')).join('')
}

function validatePinnedSnapshot(
  filename: string,
  rows: string[][],
  options: BundledDataValidationOptions,
  description: string,
): void {
  if (!options.requireComplete) return
  const expected = PINNED_BUNDLED_DATA_SHA256[filename]
  if (!expected) return
  const actual = sha256(JSON.stringify(rows))
  if (actual !== expected) {
    validationError(filename, `${description} do not match the pinned SHA-256 snapshot.`)
  }
}

export function dictionaryText(value: unknown): string {
  return value == null ? '' : String(value)
}

export function dataUrl(filename: string): string {
  const origin = typeof window === 'undefined' ? 'http://localhost' : window.location.origin
  return new URL(`data/${filename}`, new URL(import.meta.env.BASE_URL, origin)).toString()
}

async function loadCsv(filename: string): Promise<string[][]> {
  let response: Response
  try {
    response = await fetch(dataUrl(filename))
  } catch (error) {
    validationError(filename, `could not load bundled data file: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (!response.ok) validationError(filename, `could not load bundled data file (${response.status}).`)
  let rows: string[][]
  try {
    rows = parseCsv(await response.text())
  } catch (error) {
    if (error instanceof BundledDataValidationError) throw error
    validationError(filename, error instanceof Error ? error.message : String(error))
  }
  validateBundledDataRows(filename, rows, { requireComplete: import.meta.env.MODE !== 'test' })
  return rows
}

function validationError(filename: string, message: string): never {
  throw new BundledDataValidationError(`${filename}: ${message}`)
}

function rowNumber(rowIndex: number): number {
  return rowIndex + 2
}

function rowValue(row: CsvRow, field: string): string {
  return dictionaryText(row[field]).trim()
}

function validateHeaders(filename: string, headers: string[], expected: string[]): void {
  if (headers.length !== expected.length) {
    validationError(filename, `expected columns [${expected.join(', ')}], received ${headers.length}.`)
  }
  if (headers.some((header) => header !== header.trim())) {
    validationError(filename, 'header contains surrounding whitespace.')
  }
  const normalizedHeaders = headers.map((header) => normalizeToken(header))
  if (normalizedHeaders.some((header) => !header)) {
    validationError(filename, 'header contains a blank column name.')
  }
  if (new Set(normalizedHeaders).size !== normalizedHeaders.length) {
    validationError(filename, 'header contains duplicate column names.')
  }
  expected.forEach((header, index) => {
    if (headers[index]?.trim() !== header) {
      validationError(filename, `expected column ${index + 1} to be '${header}', received '${headers[index] ?? ''}'.`)
    }
  })
}

function recordsForTable(
  filename: string,
  rows: string[][],
  expectedHeaders: string[],
  requiredFields: string[],
  options: { requireRows?: boolean } = {},
): CsvRow[] {
  const headers = rows[0] ?? []
  validateHeaders(filename, headers, expectedHeaders)
  if (options.requireRows !== false && rows.length < 2) {
    validationError(filename, 'contains no data rows.')
  }
  return rows.slice(1).map((values, index) => {
    const sourceRow = rowNumber(index)
    if (values.length !== headers.length) {
      validationError(filename, `row ${sourceRow} has ${values.length} columns; expected ${headers.length}.`)
    }
    const record = Object.fromEntries(headers.map((header, valueIndex) => [header, values[valueIndex] ?? '']))
    requiredFields.forEach((field) => {
      if (!rowValue(record, field)) validationError(filename, `row ${sourceRow} is missing required '${field}'.`)
    })
    return record
  })
}

function finiteField(
  filename: string,
  rowIndex: number,
  row: CsvRow,
  field: string,
  bounds?: { minimum?: number; maximum?: number },
): number {
  const raw = rowValue(row, field)
  if (!raw) validationError(filename, `row ${rowNumber(rowIndex)} is missing required '${field}'.`)
  const value = Number(raw)
  if (!Number.isFinite(value)) {
    validationError(filename, `row ${rowNumber(rowIndex)} column '${field}' has non-finite value '${raw}'.`)
  }
  if (bounds?.minimum !== undefined && value < bounds.minimum) {
    validationError(filename, `row ${rowNumber(rowIndex)} column '${field}' has value '${raw}' below ${bounds.minimum}.`)
  }
  if (bounds?.maximum !== undefined && value > bounds.maximum) {
    validationError(filename, `row ${rowNumber(rowIndex)} column '${field}' has value '${raw}' above ${bounds.maximum}.`)
  }
  return value
}

function booleanField(filename: string, rowIndex: number, row: CsvRow, field: string): void {
  const raw = rowValue(row, field)
  if (raw && !['TRUE', 'FALSE'].includes(raw.toUpperCase())) {
    validationError(filename, `row ${rowNumber(rowIndex)} column '${field}' must be TRUE or FALSE, received '${raw}'.`)
  }
}

function knownLaserField(filename: string, rowIndex: number, row: CsvRow, field: string): void {
  const raw = rowValue(row, field)
  const normalized = normalizeLaserName(raw)
  if (!LASER_ORDER.includes(normalized)) {
    validationError(filename, `row ${rowNumber(rowIndex)} column '${field}' has unknown laser '${raw}'.`)
  }
}

function uniqueKey(
  filename: string,
  seen: Map<string, number>,
  key: string,
  rowIndex: number,
  description: string,
): void {
  if (!key) validationError(filename, `row ${rowNumber(rowIndex)} has an empty canonical key for ${description}.`)
  const previous = seen.get(key)
  if (previous !== undefined) {
    validationError(filename, `row ${rowNumber(rowIndex)} duplicates ${description} from row ${previous}.`)
  }
  seen.set(key, rowNumber(rowIndex))
}

function validateSpectralLibrary(
  filename: string,
  rows: string[][],
  domain: SpectralResponseDomain,
  options: BundledDataValidationOptions = {},
): void {
  const headers = rows[0] ?? []
  if (headers.length < 2) validationError(filename, 'has no detector columns; expected fluorophore plus at least one detector.')
  if (headers.some((header) => header !== header.trim())) {
    validationError(filename, 'header contains surrounding whitespace.')
  }
  if (headers[0]?.trim().toLocaleLowerCase() !== 'fluorophore') {
    validationError(filename, `column 1 must be the fluorophore identity column, received '${headers[0] ?? ''}'.`)
  }
  const detectors = headers.slice(1).map((detector) => detector.trim())
  const detectorKeysByHeader = detectors.map((detector) => detectorKeys(detector))
  if (detectors.some((detector) => !detector)) validationError(filename, 'has a blank detector header.')
  if (detectors.some((detector) => !normalizeToken(detector))) {
    validationError(filename, 'header contains a detector with an empty canonical identity.')
  }
  const identityKey = normalizeToken(headers[0])
  const reservedDetector = detectors.find((detector) => normalizeToken(detector) === identityKey)
  if (reservedDetector) {
    validationError(filename, `detector header '${reservedDetector}' is reserved for the fluorophore identity column.`)
  }
  for (let index = 0; index < detectorKeysByHeader.length; index += 1) {
    for (let previousIndex = 0; previousIndex < index; previousIndex += 1) {
      if (detectorKeysByHeader[index].some((key) => detectorKeysByHeader[previousIndex].includes(key))) {
        validationError(filename, `detector header '${detectors[index]}' duplicates '${detectors[previousIndex]}' after canonical normalization.`)
      }
    }
  }
  const expected = SPECTRAL_LIBRARY_EXPECTATIONS[filename]
  if (expected) {
    const expectedDetectors = new Set(expected.detectors)
    const actualDetectors = new Set(detectors)
    const missingDetectors = expected.detectors.filter((detector) => !actualDetectors.has(detector))
    const unknownDetectors = detectors.filter((detector) => !expectedDetectors.has(detector))
    if (missingDetectors.length > 0 || unknownDetectors.length > 0) {
      validationError(
        filename,
        `detector columns do not match pinned coverage; missing [${missingDetectors.join(', ')}]${unknownDetectors.length > 0 ? `; unknown [${unknownDetectors.join(', ')}]` : ''}.`,
      )
    }
  }
  if (rows.length < 2) validationError(filename, 'contains no fluorophore rows.')
  if (expected && rows.length - 1 !== expected.fluorophoreCount) {
    validationError(filename, `expected ${expected.fluorophoreCount} fluorophore rows for pinned coverage, received ${rows.length - 1}.`)
  }
  const pinnedFluorophoreKeys = PINNED_SPECTRAL_FLUOROPHORE_KEYS[filename]
  const pinnedFluorophoreSet = pinnedFluorophoreKeys ? new Set(pinnedFluorophoreKeys) : undefined
  const seen = new Set<string>()
  rows.slice(1).forEach((row, index) => {
    const sourceRow = rowNumber(index)
    if (row.length !== headers.length) {
      validationError(filename, `row ${sourceRow} has ${row.length} columns; expected ${headers.length}.`)
    }
    const rawFluorophore = dictionaryText(row[0]).trim()
    if (!rawFluorophore) validationError(filename, `row ${sourceRow} has a blank fluorophore identity.`)
    const fluorophore = canonicalizeFluorophoreName(rawFluorophore)
    const identityKey = normalizeToken(fluorophore)
    if (!identityKey) validationError(filename, `row ${sourceRow} fluorophore '${fluorophore}' has an empty canonical identity.`)
    if (seen.has(identityKey)) {
      validationError(filename, `row ${sourceRow} duplicates canonical fluorophore '${fluorophore}'.`)
    }
    if (pinnedFluorophoreSet && !pinnedFluorophoreSet.has(identityKey)) {
      validationError(filename, `row ${sourceRow} fluorophore '${fluorophore}' is not in pinned fluorophore coverage.`)
    }
    seen.add(identityKey)
    let meaningful = false
    row.slice(1).forEach((raw, detectorIndex) => {
      const value = dictionaryText(raw).trim()
      if (!value) {
        validationError(filename, `row ${sourceRow} column '${detectors[detectorIndex]}' for fluorophore '${fluorophore}' is blank.`)
      }
      const numericValue = Number(value)
      if (!Number.isFinite(numericValue)) {
        validationError(filename, `row ${sourceRow} column '${detectors[detectorIndex]}' for fluorophore '${fluorophore}' has non-finite value '${value}'.`)
      }
      if (numericValue < domain.minimum || numericValue > domain.maximum) {
        validationError(filename, `row ${sourceRow} column '${detectors[detectorIndex]}' for fluorophore '${fluorophore}' has value '${value}' outside ${domain.description}.`)
      }
      if (numericValue > domain.meaningfulThreshold) meaningful = true
    })
    if (!meaningful) {
      validationError(filename, `row ${sourceRow} for fluorophore '${fluorophore}' has no meaningful nonzero detector response; ${domain.description}.`)
    }
  })
  if (pinnedFluorophoreKeys) {
    const missingFluorophores = pinnedFluorophoreKeys.filter((key) => !seen.has(key))
    if (missingFluorophores.length > 0) {
      validationError(filename, `pinned fluorophore coverage is missing [${missingFluorophores.join(', ')}].`)
    }
  }
  validatePinnedSnapshot(filename, rows, options, 'spectral response vectors')
}

export function parseLibrary(
  rows: string[][],
  source = 'bundled spectral library',
  measurementMode?: PanelMeasurementMode,
  cytometer = '',
): SpectralLibrary {
  const domain = SPECTRAL_RESPONSE_DOMAINS[source] ?? DEFAULT_SPECTRAL_RESPONSE_DOMAIN
  validateSpectralLibrary(source, rows, domain)
  const headers = rows[0]!
  const detectors = headers.slice(1).map((detector) => detector.trim())
  const fluorophores: string[] = []
  const values: number[][] = []
  rows.slice(1).forEach((row) => {
    fluorophores.push(canonicalizeFluorophoreName(row[0].trim()))
    values.push(row.slice(1).map((value) => Number(value.trim())))
  })
  const inferredCytometer = cytometer || (source.toLowerCase().endsWith('symphony_spectra.csv') ? 'symphony' : '')
  const inferredMeasurementMode = measurementMode ?? (inferredCytometer ? 'conventional' : 'spectral')
  const response_provenance = responseProvenanceForCytometer(
    inferredCytometer,
    inferredMeasurementMode,
    source,
  )
  return { detectors, fluorophores, values, response_provenance }
}

function validateCytometerDictionary(
  filename: string,
  rows: string[][],
  options: BundledDataValidationOptions = {},
): void {
  const records = recordsForTable(filename, rows, ['cytometer', 'detector', 'laser', 'description'], ['cytometer', 'detector', 'laser'])
  const seen = new Map<string, number>()
  const metadata = new Map<string, { laser: string; description: string; row: number }>()
  records.forEach((row, index) => {
    knownLaserField(filename, index, row, 'laser')
    const cytometerKey = runtimeCytometerScope(rowValue(row, 'cytometer'))
    const detector = rowValue(row, 'detector')
    if (!cytometerKey) validationError(filename, `row ${rowNumber(index)} cytometer has an empty canonical identity.`)
    if (!normalizeToken(detector)) validationError(filename, `row ${rowNumber(index)} detector '${detector}' has an empty canonical identity.`)
    if (rowValue(row, 'description')) validateDetectorDescription(filename, index, row)
    detectorKeys(detector).forEach((key) => uniqueKey(
      filename,
      seen,
      `${normalizeToken(row.cytometer)}:${key}`,
      index,
      `detector '${detector}' for cytometer '${rowValue(row, 'cytometer')}'`,
    ))
    const current = {
      laser: normalizeLaserName(row.laser),
      description: rowValue(row, 'description'),
      row: rowNumber(index),
    }
    detectorKeys(detector).forEach((key) => {
      const metadataKey = `${runtimeCytometerScope(row.cytometer)}:${key}`
      const previous = metadata.get(metadataKey)
      if (previous && (previous.laser !== current.laser || previous.description !== current.description)) {
        validationError(filename, `row ${rowNumber(index)} conflicts with detector '${detector}' metadata from row ${previous.row} in the shared runtime cytometer scope.`)
      }
      if (!previous) metadata.set(metadataKey, current)
    })
  })
  validatePinnedSnapshot(filename, rows, options, 'cytometer detector laser assignments')
}

function validateSpectralDetectorMetadata(filename: string, rows: string[][]): void {
  const entry = (Object.entries(LIBRARY_FILES) as Array<[CytometerId, string | undefined]>)
    .find(([, source]) => source === filename)
  if (!entry) return
  const [cytometer] = entry
  const scope = runtimeCytometerScope(cytometer)
  const dictionaryRows = cytometerDictionary.filter((row) => runtimeCytometerScope(rowValue(row, 'cytometer')) === scope)
  const detectors = (rows[0] ?? []).slice(1)
  detectors.forEach((detector) => {
    const matches = dictionaryRows.filter((row) => detectorNamesMatch(rowValue(row, 'detector'), detector))
    if (matches.length === 0) {
      validationError(filename, `detector column '${detector}' has no matching cytometer dictionary metadata.`)
    }
    const metadata = new Set(matches.map((row) => (
      `${normalizeLaserName(rowValue(row, 'laser'))}\u0000${rowValue(row, 'description')}`
    )))
    if (metadata.size !== 1) {
      validationError(filename, `detector column '${detector}' has conflicting cytometer dictionary metadata.`)
    }
  })
}

function validateFluorophoreDictionary(
  filename: string,
  rows: string[][],
  options: BundledDataValidationOptions = {},
): void {
  const records = recordsForTable(
    filename,
    rows,
    ['fluorophore', 'aliases', 'excitation_laser', 'nominal_wavelength', 'is_viability'],
    ['fluorophore', 'excitation_laser', 'nominal_wavelength'],
  )
  const canonicalSeen = new Map<string, number>()
  const aliasSeen = new Map<string, { canonical: string; row: number }>()
  records.forEach((row, index) => {
    const canonical = canonicalizeFluorophoreName(rowValue(row, 'fluorophore'))
    const canonicalKey = normalizeToken(canonical)
    uniqueKey(filename, canonicalSeen, canonicalKey, index, `canonical fluorophore '${canonical}'`)
    knownLaserField(filename, index, row, 'excitation_laser')
    finiteField(filename, index, row, 'nominal_wavelength', { minimum: 1, maximum: 900 })
    booleanField(filename, index, row, 'is_viability')
    const aliases = [rowValue(row, 'fluorophore'), ...dictionaryText(row.aliases).split(';')]
    aliases.forEach((alias) => {
      const key = normalizeToken(alias)
      if (!key) return
      const previous = aliasSeen.get(key)
      if (previous && previous.canonical !== canonical) {
        validationError(filename, `row ${rowNumber(index)} alias '${alias.trim()}' conflicts with canonical fluorophore '${previous.canonical}' from row ${previous.row}.`)
      }
      aliasSeen.set(key, { canonical, row: rowNumber(index) })
    })
  })
  if (options.requireComplete) {
    const pinnedAliases = PINNED_FLUOROPHORE_ALIAS_TO_CANONICAL
    const unexpected = Array.from(aliasSeen.entries()).find(([alias, entry]) => {
      const expectedCanonical = pinnedAliases[alias]
      return expectedCanonical === undefined || expectedCanonical !== normalizeToken(entry.canonical)
    })
    if (unexpected) {
      const [alias, entry] = unexpected
      const expectedCanonical = pinnedAliases[alias]
      if (expectedCanonical === undefined) {
        validationError(filename, `row ${entry.row} alias '${alias}' is not in pinned fluorophore alias coverage.`)
      }
      validationError(
        filename,
        `row ${entry.row} alias '${alias}' does not resolve to pinned canonical fluorophore '${expectedCanonical}'.`,
      )
    }
    const missing = Object.entries(pinnedAliases)
      .filter(([alias, canonical]) => {
        const actualCanonical = aliasSeen.get(alias)?.canonical
        return actualCanonical === undefined || normalizeToken(actualCanonical) !== canonical
      })
      .map(([alias]) => alias)
    if (missing.length > 0) {
      validationError(filename, `pinned fluorophore alias coverage is missing or mismatched [${missing.join(', ')}].`)
    }
  }
  validatePinnedSnapshot(filename, rows, options, 'fluorophore excitation and emission references')
}

function validateConventionalDetectorDictionary(
  filename: string,
  rows: string[][],
  options: BundledDataValidationOptions = {},
): void {
  const records = recordsForTable(
    filename,
    rows,
    ['cytometer', 'configuration', 'detector', 'laser', 'description', 'is_scatter', 'common_fluorophores'],
    ['cytometer', 'configuration', 'detector', 'laser', 'description', 'is_scatter'],
  )
  const seen = new Map<string, number>()
  const metadata = new Map<string, { laser: string; description: string; isScatter: string; row: number }>()
  records.forEach((row, index) => {
    knownLaserField(filename, index, row, 'laser')
    booleanField(filename, index, row, 'is_scatter')
    validateDetectorDescription(filename, index, row)
    const cytometerKey = normalizeToken(rowValue(row, 'cytometer'))
    const configurationKey = normalizeToken(rowValue(row, 'configuration'))
    const detector = rowValue(row, 'detector')
    if (!cytometerKey) validationError(filename, `row ${rowNumber(index)} cytometer has an empty canonical identity.`)
    if (!configurationKey) validationError(filename, `row ${rowNumber(index)} configuration has an empty canonical identity.`)
    if (!normalizeToken(detector)) validationError(filename, `row ${rowNumber(index)} detector '${detector}' has an empty canonical identity.`)
    if (options.requireComplete) {
      const metadataKey = `${normalizeToken(rowValue(row, 'cytometer'))}:${normalizeDetectorToken(detector)}`
      const pinnedMetadata = PINNED_CONVENTIONAL_DETECTOR_METADATA[metadataKey]
      if (!pinnedMetadata) {
        validationError(filename, `row ${rowNumber(index)} detector '${detector}' is not in pinned conventional detector metadata coverage.`)
      }
      const actualMetadata = [
        normalizeLaserName(rowValue(row, 'laser')),
        rowValue(row, 'description'),
        rowValue(row, 'is_scatter').toUpperCase() === 'TRUE',
      ].join('|')
      if (pinnedMetadata !== actualMetadata) {
        validationError(filename, `row ${rowNumber(index)} detector '${detector}' does not match pinned detector metadata.`)
      }
    }
    detectorKeys(detector).forEach((key) => uniqueKey(
      filename,
      seen,
      `${runtimeCytometerScope(row.cytometer)}:${normalizeToken(row.configuration)}:${key}`,
      index,
      `detector '${detector}' in configuration '${rowValue(row, 'configuration')}'`,
    ))
    const current = {
      laser: normalizeLaserName(row.laser),
      description: rowValue(row, 'description'),
      isScatter: rowValue(row, 'is_scatter').toUpperCase(),
      row: rowNumber(index),
    }
    detectorKeys(detector).forEach((key) => {
      const detectorKey = `${runtimeCytometerScope(row.cytometer)}:${key}`
      const previous = metadata.get(detectorKey)
      if (previous && (previous.laser !== current.laser || previous.description !== current.description || previous.isScatter !== current.isScatter)) {
        validationError(filename, `row ${rowNumber(index)} conflicts with detector '${detector}' metadata from row ${previous.row} in the shared runtime cytometer scope.`)
      }
      if (!previous) metadata.set(detectorKey, current)
    })
  })
  validateConventionalConfigurationCoverage(filename, records, options)
  validatePinnedSnapshot(filename, rows, options, 'conventional fluorophore-to-detector assignments')
}

const SUPPORTED_NON_FILTER_DETECTOR_DESCRIPTIONS = new Set(['unfiltered reference'])
const MIN_DETECTOR_WAVELENGTH = 300
const MAX_DETECTOR_WAVELENGTH = 900

function detectorWavelengthInRange(value: number): boolean {
  return value >= MIN_DETECTOR_WAVELENGTH && value <= MAX_DETECTOR_WAVELENGTH
}

function validateDetectorDescription(filename: string, rowIndex: number, row: CsvRow): void {
  const description = rowValue(row, 'description')
  const spectral = description.match(/^(\d{3})nm\s*[-–]\s*(\d{3})(?:\/(\d{1,3})|\/LP)-A$/i)
  if (spectral) {
    const excitation = Number(spectral[1])
    const emission = Number(spectral[2])
    const width = spectral[3] ? Number(spectral[3]) : undefined
    const emissionEdgesArePlausible = width === undefined
      ? detectorWavelengthInRange(emission)
      : detectorWavelengthInRange(emission - width / 2)
        && detectorWavelengthInRange(emission + width / 2)
    if (!detectorWavelengthInRange(excitation) || !emissionEdgesArePlausible || (width !== undefined && width <= 0)) {
      validationError(filename, `row ${rowNumber(rowIndex)} column 'description' has an implausible spectral detector wavelength or width '${description}'.`)
    }
    return
  }
  const bandpass = description.match(/^(\d{3})\s*\/\s*(\d{1,3})$/)
  if (bandpass) {
    const center = Number(bandpass[1])
    const width = Number(bandpass[2])
    if (width <= 0) {
      validationError(filename, `row ${rowNumber(rowIndex)} column 'description' has non-positive bandpass width '${description}'.`)
    }
    if (!detectorWavelengthInRange(center - width / 2) || !detectorWavelengthInRange(center + width / 2)) {
      validationError(filename, `row ${rowNumber(rowIndex)} column 'description' has an implausible conventional filter wavelength or width '${description}'.`)
    }
    return
  }
  const range = description.match(/^(\d{3})\s*[-–]\s*(\d{3})$/)
  if (range) {
    const start = Number(range[1])
    const end = Number(range[2])
    if (start <= 0 || end <= start) {
      validationError(filename, `row ${rowNumber(rowIndex)} column 'description' has a non-increasing filter range '${description}'.`)
    }
    if (!detectorWavelengthInRange(start) || !detectorWavelengthInRange(end)) {
      validationError(filename, `row ${rowNumber(rowIndex)} column 'description' has an implausible conventional filter wavelength range '${description}'.`)
    }
    return
  }
  const longpass = description.match(/^(\d{3})\s*LP$/i)
  if (longpass) {
    const center = Number(longpass[1])
    if (center <= 0) {
      validationError(filename, `row ${rowNumber(rowIndex)} column 'description' has a non-positive longpass center '${description}'.`)
    }
    if (!detectorWavelengthInRange(center)) {
      validationError(filename, `row ${rowNumber(rowIndex)} column 'description' has an implausible conventional filter wavelength '${description}'.`)
    }
    return
  }
  if (SUPPORTED_NON_FILTER_DETECTOR_DESCRIPTIONS.has(description.toLocaleLowerCase())) return
  validationError(
    filename,
    `row ${rowNumber(rowIndex)} column 'description' must be a positive bandpass, increasing range, longpass, or supported non-filter sentinel; received '${description}'.`,
  )
}

const SHARED_CONVENTIONAL_CONFIGURATION_BY_CYTOMETER: Record<string, string> = {
  // These tables intentionally hold the union used by several offered
  // configurations; the pinned code mapping selects each configuration's
  // exact subset at payload construction time.
  facsverse: 'facsverse_reference',
  lsrii: 'lsrii_reference',
}

const PINNED_CONVENTIONAL_DETECTOR_ROW_COUNT = 506
const FULL_CONVENTIONAL_BUNDLE_ROW_THRESHOLD = 100

function detectorSetContains(actual: Set<string>, expected: string): boolean {
  return detectorKeys(expected).some((key) => actual.has(key))
}

function detectorNamesMatch(left: string, right: string): boolean {
  const rightKeys = new Set(detectorKeys(right))
  return detectorKeys(left).some((key) => rightKeys.has(key))
}

function validateConventionalConfigurationCoverage(
  filename: string,
  records: CsvRow[],
  options: BundledDataValidationOptions = {},
): void {
  const looksLikeFullBundle = options.requireComplete || records.length >= FULL_CONVENTIONAL_BUNDLE_ROW_THRESHOLD
  if (looksLikeFullBundle && records.length !== PINNED_CONVENTIONAL_DETECTOR_ROW_COUNT) {
    validationError(
      filename,
      `expected ${PINNED_CONVENTIONAL_DETECTOR_ROW_COUNT} rows for the pinned complete conventional detector bundle, received ${records.length}.`,
    )
  }
  Object.entries(CONFIGURATIONS).forEach(([cytometer, configurations]) => {
    if (!CONVENTIONAL_CYTOMETERS.has(cytometer as CytometerId)) return
    const cytometerKey = runtimeCytometerScope(cytometer)
    const scopedRows = records.flatMap((row, index) => (
      runtimeCytometerScope(rowValue(row, 'cytometer')) === cytometerKey ? [{ row, index }] : []
    ))
    if (scopedRows.length === 0) {
      if (looksLikeFullBundle) {
        validationError(filename, `is missing pinned cytometer scope '${cytometer}'.`)
      }
      return
    }

    const configurationByKey = new Map(configurations.map((configuration) => [
      normalizeToken(configuration.id),
      configuration,
    ]))
    const sharedConfigurationKey = normalizeToken(SHARED_CONVENTIONAL_CONFIGURATION_BY_CYTOMETER[cytometerKey])
    const allowedConfigurationKeys = new Set([
      ...configurationByKey.keys(),
      ...(sharedConfigurationKey ? [sharedConfigurationKey] : []),
    ])
    const sharedExpectedDetectors = sharedConfigurationKey
      ? Array.from(new Set(configurations.flatMap((configuration) => CONFIGURATION_DETECTORS[configuration.id] ?? [])))
      : []

    scopedRows.forEach(({ row, index }) => {
      const configurationKey = normalizeToken(rowValue(row, 'configuration'))
      if (!allowedConfigurationKeys.has(configurationKey)) {
        validationError(filename, `row ${rowNumber(index)} uses unknown configuration '${rowValue(row, 'configuration')}' for cytometer '${cytometer}'.`)
      }
      if (rowValue(row, 'is_scatter').toUpperCase() === 'TRUE') return
      const configuration = configurationByKey.get(configurationKey)
      const expectedDetectors = configuration
        ? CONFIGURATION_DETECTORS[configuration.id]
        : configurationKey === sharedConfigurationKey
          ? sharedExpectedDetectors
          : undefined
      if (!expectedDetectors || !detectorSetContains(new Set(expectedDetectors.flatMap((detector) => detectorKeys(detector))), rowValue(row, 'detector'))) {
        validationError(filename, `row ${rowNumber(index)} detector '${rowValue(row, 'detector')}' is not part of the pinned detector set for configuration '${rowValue(row, 'configuration')}'.`)
      }
    })

    configurations.forEach((configuration) => {
      const expectedDetectors = CONFIGURATION_DETECTORS[configuration.id]
      if (!expectedDetectors) {
        validationError(filename, `configuration '${configuration.id}' has no pinned detector set.`)
      }
      const configurationKey = normalizeToken(configuration.id)
      const available = new Set(
        scopedRows
          .filter(({ row }) => (
            rowValue(row, 'is_scatter').toUpperCase() !== 'TRUE'
            && (normalizeToken(rowValue(row, 'configuration')) === configurationKey
              || normalizeToken(rowValue(row, 'configuration')) === sharedConfigurationKey)
          ))
          .flatMap(({ row }) => detectorKeys(rowValue(row, 'detector'))),
      )
      const missing = expectedDetectors.filter((detector) => !detectorSetContains(available, detector))
      if (missing.length > 0) {
        validationError(filename, `configuration '${configuration.id}' is missing pinned detector coverage [${missing.join(', ')}].`)
      }
    })
  })
}

function validateConventionalEstimateDictionary(
  filename: string,
  rows: string[][],
  options: BundledDataValidationOptions = {},
): void {
  const records = recordsForTable(
    filename,
    rows,
    ['fluorophore', 'source_url', 'source_note', 'mapping_confidence'],
    ['fluorophore', 'source_url', 'source_note', 'mapping_confidence'],
  )
  const seen = new Map<string, number>()
  records.forEach((row, index) => {
    uniqueKey(filename, seen, normalizeToken(canonicalizeFluorophoreName(rowValue(row, 'fluorophore'))), index, `fluorophore '${rowValue(row, 'fluorophore')}'`)
    if (!/^https:\/\//i.test(rowValue(row, 'source_url'))) {
      validationError(filename, `row ${rowNumber(index)} column 'source_url' must be an HTTPS URL.`)
    }
    if (!['curated', 'estimated'].includes(rowValue(row, 'mapping_confidence').toLocaleLowerCase())) {
      validationError(filename, `row ${rowNumber(index)} column 'mapping_confidence' must be curated or estimated.`)
    }
  })
  if (options.requireComplete) {
    const pinnedKeys = new Set(PINNED_CONVENTIONAL_ESTIMATE_FLUOROPHORE_KEYS)
    if (records.length !== pinnedKeys.size) {
      validationError(
        filename,
        `expected ${pinnedKeys.size} rows for the pinned conventional estimate bundle, received ${records.length}.`,
      )
    }
    records.forEach((row, index) => {
      const fluorophore = rowValue(row, 'fluorophore')
      const key = normalizeToken(canonicalizeFluorophoreName(fluorophore))
      if (!pinnedKeys.has(key)) {
        validationError(
          filename,
          `row ${rowNumber(index)} fluorophore '${fluorophore}' is not in pinned conventional estimate coverage.`,
        )
      }
    })
    const missing = PINNED_CONVENTIONAL_ESTIMATE_FLUOROPHORE_KEYS.filter((key) => !seen.has(key))
    if (missing.length > 0) {
      validationError(filename, `pinned conventional estimate coverage is missing [${missing.join(', ')}].`)
    }
  }
}

function validateMarkerDictionary(
  filename: string,
  rows: string[][],
  options: BundledDataValidationOptions = {},
): void {
  const records = recordsForTable(filename, rows, ['marker', 'aliases'], ['marker'])
  const seen = new Map<string, number>()
  records.forEach((row, index) => {
    const marker = rowValue(row, 'marker')
    const markerKey = normalizeToken(marker)
    uniqueKey(filename, seen, markerKey, index, `marker '${marker}'`)
    if (options.requireComplete) {
      const actualAliases = dictionaryText(row.aliases).split(';').map(normalizeToken).filter(Boolean)
      const expectedAliases = PINNED_MARKER_ALIASES[markerKey] ?? []
      const missingAliases = expectedAliases.filter((alias) => !actualAliases.includes(alias))
      const unexpectedAliases = actualAliases.filter((alias) => !expectedAliases.includes(alias))
      if (missingAliases.length > 0 || unexpectedAliases.length > 0 || actualAliases.length !== expectedAliases.length) {
        validationError(
          filename,
          `row ${rowNumber(index)} marker '${marker}' aliases do not match pinned marker alias coverage; missing [${missingAliases.join(', ')}]; unexpected [${unexpectedAliases.join(', ')}].`,
        )
      }
    }
  })
  if (options.requireComplete) {
    const pinnedKeys = new Set(PINNED_MARKER_KEYS)
    if (records.length !== pinnedKeys.size) {
      validationError(
        filename,
        `expected ${pinnedKeys.size} rows for the pinned marker dictionary, received ${records.length}.`,
      )
    }
    records.forEach((row, index) => {
      const marker = rowValue(row, 'marker')
      const key = normalizeToken(marker)
      if (!pinnedKeys.has(key)) {
        validationError(
          filename,
          `row ${rowNumber(index)} marker '${marker}' is not in pinned marker coverage.`,
        )
      }
    })
    const missing = PINNED_MARKER_KEYS.filter((key) => !seen.has(key))
    if (missing.length > 0) {
      validationError(filename, `pinned marker coverage is missing [${missing.join(', ')}].`)
    }
  }
}

function validatePanelWizardBrightness(
  filename: string,
  rows: string[][],
  options: BundledDataValidationOptions = {},
): void {
  const records = recordsForTable(
    filename,
    rows,
    ['cytometer', 'configuration', 'fluorophore', 'brightness_score', 'source'],
    ['cytometer', 'configuration', 'fluorophore', 'brightness_score', 'source'],
    { requireRows: false },
  )
  const seen = new Map<string, { index: number; score: number }>()
  records.forEach((row, index) => {
    const score = finiteField(filename, index, row, 'brightness_score', { minimum: 1, maximum: 5 })
    if (![1, 3, 4, 5].includes(score)) {
      validationError(filename, `row ${rowNumber(index)} column 'brightness_score' must be one of 1, 3, 4, or 5.`)
    }
    const cytometerValue = rowValue(row, 'cytometer')
    const configurationValue = rowValue(row, 'configuration')
    let cytometerKey: string
    if (cytometerValue === '*') {
      cytometerKey = '*'
    } else {
      const canonicalCytometer = CYTOMETER_ALIASES[normalizeToken(cytometerValue)]
      if (!canonicalCytometer) {
        validationError(filename, `row ${rowNumber(index)} column 'cytometer' has unsupported value '${cytometerValue}'.`)
      }
      cytometerKey = canonicalCytometer
    }
    let configurationKey: string
    if (configurationValue === '*') {
      configurationKey = '*'
    } else if (cytometerKey === '*') {
      const matches = knownConfigurationMatches(configurationValue)
      if (matches.length === 0) {
        validationError(filename, `row ${rowNumber(index)} column 'configuration' has unsupported value '${configurationValue}'.`)
      }
      if (matches.length > 1) {
        validationError(filename, `row ${rowNumber(index)} column 'configuration' value '${configurationValue}' is ambiguous without a specific cytometer.`)
      }
      configurationKey = matches[0]!
    } else {
      const canonicalConfiguration = resolveKnownConfigurationId(cytometerKey as CytometerId, configurationValue)
      if (!canonicalConfiguration) {
        validationError(filename, `row ${rowNumber(index)} column 'configuration' has unsupported value '${configurationValue}' for cytometer '${cytometerValue}'.`)
      }
      configurationKey = canonicalConfiguration
    }
    const fluorophoreValue = rowValue(row, 'fluorophore')
    const normalizedFluorophoreKey = normalizeToken(canonicalizeFluorophoreName(fluorophoreValue))
    const fluorophoreKey = resolveBundledFluorophoreKey(fluorophoreValue)
    if (!cytometerKey) validationError(filename, `row ${rowNumber(index)} cytometer has an empty canonical identity.`)
    if (!configurationKey) validationError(filename, `row ${rowNumber(index)} configuration has an empty canonical identity.`)
    if (!normalizedFluorophoreKey) validationError(filename, `row ${rowNumber(index)} fluorophore has an empty canonical identity.`)
    if (!fluorophoreKey) {
      validationError(filename, `row ${rowNumber(index)} column 'fluorophore' value '${fluorophoreValue}' does not match a supported fluorophore or alias.`)
    }
    const key = `${cytometerKey}:${configurationKey}:${fluorophoreKey}`
    if (seen.has(key)) {
      validationError(
        filename,
        `row ${rowNumber(index)} duplicates brightness reference for '${rowValue(row, 'fluorophore')}' (first seen at row ${rowNumber(seen.get(key)!.index)}).`,
      )
    }
    seen.set(key, { index, score })
  })
  if (options.requireComplete) {
    const pinnedKeys = new Set(PINNED_PANEL_WIZARD_BRIGHTNESS_KEYS)
    if (records.length !== pinnedKeys.size) {
      validationError(
        filename,
        `expected ${pinnedKeys.size} rows for the pinned panel wizard brightness bundle, received ${records.length}.`,
      )
    }
    const unexpected = Array.from(seen.entries()).find(([key]) => !pinnedKeys.has(key))
    if (unexpected) {
      validationError(
        filename,
        `row ${rowNumber(unexpected[1].index)} brightness reference '${unexpected[0]}' is not in pinned panel wizard brightness coverage.`,
      )
    }
    const mismatched = Array.from(seen.entries()).find(([key, value]) => (
      PINNED_PANEL_WIZARD_BRIGHTNESS_SCORES[key] !== value.score
    ))
    if (mismatched) {
      validationError(
        filename,
        `row ${rowNumber(mismatched[1].index)} brightness reference '${mismatched[0]}' has score ${mismatched[1].score}, expected pinned score ${PINNED_PANEL_WIZARD_BRIGHTNESS_SCORES[mismatched[0]]}.`,
      )
    }
    const missing = PINNED_PANEL_WIZARD_BRIGHTNESS_KEYS.filter((key) => !seen.has(key))
    if (missing.length > 0) {
      validationError(filename, `pinned panel wizard brightness coverage is missing [${missing.join(', ')}].`)
    }
  }
}

function validatePanelWizardAntigenDensity(filename: string, rows: string[][]): void {
  const records = recordsForTable(
    filename,
    rows,
    ['cell_type', 'antigen', 'molecules_per_cell', 'source'],
    ['cell_type', 'antigen', 'molecules_per_cell', 'source'],
    { requireRows: false },
  )
  const seen = new Map<string, number>()
  records.forEach((row, index) => {
    const moleculesPerCell = finiteField(filename, index, row, 'molecules_per_cell', { minimum: 0 })
    if (moleculesPerCell <= 0) {
      validationError(filename, `row ${rowNumber(index)} column 'molecules_per_cell' must be greater than zero.`)
    }
    const cellTypeKey = normalizeToken(rowValue(row, 'cell_type'))
    const antigenKey = normalizeToken(rowValue(row, 'antigen'))
    if (!cellTypeKey) validationError(filename, `row ${rowNumber(index)} cell_type has an empty canonical identity.`)
    if (!antigenKey) validationError(filename, `row ${rowNumber(index)} antigen has an empty canonical identity.`)
    uniqueKey(
      filename,
      seen,
      `${cellTypeKey}:${antigenKey}`,
      index,
      `antigen-density reference for '${rowValue(row, 'cell_type')}/${rowValue(row, 'antigen')}'`,
    )
  })
}

export function validateBundledDataRows(
  filename: string,
  rows: string[][],
  options: BundledDataValidationOptions = {},
): void {
  if (SPECTRAL_RESPONSE_DOMAINS[filename]) {
    validateSpectralLibrary(filename, rows, SPECTRAL_RESPONSE_DOMAINS[filename], options)
    return
  }
  switch (filename) {
    case 'cytometer_dictionary.csv':
      validateCytometerDictionary(filename, rows, options)
      return
    case 'fluorophore_dictionary.csv':
      validateFluorophoreDictionary(filename, rows, options)
      return
    case 'conventional_detector_dictionary.csv':
      validateConventionalDetectorDictionary(filename, rows, options)
      return
    case 'conventional_fluorophore_estimates.csv':
      validateConventionalEstimateDictionary(filename, rows, options)
      return
    case 'marker_dictionary.csv':
      validateMarkerDictionary(filename, rows, options)
      return
    case 'panel_wizard_brightness.csv':
      validatePanelWizardBrightness(filename, rows, options)
      return
    case 'panel_wizard_antigen_density.csv':
      validatePanelWizardAntigenDensity(filename, rows)
      return
    default:
      validationError(filename, 'is not a recognized bundled data file.')
  }
}

function initializeDictionaries(): Promise<void> {
  if (dictionaryInitialization) return dictionaryInitialization
  const pending = Promise.all([
    loadCsv('cytometer_dictionary.csv'),
    loadCsv('fluorophore_dictionary.csv'),
    loadCsv('conventional_detector_dictionary.csv'),
    loadCsv('conventional_fluorophore_estimates.csv'),
  ]).then(([cytometers, fluorophores, conventionalDetectors, conventionalEstimates]) => {
    cytometerDictionary = rowsToObjects(cytometers)
    fluorophoreDictionary = rowsToObjects(fluorophores)
    conventionalDetectorDictionary = rowsToObjects(conventionalDetectors)
    conventionalFluorophoreEstimateDictionary = rowsToObjects(conventionalEstimates)
    validateConventionalCommonFluorophores()
    validateConventionalEstimateReferences()
  })
  dictionaryInitialization = pending
  return pending.catch((error) => {
    if (dictionaryInitialization === pending) dictionaryInitialization = null
    throw error
  })
}

function initializeLibrary(cytometer: CytometerId): Promise<void> {
  const existing = libraryInitializations.get(cytometer)
  if (existing) return existing
  const pending = CONVENTIONAL_CYTOMETERS.has(cytometer)
    ? initializeDictionaries().then(() => {
      libraries.set(cytometer, buildConventionalLibrary(cytometer))
    })
    : initializeDictionaries().then(async () => {
      const filename = LIBRARY_FILES[cytometer]!
      const rows = await loadCsv(filename)
      validateSpectralDetectorMetadata(filename, rows)
      const measurementMode = LIBRARIES.find((libraryInfo) => libraryInfo.id === cytometer)!.measurement_mode
      libraries.set(
        cytometer,
        parseLibrary(rows, filename, measurementMode, cytometer),
      )
    })
  libraryInitializations.set(cytometer, pending)
  return pending.catch((error) => {
    if (libraryInitializations.get(cytometer) === pending) libraryInitializations.delete(cytometer)
    throw error
  })
}

async function initializeCytometer(cytometer: CytometerId): Promise<void> {
  await Promise.all([initializeDictionaries(), initializeLibrary(cytometer)])
}

export async function initializeSpectralEngine(): Promise<void> {
  await Promise.all([
    initializeDictionaries(),
    ...LIBRARIES.map((library) => initializeLibrary(library.id as CytometerId)),
  ])
}

function normalizeToken(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function runtimeCytometerScope(value: unknown): string {
  const key = normalizeToken(value)
  return CYTOMETER_ALIASES[key] ?? key
}

export function normalizeLaserName(value: unknown): string {
  const token = normalizeToken(value)
  if (token === 'v' || token === 'violet') return 'Violet'
  if (token === 'b' || token === 'blue') return 'Blue'
  if (token === 'y' || token === 'yg' || token === 'yellowgreen') return 'YellowGreen'
  if (token === 'r' || token === 'red') return 'Red'
  if (token === 'u' || token === 'uv') return 'UV'
  if (token === 'duv' || token === 'deepuv') return 'DeepUV'
  if (token === 'ir') return 'IR'
  return String(value ?? '').trim()
}

export function normalizeDetectorToken(value: unknown): string {
  return String(value ?? '').trim().toUpperCase().replace(/\s+/g, '').replace(/([A-Z]+)-([0-9])/g, '$1$2')
}

export function detectorKeys(detector: string): string[] {
  const noParentheses = detector.trim().replace(/\s*\([^)]*\)/g, '')
  const base = noParentheses.replace(/-A$/i, '')
  return Array.from(new Set([
    normalizeDetectorToken(detector),
    normalizeDetectorToken(noParentheses),
    normalizeDetectorToken(base),
    normalizeDetectorToken(base ? `${base}-A` : ''),
  ].filter(Boolean)))
}

export function resolveCytometer(value: unknown = 'aurora'): CytometerId {
  const key = normalizeToken(value || 'aurora')
  const match = CYTOMETER_ALIASES[key]
  if (!match) throw new Error('Panel builder supports spectral Aurora, FACSDiscover, ID7000, and Attune Xenith plus conventional FACSymphony, Fortessa, Celesta, Attune NxT, Accuri C6 Plus, FACSCalibur, FACSCanto II, FACSLyric, ZE5, CytPix, NovoCyte Quanteon, MACSQuant, FACSVerse, LSR II, CytoFLEX LX, Navios, DxFLEX, and FACSAria Fusion configurations.')
  return match
}

function resolveKnownConfigurationId(id: CytometerId, value?: unknown): string | undefined {
  const configs = CONFIGURATIONS[id]
  const key = normalizeToken(value)
  if (!key) return undefined
  const direct = configs.find((config) => normalizeToken(config.id) === key)
  if (direct) return direct.id
  if (id === 'fortessa' && key === '3l') return 'fortessa_3l'
  if (id === 'fortessa' && key === '4l') return 'fortessa_4l'
  if (id === 'celesta' && key === 'bv') return 'celesta_bv'
  if (id === 'celesta' && key === 'bvr') return 'celesta_bvr'
  if (id === 'celesta' && key === 'bvuv') return 'celesta_bvuv'
  if (id === 'celesta' && key === 'bvyg') return 'celesta_bvyg'
  if (id === 'attune_nxt' && (key === '4l' || key === '4laser')) return 'attune_nxt_4l'
  if (id === 'accuri_c6_plus' && (key === 'standard' || key === '3blue1red' || key === '3b1r' || key === '4color' || key === '4colour')) return 'accuri_c6_plus_standard'
  if (id === 'facscalibur' && (key === '2l4' || key === '2laser4color' || key === '4color' || key === '4colour')) return 'facscalibur_2l_4'
  if (id === 'canto' && (key === '3laser422' || key === '3l422')) return 'canto_3l_4_2_2'
  if (id === 'lyric' && (key === '2l4color' || key === '2laser4color')) return 'lyric_2l_4'
  if (id === 'lyric' && (key === '2l6color' || key === '2laser6color')) return 'lyric_2l_6'
  if (id === 'lyric' && (key === '3l8color' || key === '3laser8color')) return 'lyric_3l_8'
  if (id === 'lyric' && (key === '3l10color' || key === '3laser10color')) return 'lyric_3l_10'
  if (id === 'lyric' && (key === '3l12color' || key === '3laser12color' || key === '12color')) return 'lyric_3l_12'
  if (id === 'ze5' && key === '3l17') return 'ze5_3l_17'
  if (id === 'ze5' && key === '3l17option2') return 'ze5_3l_17_option2'
  if (id === 'ze5' && key === '3l20') return 'ze5_3l_20'
  if (id === 'ze5' && key === '4l24') return 'ze5_4l_24'
  if (id === 'ze5' && (key === '5l27' || key === '5laser')) return 'ze5_5l_27'
  if (id === 'quanteon' && key === '4025') return 'quanteon_4025'
  if (id === 'macsquant' && key === 'analyzer10') return 'macsquant_analyzer10'
  if (id === 'macsquant' && key === 'analyzer16') return 'macsquant_analyzer16'
  if (id === 'macsquant' && key === 'vyb') return 'macsquant_vyb'
  if (id === 'facsverse' && (key === '1laser4color' || key === '4-0-0' || key === '400')) return 'facsverse_1l_4'
  if (id === 'facsverse' && (key === '2laser6color' || key === '4-2-0' || key === '420')) return 'facsverse_2l_6'
  if (id === 'facsverse' && (key === '3laser8color' || key === '4-2-2' || key === '422')) return 'facsverse_3l_8'
  if (id === 'lsrii' && key.startsWith('6b')) {
    const match = key.match(/^6b(\d+)v(\d+)uv(\d+)r$/)
    if (match) {
      const candidate = `lsrii_6b_${match[1]}v_${match[2]}uv_${match[3]}r`
      if (configs.some((config) => config.id === candidate)) return candidate
    }
  }
  if (id === 'cytoflex_lx' && (key === 'u3v5b3y5r3i0' || key === '5l19')) return 'cytoflex_lx_u3_v5_b3_y5_r3_i0'
  if (id === 'navios' && (key === '2laser8color' || key === '8color' || key === '2l8')) return 'navios_2l_8'
  if (id === 'dxflex' && (key === 'b5r3v5' || key === '13color' || key === '13colour')) return 'dxflex_b5_r3_v5'
  if (id === 'facsaria_fusion' && (key === 'buv' || key === 'buvoptimized' || key === 'buvoptimizedfacilityconfiguration')) return 'facsaria_fusion_buv'
  const alias = CONFIGURATION_ALIASES[key]
  return configs.some((config) => config.id === alias) ? alias : undefined
}

export function resolveKnownConfiguration(cytometer: unknown, value?: unknown): string | undefined {
  return resolveKnownConfigurationId(resolveCytometer(cytometer), value)
}

function knownConfigurationMatches(value: unknown): string[] {
  return Array.from(new Set(
    (Object.keys(CONFIGURATIONS) as CytometerId[])
      .map((cytometer) => resolveKnownConfigurationId(cytometer, value))
      .filter((configuration): configuration is string => Boolean(configuration)),
  ))
}

export function resolveKnownConfigurationAcrossCytometers(value: unknown): string | undefined {
  const matches = knownConfigurationMatches(value)
  return matches.length === 1 ? matches[0] : undefined
}

export function resolveConfiguration(cytometer: unknown, value?: unknown): string {
  const id = resolveCytometer(cytometer)
  return resolveKnownConfigurationId(id, value) ?? CONFIGURATIONS[id][0].id
}

function dictionaryCandidates(cytometer: CytometerId): CsvRow[] {
  const ids = cytometer === 'discover'
    ? new Set(['discover', 'discover_s8', 'discover_a8'])
    : cytometer === 'symphony'
      ? new Set(['symphony', 'a5se'])
      : new Set([cytometer])
  if (CONVENTIONAL_CYTOMETERS.has(cytometer)) {
    const scope = runtimeCytometerScope(cytometer)
    return conventionalDetectorDictionary.filter((row) => runtimeCytometerScope(row.cytometer) === scope)
  }
  const scopes = new Set(Array.from(ids, (id) => runtimeCytometerScope(id)))
  return cytometerDictionary.filter((row) => scopes.has(runtimeCytometerScope(row.cytometer)))
}

function matchingDictionaryRow(cytometer: CytometerId, detector: string): CsvRow | undefined {
  const requested = new Set(detectorKeys(detector))
  return dictionaryCandidates(cytometer).find((row) => detectorKeys(dictionaryText(row.detector)).some((key) => requested.has(key)))
}

export function detectorLaser(cytometer: CytometerId, detector: string): string {
  const dictionaryLaser = matchingDictionaryRow(cytometer, detector)?.laser
  if (dictionaryLaser) return normalizeLaserName(dictionaryLaser)
  if (/^320/i.test(detector)) return 'DeepUV'
  if (/^(UV|355)/i.test(detector)) return 'UV'
  if (/^(V|405)/i.test(detector)) return 'Violet'
  if (/^(B|488)/i.test(detector)) return 'Blue'
  if (/^(YG|Y|561)/i.test(detector)) return 'YellowGreen'
  if (/^(R|637|640)/i.test(detector)) return 'Red'
  if (/^(IR|808|781)/i.test(detector)) return 'IR'
  return 'Other'
}

const AURORA_EMISSIONS: Record<string, number[]> = {
  UV: [370, 395, 420, 440, 450, 480, 480, 500, 520, 550, 570, 580, 600, 660, 750, 800],
  V: [420, 440, 450, 480, 480, 500, 550, 570, 580, 600, 660, 680, 690, 700, 730, 780],
  B: [500, 520, 550, 550, 570, 580, 600, 600, 660, 680, 690, 700, 750, 780],
  YG: [570, 580, 600, 600, 660, 680, 700, 730, 750, 780],
  R: [660, 680, 700, 730, 730, 750, 780, 800],
}

export function id7000Emission(detector: string): number | null {
  const match = detector.trim().toUpperCase().replace(/-A$/, '').match(/^(320|355|405|488|561|637|808)CH(\d+)$/)
  if (!match) return null
  const startChannel: Record<string, number> = { 320: 1, 355: 1, 405: 1, 488: 4, 561: 10, 637: 17, 808: 36 }
  const startEmission: Record<string, number> = { 320: 350, 355: 370, 405: 420, 488: 500, 561: 570, 637: 660, 808: 810 }
  return startEmission[match[1]] + (Number(match[2]) - startChannel[match[1]]) * 15
}

export function detectorEmission(cytometer: CytometerId, detector: string): number {
  const description = matchingDictionaryRow(cytometer, detector)?.description ?? ''
  const descriptionMatch = description.match(/(\d{3})(?=\/|\/LP|-A)/)
  if (descriptionMatch) return Number(descriptionMatch[1])
  const longpassDescription = description.match(/(\d{3})\s*LP\b/i)
  if (longpassDescription) return Number(longpassDescription[1])
  const rangeDescription = description.match(/(\d{3})\s*[-–]\s*(\d{3})/)
  if (rangeDescription) return (Number(rangeDescription[1]) + Number(rangeDescription[2])) / 2
  const parenthetical = detector.match(/\((\d{3})\)/)
  if (parenthetical) return Number(parenthetical[1])
  const embedded = detector.match(/.(\d{3})(?=-A$)/)
  if (embedded) return Number(embedded[1])

  if (cytometer === 'aurora') {
    const match = detector.trim().toUpperCase().replace(/-A$/, '').match(/^([A-Z]+)(\d+)$/)
    const emissions = match ? AURORA_EMISSIONS[match[1]] : undefined
    const emission = emissions?.[Number(match?.[2]) - 1]
    if (emission) return emission
  }
  if (cytometer === 'id7000') {
    const emission = id7000Emission(detector)
    if (emission) return emission
  }

  const laser = detectorLaser(cytometer, detector)
  const offset = Number(detector.match(/(\d+)(?=(?:-A)?$)/)?.[1] ?? 1)
  const starts: Record<string, number> = {
    DeepUV: 350,
    UV: 370,
    Violet: 420,
    Blue: 500,
    YellowGreen: 570,
    Red: 660,
    IR: 810,
    Other: 400,
  }
  return (starts[laser] ?? starts.Other) + (offset - 1) * 15
}

function detectorChannelIndex(detector: string): number {
  const clean = detector.trim().toUpperCase().replace(/\s*\([^)]*\)/g, '').replace(/-A$/, '')
  return Number(clean.match(/(?:CH)?(\d+)$/)?.[1] ?? 0)
}

function detectorMetadata(cytometer: CytometerId, detectors: string[]): DetectorInfo[] {
  return detectors.map((detector) => {
    const laser = detectorLaser(cytometer, detector)
    const description = matchingDictionaryRow(cytometer, detector)?.description?.trim() ?? ''
    return {
      detector,
      label: cytometer === 'aurora' ? detector : (description || detector),
      laser,
      emission: detectorEmission(cytometer, detector),
      color: LASER_PALETTE[laser] ?? LASER_PALETTE.Other,
    }
  }).sort((left, right) => {
    const laserDifference = LASER_ORDER.indexOf(left.laser) - LASER_ORDER.indexOf(right.laser)
    if (laserDifference) return laserDifference
    if (left.emission !== right.emission) return left.emission - right.emission
    const channelDifference = detectorChannelIndex(left.detector) - detectorChannelIndex(right.detector)
    return channelDifference || left.detector.localeCompare(right.detector)
  })
}

type DetectorFilter = {
  center: number
  width: number
  type: 'bandpass' | 'longpass'
}

export function detectorFilter(cytometer: CytometerId, detector: string): DetectorFilter | null {
  const description = matchingDictionaryRow(cytometer, detector)?.description ?? detector
  const match = description.match(/(\d{3})\s*\/\s*(\d{1,3})/)
  if (match) return { center: Number(match[1]), width: Number(match[2]), type: 'bandpass' }
  const range = description.match(/(\d{3})\s*[-–]\s*(\d{3})/)
  if (range) {
    const lower = Number(range[1])
    const upper = Number(range[2])
    return { center: (lower + upper) / 2, width: upper - lower, type: 'bandpass' }
  }
  const longpass = description.match(/(\d{3})\s*LP\b/i)
  if (longpass) return { center: Number(longpass[1]), width: 0, type: 'longpass' }
  return null
}

function fluorophoreCanonicalLookup(): Map<string, string> {
  const lookup = new Map<string, string>()
  fluorophoreDictionary.forEach((row) => addFluorophoreDictionaryRow(lookup, row))
  return lookup
}

function validateConventionalCommonFluorophores(): void {
  const canonicalLookup = fluorophoreCanonicalLookup()
  conventionalDetectorDictionary.forEach((row, index) => {
    dictionaryText(row.common_fluorophores)
      .split(';')
      .map((name) => name.trim())
      .filter(Boolean)
      .forEach((name) => {
        if (normalizeToken(name) === 'ssc') return
        if (!canonicalLookup.has(normalizeToken(name))) {
          validationError(
            'conventional_detector_dictionary.csv',
            `row ${rowNumber(index)} common_fluorophores value '${name}' does not match a canonical fluorophore or alias.`,
          )
        }
      })
  })
}

function validateConventionalEstimateReferences(): void {
  const canonicalLookup = fluorophoreCanonicalLookup()
  const seen = new Map<string, number>()
  conventionalFluorophoreEstimateDictionary.forEach((row, index) => {
    const fluorophore = dictionaryText(row.fluorophore).trim()
    const canonical = canonicalLookup.get(normalizeToken(fluorophore))
    if (!canonical) {
      validationError(
        'conventional_fluorophore_estimates.csv',
        `row ${rowNumber(index)} column 'fluorophore' value '${fluorophore}' does not match a canonical fluorophore or alias.`,
      )
    }
    const canonicalKey = normalizeToken(canonical)
    const previous = seen.get(canonicalKey)
    if (previous !== undefined) {
      validationError(
        'conventional_fluorophore_estimates.csv',
        `row ${rowNumber(index)} fluorophore '${fluorophore}' resolves to canonical fluorophore '${canonical}' already defined on row ${previous}.`,
      )
    }
    seen.set(canonicalKey, rowNumber(index))
  })
}

export function addFluorophoreDictionaryRow(
  lookup: Map<string, string>,
  row: CsvRow,
): void {
  const canonical = canonicalizeFluorophoreName(dictionaryText(row.fluorophore).trim())
  if (!canonical) return
  const aliases = [row.fluorophore, ...dictionaryText(row.aliases).split(';')]
  aliases.forEach((alias) => {
    const key = normalizeToken(alias)
    if (key && !lookup.has(key)) lookup.set(key, canonical)
  })
}

export function addCanonicalFluorophoreRow(
  rows: Map<string, CsvRow>,
  canonical: string | undefined,
  row: CsvRow,
): void {
  if (canonical) rows.set(canonical, row)
}

export function applyPreferredDetectorFallback(
  row: number[],
  detectors: string[],
  preferredDetector: string,
): void {
  if (Math.max(...row) <= 0 && preferredDetector) {
    const preferredIndex = detectors.indexOf(preferredDetector)
    if (preferredIndex >= 0) row[preferredIndex] = 1
  }
}

function conventionalFluorophoreWavelengths(): Map<string, number> {
  const lookup = fluorophoreCanonicalLookup()
  const wavelengths = new Map<string, number>()
  fluorophoreDictionary.forEach((row) => {
    const canonical = lookup.get(normalizeToken(row.fluorophore))
    const wavelength = Number(row.nominal_wavelength)
    if (canonical && Number.isFinite(wavelength) && wavelength > 0) wavelengths.set(canonical, wavelength)
  })
  return wavelengths
}

export function approximateDetectorResponse(emission: number, filter: DetectorFilter): number {
  // Public reference tables provide peak emission and filter passbands, not a
  // complete instrument-specific spillover matrix. A smooth generic emission
  // envelope keeps the conventional preview useful without presenting it as
  // measured compensation data.
  if (filter.type === 'longpass') {
    const edgeDistance = (emission - filter.center) / 12
    return 1 / (1 + Math.exp(-edgeDistance))
  }
  const sigma = 18
  const samples = ninePointBandpass(filter.center, filter.width)
  return samples.reduce((sum, wavelength) => {
    const distance = (wavelength - emission) / sigma
    return sum + Math.exp(-0.5 * distance * distance)
  }, 0) / samples.length
}

export function ninePointBandpass(center: number, width: number): number[] {
  return Array.from({ length: 9 }, (_, index) => center - width / 2 + ((index + 0.5) / 9) * width)
}

function buildConventionalLibrary(cytometer: CytometerId): SpectralLibrary {
  const scope = runtimeCytometerScope(cytometer)
  const rows = conventionalDetectorDictionary.filter((row) => runtimeCytometerScope(row.cytometer) === scope)
  const detectorsByIdentity = new Map<string, string>()
  rows
    .filter((row) => row.is_scatter?.toUpperCase() !== 'TRUE')
    .forEach((row) => {
      const detector = rowValue(row, 'detector')
      const identity = detectorKeys(detector).sort()[0]
      if (identity && !detectorsByIdentity.has(identity)) detectorsByIdentity.set(identity, detector)
    })
  const detectors = Array.from(detectorsByIdentity.values())
  if (detectors.length === 0) throw new Error(`No conventional detector reference data is available for cytometer '${cytometer}'.`)

  const canonicalLookup = fluorophoreCanonicalLookup()
  const wavelengths = conventionalFluorophoreWavelengths()
  const specifications = new Map<string, {
    lasers: Set<string>
    preferredDetector: string
    mapping: FluorophoreMapping
  }>()
  rows.forEach((row, rowIndex) => {
    if (row.is_scatter?.toUpperCase() === 'TRUE') return
    const names = dictionaryText(row.common_fluorophores).split(';').map((name) => name.trim()).filter(Boolean)
    names.forEach((name) => {
      if (normalizeToken(name) === 'ssc') return
      const canonical = canonicalLookup.get(normalizeToken(name))
      if (!canonical) {
        validationError(
          'conventional_detector_dictionary.csv',
          `row ${rowNumber(rowIndex)} common_fluorophores value '${name}' does not match a canonical fluorophore or alias.`,
        )
      }
      const specification = specifications.get(canonical) ?? {
        lasers: new Set<string>(),
        preferredDetector: row.detector,
        mapping: {
          confidence: 'curated' as const,
          source: 'conventional_detector_dictionary.csv',
        },
      }
      specification.lasers.add(normalizeLaserName(row.laser))
      if (!specification.preferredDetector) specification.preferredDetector = row.detector
      specifications.set(canonical, specification)
    })
  })

  const detectorCandidates = detectors.map((detector) => ({
    detector,
    laser: normalizeLaserName(matchingDictionaryRow(cytometer, detector)?.laser),
    filter: detectorFilter(cytometer, detector),
  }))
  const fluorophoreRows = new Map<string, CsvRow>()
  fluorophoreDictionary.forEach((row) => {
    addCanonicalFluorophoreRow(fluorophoreRows, canonicalLookup.get(normalizeToken(row.fluorophore)), row)
  })

  // These rows are public peak/laser references, not measured compensation data.
  // They allow published dyes that are absent from a detector's common-dye list
  // to receive a clearly labelled, filter-based planning response on every
  // offered conventional configuration with a compatible laser/filter.
  conventionalFluorophoreEstimateDictionary.forEach((sourceRow) => {
    const canonical = canonicalLookup.get(normalizeToken(sourceRow.fluorophore))
    if (!canonical || specifications.has(canonical)) return
    const fluorophoreRow = fluorophoreRows.get(canonical)
    const laser = normalizeLaserName(fluorophoreRow?.excitation_laser)
    const emission = wavelengths.get(canonical)
    if (!fluorophoreRow || !laser || !emission) return
    const bestDetector = detectorCandidates
      .filter((candidate) => candidate.laser === laser && candidate.filter)
      .map((candidate) => ({
        ...candidate,
        response: approximateDetectorResponse(emission, candidate.filter as DetectorFilter),
      }))
      .sort((left, right) => right.response - left.response)[0]
    if (!bestDetector || bestDetector.response < 0.02) return
    specifications.set(canonical, {
      lasers: new Set([laser]),
      preferredDetector: bestDetector.detector,
      mapping: {
        confidence: 'estimated',
        source: sourceRow.source_url,
        note: sourceRow.source_note,
      },
    })
  })

  const values = Array.from(specifications.entries()).map(([fluorophore, specification]) => {
    const preferredFilter = detectorFilter(cytometer, specification.preferredDetector)
    const emission = wavelengths.get(fluorophore) ?? preferredFilter?.center ?? 0
    const row = detectors.map((detector) => {
      const detectorRow = matchingDictionaryRow(cytometer, detector)
      if (!detectorRow || !specification.lasers.has(normalizeLaserName(detectorRow.laser))) return 0
      const filter = detectorFilter(cytometer, detector)
      return filter && emission > 0 ? approximateDetectorResponse(emission, filter) : 0
    })
    if (Math.max(...row) <= 0 && specification.preferredDetector) {
      applyPreferredDetectorFallback(row, detectors, specification.preferredDetector)
    }
    return { fluorophore, row }
  })

  return {
    detectors,
    fluorophores: values.map(({ fluorophore }) => fluorophore),
    values: values.map(({ row }) => row),
    response_provenance: responseProvenanceForCytometer(cytometer, 'conventional'),
    fluorophoreMappings: new Map(Array.from(specifications.entries()).map(([fluorophore, specification]) => [
      fluorophore,
      specification.mapping,
    ])),
  }
}

export function normalizeRow(values: number[]): number[] {
  let denominator = 0
  values.forEach((value) => { denominator = Math.max(denominator, Math.abs(value)) })
  if (!Number.isFinite(denominator) || denominator <= 0) denominator = 1
  return values.map((value) => value / denominator)
}

function configurationDetectorIndices(library: SpectralLibrary, cytometer: CytometerId, configuration: string): number[] {
  const metadata = detectorMetadata(cytometer, library.detectors)
  const requestedDetectors = CONFIGURATION_DETECTORS[configuration]
  const requestedLasers = CONFIGURATION_LASERS[configuration]
  const included = requestedDetectors
    ? metadata.filter((detector) => requestedDetectors.some((expected) => detectorNamesMatch(detector.detector, expected)))
    : requestedLasers
      ? metadata.filter((detector) => requestedLasers.includes(detector.laser))
      : metadata
  if (requestedDetectors) {
    const missing = requestedDetectors.filter((expected) => !metadata.some((detector) => detectorNamesMatch(detector.detector, expected)))
    if (missing.length > 0) {
      throw new BundledDataValidationError(
        `conventional_detector_dictionary.csv: configuration '${configuration}' is missing pinned detector coverage [${missing.join(', ')}].`,
      )
    }
  }
  if (requestedLasers) {
    const missing = requestedLasers.filter((expected) => !metadata.some((detector) => normalizeLaserName(detector.laser) === normalizeLaserName(expected)))
    if (missing.length > 0) {
      throw new BundledDataValidationError(
        `cytometer_dictionary.csv: configuration '${configuration}' is missing pinned laser coverage [${missing.join(', ')}].`,
      )
    }
  }
  const indexByDetector = new Map(library.detectors.map((detector, index) => [detector, index]))
  return included.map((detector) => indexByDetector.get(detector.detector)).filter((index): index is number => index !== undefined)
}

function fluorophoreLookup(library: SpectralLibrary): Map<string, number> {
  const lookup = new Map<string, number>()
  library.fluorophores.forEach((fluorophore, index) => {
    lookup.set(normalizeToken(fluorophore), index)
    const bundledKey = resolveBundledFluorophoreKey(fluorophore)
    if (bundledKey && !lookup.has(bundledKey)) lookup.set(bundledKey, index)
  })
  fluorophoreDictionary.forEach((row) => {
    const canonicalIndex = lookup.get(normalizeToken(row.fluorophore))
    if (canonicalIndex === undefined) return
    const aliases = [row.fluorophore, ...dictionaryText(row.aliases).split(';')]
    aliases.forEach((alias) => {
      const key = normalizeToken(alias)
      if (key && !lookup.has(key)) lookup.set(key, canonicalIndex)
    })
  })
  return lookup
}

function requestedLibraryIndex(requested: string, base: PanelConfigurationBase): number | undefined {
  const directKey = normalizeToken(requested)
  const bundledKey = resolveBundledFluorophoreKey(requested)
  return base.lookup.get(directKey) ?? (bundledKey ? base.lookup.get(bundledKey) : undefined)
}

export function calculateSimilarityMatrix(values: number[][]): number[][] {
  const norms = values.map((row) => Math.sqrt(row.reduce((sum, value) => sum + value * value, 0)) || 1e-6)
  return values.map((row, rowIndex) => values.map((column, columnIndex) => {
    const dot = row.reduce((sum, value, index) => sum + value * column[index], 0)
    return Math.max(0, Math.min(1, dot / (norms[rowIndex] * norms[columnIndex])))
  }))
}

export function calculatePanelComplexity(values: number[][]): number | null {
  if (values.length === 0 || values[0]?.length === 0) return null
  if (values.length < 2) return 1
  const decomposition = new SingularValueDecomposition(new Matrix(values), { autoTranspose: true })
  const singularValues = decomposition.diagonal.filter((value) => Number.isFinite(value) && value > 0)
  if (singularValues.length === 0) return null
  const condition = Math.max(...singularValues) / Math.min(...singularValues)
  return Number.isFinite(condition) ? Math.round(condition * 100) / 100 : null
}

function namedRows(names: string[], detectors: string[], values: number[][]): NumericRow[] {
  return values.map((row, rowIndex) => ({
    fluorophore: names[rowIndex],
    ...Object.fromEntries(detectors.map((detector, detectorIndex) => [detector, row[detectorIndex]])),
  }))
}

function configurationBase(
  id: CytometerId,
  config: string,
  library: SpectralLibrary,
): PanelConfigurationBase {
  const cacheKey = `${id}:${config}`
  const cached = configurationBases.get(cacheKey)
  if (cached) return cached

  const detectorIndices = configurationDetectorIndices(library, id, config)
  if (detectorIndices.length === 0) throw new Error('Selected panel configuration has no matching detectors.')
  const detectors = detectorIndices.map((index) => library.detectors[index])
  const detectorInfo = detectorMetadata(id, detectors)
  const sortedDetectorIndex = new Map(detectors.map((detector, index) => [detector, index]))
  const outputIndices = detectorInfo.map((detector) => detectorIndices[sortedDetectorIndex.get(detector.detector)!])
  const retainedSignal = library.values.map((row) => outputIndices.reduce(
    (maximum, detectorIndex) => Math.max(maximum, Math.abs(row[detectorIndex])),
    0,
  ))
  const availableIndices = library.fluorophores
    .map((_, index) => index)
    .filter((index) => retainedSignal[index] >= 0.02)
  const normalizedRowsByLibraryIndex = new Map(availableIndices.map((libraryIndex) => [
    libraryIndex,
    normalizeRow(outputIndices.map((detectorIndex) => library.values[libraryIndex][detectorIndex])),
  ]))
  const fluorophores: FluorInfo[] = availableIndices.map((libraryIndex) => {
    const row = normalizedRowsByLibraryIndex.get(libraryIndex)!
    const peakIndex = row.reduce(
      (best, value, index, values) => value > values[best] ? index : best,
      0,
    )
    const peak = detectorInfo[peakIndex]
    const mapping = library.fluorophoreMappings?.get(library.fluorophores[libraryIndex])
    return {
      fluorophore: library.fluorophores[libraryIndex],
      peak_detector: peak.detector,
      peak_laser: peak.laser,
      peak_color: peak.color,
      retained_signal: retainedSignal[libraryIndex],
      mapping_confidence: mapping?.confidence,
      mapping_source: mapping?.source,
      mapping_note: mapping?.note,
    }
  }).sort((left, right) => left.peak_laser.localeCompare(right.peak_laser) || left.fluorophore.localeCompare(right.fluorophore))

  const base = {
    detectorInfo,
    fluorophores,
    retainedSignal,
    normalizedRowsByLibraryIndex,
    lookup: fluorophoreLookup(library),
  }
  configurationBases.set(cacheKey, base)
  return base
}

function validateRequestedFromBase(
  requestedFluorophores: string[],
  library: SpectralLibrary,
  base: PanelConfigurationBase,
): RequestedFluorophoreValidation {
  const accepted: string[] = []
  const diagnostics: RequestedFluorophoreDiagnostic[] = []
  const seen = new Map<string, string>()
  requestedFluorophores.forEach((requested) => {
    const libraryIndex = requestedLibraryIndex(requested, base)
    if (libraryIndex === undefined) {
      diagnostics.push({
        requested,
        canonicalFluorophore: null,
        status: 'unrecognized',
        reason: 'The fluorophore is not recognized by the bundled library.',
      })
      return
    }
    const canonicalFluorophore = library.fluorophores[libraryIndex]
    if (seen.has(canonicalFluorophore)) {
      diagnostics.push({
        requested,
        canonicalFluorophore,
        status: 'duplicate',
        reason: `This fluorophore duplicates "${seen.get(canonicalFluorophore)}".`,
      })
      return
    }
    seen.set(canonicalFluorophore, requested)
    if (base.retainedSignal[libraryIndex] < 0.02) {
      diagnostics.push({
        requested,
        canonicalFluorophore,
        status: 'unavailable',
        reason: 'The fluorophore has no retained signal in the selected configuration.',
      })
      return
    }
    accepted.push(canonicalFluorophore)
  })
  return { accepted, diagnostics }
}

export async function validateRequestedFluorophores(
  cytometer: unknown = 'aurora',
  configuration?: unknown,
  requestedFluorophores: string[] = [],
): Promise<RequestedFluorophoreValidation> {
  const id = resolveCytometer(cytometer)
  const config = resolveConfiguration(id, configuration)
  await initializeCytometer(id)
  const library = requireSpectralLibrary(libraries.get(id), id)
  return validateRequestedFromBase(
    requestedFluorophores.map((value) => value.trim()).filter(Boolean),
    library,
    configurationBase(id, config, library),
  )
}

export function requireSpectralLibrary(
  library: SpectralLibrary | undefined,
  cytometer: CytometerId,
): SpectralLibrary {
  if (!library) throw new Error(`Spectral library file is missing for cytometer '${cytometer}'.`)
  return library
}

function rememberPanelPayload(key: string, payload: PanelPayload): PanelPayload {
  panelPayloadCache.delete(key)
  panelPayloadCache.set(key, payload)
  if (panelPayloadCache.size > MAX_PANEL_PAYLOAD_CACHE) {
    panelPayloadCache.delete(panelPayloadCache.keys().next().value!)
  }
  return payload
}

/**
 * Build a payload for interactive editing or an import.
 *
 * Import callers must pass `rejectInvalidRequested: true` so unresolved,
 * unavailable, and duplicate requested fluorophores fail before a payload is
 * returned. The default is intentionally lenient for interactive recalculation
 * while a user changes cytometer or configuration.
 */
export async function buildPanelPayload(
  cytometer: unknown = 'aurora',
  configuration?: unknown,
  requestedFluorophores: string[] = [],
  rejectInvalidRequested = false,
): Promise<PanelPayload> {
  const id = resolveCytometer(cytometer)
  const config = resolveConfiguration(id, configuration)
  await initializeCytometer(id)
  const library = requireSpectralLibrary(libraries.get(id), id)
  const normalizedRequested = requestedFluorophores.map((value) => value.trim()).filter(Boolean)
  const uniqueRequested: string[] = []
  const seenRequested = new Set<string>()
  normalizedRequested.forEach((requested) => {
    const identity = fluorophoreIdentity(requested)
    if (seenRequested.has(identity)) return
    seenRequested.add(identity)
    uniqueRequested.push(requested)
  })
  const cacheRequested = rejectInvalidRequested
    ? normalizedRequested.map(fluorophoreIdentity)
    : uniqueRequested.map(fluorophoreIdentity)
  const payloadCacheKey = `${id}:${config}:${JSON.stringify(cacheRequested)}`
  const cachedPayload = panelPayloadCache.get(payloadCacheKey)
  if (cachedPayload && !rejectInvalidRequested) {
    return cachedPayload
  }
  const base = configurationBase(id, config, library)
  if (rejectInvalidRequested) {
    const validation = validateRequestedFromBase(
      normalizedRequested,
      library,
      base,
    )
    if (validation.diagnostics.length > 0) {
      throw new PanelSelectionValidationError(validation.diagnostics)
    }
  }
  if (cachedPayload) {
    panelPayloadCache.delete(payloadCacheKey)
    panelPayloadCache.set(payloadCacheKey, cachedPayload)
    return cachedPayload
  }

  const selectedLabels: string[] = []
  const selectedValues: number[][] = []
  uniqueRequested.forEach((requested) => {
    const libraryIndex = requestedLibraryIndex(requested, base)
    if (libraryIndex === undefined || base.retainedSignal[libraryIndex] < 0.02) return
    const values = base.normalizedRowsByLibraryIndex.get(libraryIndex)!
    selectedLabels.push(library.fluorophores[libraryIndex])
    selectedValues.push(values)
  })

  const similarityValues = calculateSimilarityMatrix(selectedValues)
  const similarity = namedRows(selectedLabels, selectedLabels, similarityValues)
  const peaks = selectedValues.map((row) => base.detectorInfo[row.reduce(
    (best, value, index, values) => value > values[best] ? index : best,
    0,
  )].detector)

  return rememberPanelPayload(payloadCacheKey, {
    cytometer: id,
    configuration: config,
    measurement_mode: LIBRARIES.find((libraryInfo) => libraryInfo.id === id)!.measurement_mode,
    response_provenance: library.response_provenance,
    libraries: LIBRARIES,
    configurations: CONFIGURATIONS[id],
    detectors: base.detectorInfo,
    fluorophores: base.fluorophores,
    selected: selectedLabels,
    spectra: namedRows(selectedLabels, base.detectorInfo.map((detector) => detector.detector), selectedValues),
    similarity,
    complexity_index: calculatePanelComplexity(selectedValues),
    peak_detectors: peaks,
    max_panel_size: base.detectorInfo.length,
  })
}

export function resetSpectralEngineForTests(): void {
  dictionaryInitialization = null
  libraries.clear()
  libraryInitializations.clear()
  configurationBases.clear()
  panelPayloadCache.clear()
  cytometerDictionary = []
  fluorophoreDictionary = []
  conventionalDetectorDictionary = []
  conventionalFluorophoreEstimateDictionary = []
}
