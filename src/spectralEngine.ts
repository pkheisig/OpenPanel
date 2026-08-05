import { Matrix, SingularValueDecomposition } from 'ml-matrix'
import { canonicalizeFluorophoreName } from './fluorophoreNames'
import type {
  ConfigurationInfo,
  DetectorInfo,
  FluorInfo,
  LibraryInfo,
  NumericRow,
  PanelPayload,
} from './panelBuilderShared'

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

type FluorophoreMapping = {
  confidence: 'curated' | 'estimated'
  source?: string
  note?: string
}

type SpectralLibrary = {
  detectors: string[]
  fluorophores: string[]
  values: number[][]
  fluorophoreMappings?: Map<string, FluorophoreMapping>
}

const LIBRARIES: LibraryInfo[] = [
  { id: 'aurora', label: 'Cytek Aurora', measurement_mode: 'spectral' },
  { id: 'discover', label: 'BD FACSDiscover', measurement_mode: 'spectral' },
  { id: 'id7000', label: 'Sony ID7000', measurement_mode: 'spectral' },
  { id: 'xenith', label: 'Thermo Fisher Attune Xenith', measurement_mode: 'spectral' },
  { id: 'symphony', label: 'BD FACSymphony A5 SE', measurement_mode: 'conventional' },
  { id: 'fortessa', label: 'BD LSRFortessa', measurement_mode: 'conventional' },
  { id: 'celesta', label: 'BD FACSCelesta', measurement_mode: 'conventional' },
  { id: 'attune_nxt', label: 'Thermo Fisher Attune NxT', measurement_mode: 'conventional' },
  { id: 'accuri_c6_plus', label: 'BD Accuri C6 Plus', measurement_mode: 'conventional' },
  { id: 'facscalibur', label: 'BD FACSCalibur', measurement_mode: 'conventional' },
  { id: 'canto', label: 'BD FACSCanto II', measurement_mode: 'conventional' },
  { id: 'lyric', label: 'BD FACSLyric', measurement_mode: 'conventional' },
  { id: 'ze5', label: 'Bio-Rad ZE5', measurement_mode: 'conventional' },
  { id: 'cytpix', label: 'Thermo Fisher Attune CytPix', measurement_mode: 'conventional' },
  { id: 'quanteon', label: 'Agilent NovoCyte Quanteon', measurement_mode: 'conventional' },
  { id: 'macsquant', label: 'Miltenyi MACSQuant', measurement_mode: 'conventional' },
  { id: 'facsverse', label: 'BD FACSVerse', measurement_mode: 'conventional' },
  { id: 'lsrii', label: 'BD LSR II', measurement_mode: 'conventional' },
  { id: 'cytoflex_lx', label: 'Beckman Coulter CytoFLEX LX', measurement_mode: 'conventional' },
  { id: 'navios', label: 'Beckman Coulter Navios', measurement_mode: 'conventional' },
  { id: 'dxflex', label: 'Beckman Coulter DxFLEX', measurement_mode: 'conventional' },
  { id: 'facsaria_fusion', label: 'BD FACSAria Fusion', measurement_mode: 'conventional' },
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

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    const next = text[index + 1]
    if (character === '"') {
      if (quoted && next === '"') {
        cell += '"'
        index += 1
      } else {
        quoted = !quoted
      }
    } else if (character === ',' && !quoted) {
      row.push(cell)
      cell = ''
    } else if ((character === '\n' || character === '\r') && !quoted) {
      row.push(cell)
      cell = ''
      if (row.some((value) => value.length > 0)) rows.push(row)
      row = []
      if (character === '\r' && next === '\n') index += 1
    } else {
      cell += character
    }
  }
  row.push(cell)
  if (row.some((value) => value.length > 0)) rows.push(row)
  if (rows[0]?.[0]) rows[0][0] = rows[0][0].replace(/^\uFEFF/, '')
  return rows
}

function rowsToObjects(rows: string[][]): CsvRow[] {
  const headers = rows[0] ?? []
  return rows.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])))
}

function dataUrl(filename: string): string {
  const origin = typeof window === 'undefined' ? 'http://localhost' : window.location.origin
  return new URL(`data/${filename}`, new URL(import.meta.env.BASE_URL, origin)).toString()
}

async function loadCsv(filename: string): Promise<string[][]> {
  const response = await fetch(dataUrl(filename))
  if (!response.ok) throw new Error(`Could not load bundled data file ${filename} (${response.status}).`)
  return parseCsv(await response.text())
}

function parseLibrary(rows: string[][]): SpectralLibrary {
  const headers = rows[0] ?? []
  if (headers.length < 2) throw new Error('A bundled spectral library has no detector columns.')
  const detectors = headers.slice(1)
  const seen = new Set<string>()
  const fluorophores: string[] = []
  const values: number[][] = []

  rows.slice(1).forEach((row) => {
    const fluorophore = canonicalizeFluorophoreName((row[0] ?? '').trim())
    if (!fluorophore || seen.has(fluorophore)) return
    seen.add(fluorophore)
    fluorophores.push(fluorophore)
    values.push(detectors.map((_, index) => {
      const value = Number(row[index + 1])
      return Number.isFinite(value) ? value : 0
    }))
  })
  return { detectors, fluorophores, values }
}

function uniqueValues(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)))
}

function initializeDictionaries(): Promise<void> {
  if (dictionaryInitialization) return dictionaryInitialization
  dictionaryInitialization = Promise.all([
    loadCsv('cytometer_dictionary.csv'),
    loadCsv('fluorophore_dictionary.csv'),
    loadCsv('conventional_detector_dictionary.csv'),
    loadCsv('conventional_fluorophore_estimates.csv'),
  ]).then(([cytometers, fluorophores, conventionalDetectors, conventionalEstimates]) => {
    cytometerDictionary = rowsToObjects(cytometers)
    fluorophoreDictionary = rowsToObjects(fluorophores)
    conventionalDetectorDictionary = rowsToObjects(conventionalDetectors)
    conventionalFluorophoreEstimateDictionary = rowsToObjects(conventionalEstimates)
  })
  return dictionaryInitialization
}

function initializeLibrary(cytometer: CytometerId): Promise<void> {
  const existing = libraryInitializations.get(cytometer)
  if (existing) return existing
  const pending = CONVENTIONAL_CYTOMETERS.has(cytometer)
    ? initializeDictionaries().then(() => {
      libraries.set(cytometer, buildConventionalLibrary(cytometer))
    })
    : loadCsv(LIBRARY_FILES[cytometer] ?? '').then((rows) => {
      libraries.set(cytometer, parseLibrary(rows))
    })
  libraryInitializations.set(cytometer, pending)
  return pending
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

function normalizeLaserName(value: unknown): string {
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

function normalizeDetectorToken(value: unknown): string {
  return String(value ?? '').trim().toUpperCase().replace(/\s+/g, '').replace(/([A-Z]+)-([0-9])/g, '$1$2')
}

function detectorKeys(detector: string): string[] {
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

export function resolveConfiguration(cytometer: unknown, value?: unknown): string {
  const id = resolveCytometer(cytometer)
  const configs = CONFIGURATIONS[id]
  const key = normalizeToken(value)
  if (!key) return configs[0].id
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
  return configs.some((config) => config.id === alias) ? alias : configs[0].id
}

function dictionaryCandidates(cytometer: CytometerId): CsvRow[] {
  const ids = cytometer === 'discover'
    ? new Set(['discover', 'discover_s8', 'discover_a8'])
    : cytometer === 'symphony'
      ? new Set(['symphony', 'a5se'])
      : new Set([cytometer])
  if (CONVENTIONAL_CYTOMETERS.has(cytometer)) {
    return conventionalDetectorDictionary.filter((row) => row.cytometer === cytometer)
  }
  return cytometerDictionary.filter((row) => ids.has(row.cytometer))
}

function matchingDictionaryRow(cytometer: CytometerId, detector: string): CsvRow | undefined {
  const requested = new Set(detectorKeys(detector))
  return dictionaryCandidates(cytometer).find((row) => detectorKeys(row.detector ?? '').some((key) => requested.has(key)))
}

function detectorLaser(cytometer: CytometerId, detector: string): string {
  const dictionaryLaser = matchingDictionaryRow(cytometer, detector)?.laser
  if (dictionaryLaser) return dictionaryLaser
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

function id7000Emission(detector: string): number | null {
  const match = detector.trim().toUpperCase().replace(/-A$/, '').match(/^(320|355|405|488|561|637|808)CH(\d+)$/)
  if (!match) return null
  const startChannel: Record<string, number> = { 320: 1, 355: 1, 405: 1, 488: 4, 561: 10, 637: 17, 808: 36 }
  const startEmission: Record<string, number> = { 320: 350, 355: 370, 405: 420, 488: 500, 561: 570, 637: 660, 808: 810 }
  return startEmission[match[1]] + (Number(match[2]) - startChannel[match[1]]) * 15
}

function detectorEmission(cytometer: CytometerId, detector: string): number {
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

function detectorFilter(cytometer: CytometerId, detector: string): DetectorFilter | null {
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
  fluorophoreDictionary.forEach((row) => {
    const canonical = canonicalizeFluorophoreName((row.fluorophore ?? '').trim())
    if (!canonical) return
    const aliases = [row.fluorophore, ...(row.aliases ?? '').split(';')]
    aliases.forEach((alias) => {
      const key = normalizeToken(alias)
      if (key && !lookup.has(key)) lookup.set(key, canonical)
    })
  })
  return lookup
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

function approximateDetectorResponse(emission: number, filter: DetectorFilter): number {
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

function ninePointBandpass(center: number, width: number): number[] {
  return Array.from({ length: 9 }, (_, index) => center - width / 2 + ((index + 0.5) / 9) * width)
}

function buildConventionalLibrary(cytometer: CytometerId): SpectralLibrary {
  const rows = conventionalDetectorDictionary.filter((row) => row.cytometer === cytometer)
  const detectors = uniqueValues(rows.filter((row) => row.is_scatter?.toUpperCase() !== 'TRUE').map((row) => row.detector))
  if (detectors.length === 0) throw new Error(`No conventional detector reference data is available for cytometer '${cytometer}'.`)

  const canonicalLookup = fluorophoreCanonicalLookup()
  const wavelengths = conventionalFluorophoreWavelengths()
  const specifications = new Map<string, {
    lasers: Set<string>
    preferredDetector: string
    mapping: FluorophoreMapping
  }>()
  rows.forEach((row) => {
    if (row.is_scatter?.toUpperCase() === 'TRUE') return
    const names = (row.common_fluorophores ?? '').split(';').map((name) => name.trim()).filter(Boolean)
    names.forEach((name) => {
      const canonical = canonicalLookup.get(normalizeToken(name)) ?? canonicalizeFluorophoreName(name)
      if (!canonical || normalizeToken(canonical) === 'ssc') return
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
    const canonical = canonicalLookup.get(normalizeToken(row.fluorophore))
    if (canonical) fluorophoreRows.set(canonical, row)
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
      const preferredIndex = detectors.indexOf(specification.preferredDetector)
      if (preferredIndex >= 0) row[preferredIndex] = 1
    }
    return { fluorophore, row }
  })

  return {
    detectors,
    fluorophores: values.map(({ fluorophore }) => fluorophore),
    values: values.map(({ row }) => row),
    fluorophoreMappings: new Map(Array.from(specifications.entries()).map(([fluorophore, specification]) => [
      fluorophore,
      specification.mapping,
    ])),
  }
}

function normalizeRow(values: number[]): number[] {
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
    ? metadata.filter((detector) => requestedDetectors.includes(detector.detector))
    : requestedLasers
      ? metadata.filter((detector) => requestedLasers.includes(detector.laser))
      : metadata
  const indexByDetector = new Map(library.detectors.map((detector, index) => [detector, index]))
  return included.map((detector) => indexByDetector.get(detector.detector)).filter((index): index is number => index !== undefined)
}

function fluorophoreLookup(library: SpectralLibrary): Map<string, number> {
  const lookup = new Map<string, number>()
  library.fluorophores.forEach((fluorophore, index) => lookup.set(normalizeToken(fluorophore), index))
  fluorophoreDictionary.forEach((row) => {
    const canonicalIndex = lookup.get(normalizeToken(row.fluorophore))
    if (canonicalIndex === undefined) return
    const aliases = [row.fluorophore, ...(row.aliases ?? '').split(';')]
    aliases.forEach((alias) => {
      const key = normalizeToken(alias)
      if (key && !lookup.has(key)) lookup.set(key, canonicalIndex)
    })
  })
  return lookup
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
  const outputIndices = detectorInfo.map((detector) => detectorIndices[sortedDetectorIndex.get(detector.detector) ?? 0])
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
    const row = normalizedRowsByLibraryIndex.get(libraryIndex) ?? []
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

function rememberPanelPayload(key: string, payload: PanelPayload): PanelPayload {
  panelPayloadCache.delete(key)
  panelPayloadCache.set(key, payload)
  if (panelPayloadCache.size > MAX_PANEL_PAYLOAD_CACHE) {
    const oldestKey = panelPayloadCache.keys().next().value
    if (oldestKey !== undefined) panelPayloadCache.delete(oldestKey)
  }
  return payload
}

export async function buildPanelPayload(
  cytometer: unknown = 'aurora',
  configuration?: unknown,
  requestedFluorophores: string[] = [],
): Promise<PanelPayload> {
  const id = resolveCytometer(cytometer)
  const config = resolveConfiguration(id, configuration)
  await initializeCytometer(id)
  const library = libraries.get(id)
  if (!library) throw new Error(`Spectral library file is missing for cytometer '${id}'.`)
  const uniqueRequested = Array.from(new Set(requestedFluorophores.map((value) => value.trim()).filter(Boolean)))
  const payloadCacheKey = `${id}:${config}:${uniqueRequested.join('\u0000')}`
  const cachedPayload = panelPayloadCache.get(payloadCacheKey)
  if (cachedPayload) {
    panelPayloadCache.delete(payloadCacheKey)
    panelPayloadCache.set(payloadCacheKey, cachedPayload)
    return cachedPayload
  }

  const base = configurationBase(id, config, library)
  const selectedLabels: string[] = []
  const selectedValues: number[][] = []
  uniqueRequested.forEach((requested) => {
    const libraryIndex = base.lookup.get(normalizeToken(requested))
    if (libraryIndex === undefined || base.retainedSignal[libraryIndex] < 0.02) return
    const values = base.normalizedRowsByLibraryIndex.get(libraryIndex)
    if (!values) return
    selectedLabels.push(requested)
    selectedValues.push(values)
  })

  const similarityValues = calculateSimilarityMatrix(selectedValues)
  const similarity = namedRows(selectedLabels, selectedLabels, similarityValues)
  const peaks = selectedValues.map((row) => base.detectorInfo[row.reduce(
    (best, value, index, values) => value > values[best] ? index : best,
    0,
  )]?.detector ?? '')

  return rememberPanelPayload(payloadCacheKey, {
    cytometer: id,
    configuration: config,
    measurement_mode: LIBRARIES.find((libraryInfo) => libraryInfo.id === id)?.measurement_mode ?? 'spectral',
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
