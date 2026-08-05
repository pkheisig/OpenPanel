import { FLOW_OMIP_TEMPLATE_ROWS_PART_01 } from './omipFlowTemplateData.part01'
import { FLOW_OMIP_TEMPLATE_ROWS_PART_02 } from './omipFlowTemplateData.part02'
import { FLOW_OMIP_TEMPLATE_ROWS_PART_03 } from './omipFlowTemplateData.part03'
import { FLOW_OMIP_TEMPLATE_ROWS_PART_04 } from './omipFlowTemplateData.part04'
import { FLOW_OMIP_TEMPLATE_ROWS_PART_05 } from './omipFlowTemplateData.part05'
import { FLOW_OMIP_TEMPLATE_ROWS_PART_06 } from './omipFlowTemplateData.part06'

export {
  FLOW_OMIP_CYTOMETERS,
  FLOW_OMIP_IMPORT_MANIFEST,
  FLOW_OMIP_SOURCE_PAGE_IDS,
  FLOW_OMIP_TABLE_SOURCE_URLS,
} from './omipFlowTemplateData.meta'

export type ImportedOmipTemplateRow = readonly [
  marker: string,
  fluorophore?: string,
]

export const FLOW_OMIP_TEMPLATE_ROWS = {
  ...FLOW_OMIP_TEMPLATE_ROWS_PART_01,
  ...FLOW_OMIP_TEMPLATE_ROWS_PART_02,
  ...FLOW_OMIP_TEMPLATE_ROWS_PART_03,
  ...FLOW_OMIP_TEMPLATE_ROWS_PART_04,
  ...FLOW_OMIP_TEMPLATE_ROWS_PART_05,
  ...FLOW_OMIP_TEMPLATE_ROWS_PART_06,
} as const satisfies Readonly<Record<number, readonly ImportedOmipTemplateRow[]>>
