import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = new Map()
for (let index = 2; index < process.argv.length; index += 1) {
  const value = process.argv[index]
  if (!value.startsWith('--')) continue
  const [key, inlineValue] = value.slice(2).split('=', 2)
  args.set(key, inlineValue ?? process.argv[++index])
}

const mode = args.get('mode') ?? 'part'
const start = Number(args.get('start') ?? 0)
const end = Number(args.get('end') ?? 113)
const part = String(args.get('part') ?? '01').padStart(2, '0')

if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start) {
  throw new Error('Use positive integer --start and --end bounds.')
}

const catalogSource = fs.readFileSync(path.join(root, 'src/omipCatalog.ts'), 'utf8')
const catalogRecords = [...catalogSource.matchAll(
  /\[(\d+),\s*'([^']+)',\s*'([^']+)',\s*'((?:[^'\\]|\\.)*)'\]/g,
)].map(([, number, pmid, year, title]) => ({
  number: Number(number),
  pmid,
  year,
  title,
}))

const nonFlowOmipNumbers = new Set([121, 103, 88, 87, 54, 48, 45, 34])
const flowRecords = catalogRecords.filter(({ number }) => !nonFlowOmipNumbers.has(number))
const flowNumbers = flowRecords.map(({ number }) => number)

const manualRows = {
  84: [
    ['CCR5', 'BUV395'],
    ['CD16', 'BUV496'],
    ['CD56', 'BUV563'],
    ['TCR Vα7.2', 'BUV615'],
    ['CD3', 'BUV661'],
    ['CD69', 'BUV737'],
    ['CD8', 'BUV805'],
    ['CXCR6', 'BV421'],
    ['CD57', 'PB'],
    ['CX3CR1', 'BV480'],
    ['Vδ1', 'VioGreen'],
    ['CD4', 'BV570'],
    ['CD45RA', 'BV605'],
    ['CD127', 'BV650'],
    ['PD1', 'BV711'],
    ['CCR6', 'BV785'],
    ['Vγ9', 'FITC'],
    ['Vδ2', 'PerCP-Vio700'],
    ['γδ TCR', 'PE'],
    ['NKG2A', 'PE-Vio615'],
    ['CD25', 'PE-Fire700'],
    ['NKG2D', 'PE-Cy7'],
    ['Vδ3', 'APC'],
    ['CD28', 'AF647'],
    ['CD27', 'AF700'],
    ['Viability (Amine-reactive)', 'Zombie NIR'],
    ['CD161', 'APC-Cy7'],
    ['CD38', 'APC-Fire810'],
  ],
  91: [
    ['CD3', 'BUV395'],
    ['CD4', 'BUV496'],
    ['PD-1', 'BUV615'],
    ['CD69', 'BUV737'],
    ['CXCR5', 'BUV805'],
    ['CD154', 'BV421'],
    ['Granzyme-B', 'Pacific Blue'],
    ['Vδ2', 'BV480'],
    ['IL-17A', 'BV510'],
    ['CCR4', 'BV605'],
    ['CCR6', 'BV650'],
    ['Vα7.2', 'BV711'],
    ['CD8', 'BV750'],
    ['TNF', 'BV785'],
    ['γδTCR', 'FITC'],
    ['IL-2', 'PerCP'],
    ['CD45RA', 'PerCP-Cy5.5'],
    ['IFN-γ', 'PE'],
    ['CD25', 'PE-CF594'],
    ['OX-40', 'PE-Cy5'],
    ['CD161', 'PE-Vio770'],
    ['CCR7', 'PE-Fire810'],
    ['CXCR3', 'APC'],
    ['CD137', 'AF647'],
    ['CD127', 'APC-R700'],
    ['Viability', 'Zombie NIR'],
    ['Perforin', 'APC-Cy7'],
  ],
}

const spectralCytometerFallbacks = {
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

const htmlEntities = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"',
  alpha: 'α',
  beta: 'β',
  gamma: 'γ',
  delta: 'δ',
  epsilon: 'ε',
  mu: 'μ',
  micro: 'µ',
  minus: '−',
}

function decodeHtml(value) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
    if (entity.startsWith('#x')) return String.fromCodePoint(Number.parseInt(entity.slice(2), 16))
    if (entity.startsWith('#')) return String.fromCodePoint(Number(entity.slice(1)))
    return htmlEntities[entity.toLocaleLowerCase()] ?? match
  })
}

function stripHtml(value) {
  return decodeHtml(value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim())
}

function decodeJavaScriptHtml(value) {
  return value
    .replace(/\\\//g, '/')
    .replace(/\\"/g, '"')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
}

function parseCsvLine(line) {
  const cells = []
  let cell = ''
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        cell += '"'
        index += 1
      } else {
        quoted = !quoted
      }
    } else if (character === ',' && !quoted) {
      cells.push(cell)
      cell = ''
    } else {
      cell += character
    }
  }
  cells.push(cell)
  return cells
}

function normalize(value) {
  return value.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, '')
}

function buildFluorophoreAliases() {
  const csv = fs.readFileSync(path.join(root, 'public/data/fluorophore_dictionary.csv'), 'utf8')
  const [header, ...lines] = csv.trim().split(/\r?\n/).map(parseCsvLine)
  const fluorophoreIndex = header.indexOf('fluorophore')
  const aliasesIndex = header.indexOf('aliases')
  const aliases = new Map()
  lines.forEach((cells) => {
    const fluorophore = cells[fluorophoreIndex]?.trim()
    if (!fluorophore) return
    for (const value of [fluorophore, ...(cells[aliasesIndex] ?? '').split(';')]) {
      const key = normalize(value)
      if (key && !aliases.has(key)) aliases.set(key, fluorophore)
    }
  })
  const overrides = {
    brilliantblue630p2: 'BB630',
    brilliantblue660p2: 'BB660',
    brilliantblue755p: 'BB755',
    brilliantblue790p: 'BB790',
    livedeadfixaqua: 'LIVE/DEAD Aqua',
    livedeadfixblue: 'Live-Dead Blue',
    livedeadfixviolet: 'LIVE DEAD Violet',
    livedeadfixnearir775: 'LIVE DEAD NIR',
    livedeadnearir775: 'LIVE DEAD NIR',
    apcalexa700: 'APC-Alexa Fluor 700',
    apcalexafluor700: 'APC-Alexa Fluor 700',
    pealexa610: 'PE-Alexa Fluor 610',
    pealexa700: 'PE-Alexa Fluor 700',
    fvs440uv: 'FSV440UV',
    fvs700: 'FSV700',
    efluor780fixviability: 'eFluor 780',
    pb: 'Pacific Blue',
    af647: 'Alexa Fluor 647',
    ax647: 'Alexa Fluor 647',
    af700: 'Alexa Fluor 700',
    ax700: 'Alexa Fluor 700',
    pefire700: 'PE-Fire 700',
    pefire810: 'PE-Fire 810',
    pevio615: 'PE-Vio615',
    pevio770: 'PE-Vio770',
    percpvio700: 'PerCP-Vio700',
    zombienir: 'Zombie NIR',
  }
  return { aliases, overrides }
}

const fluorophoreAliases = buildFluorophoreAliases()

function canonicalizeFluorophore(value) {
  const cleanValue = value.trim()
  if (!cleanValue) return undefined
  const key = normalize(cleanValue)
  return fluorophoreAliases.overrides[key] ?? fluorophoreAliases.aliases.get(key) ?? cleanValue
}

function canonicalizeMachine(number, machine) {
  if (spectralCytometerFallbacks[number]) return spectralCytometerFallbacks[number]
  const cleanMachine = machine?.trim()
  if (!cleanMachine) return ['Not reported in registry']
  if (/^aurora\s+5\s*laser$/i.test(cleanMachine)) return ['Cytek Aurora 5L (UV-V-B-YG-R)']
  if (/^aurora\b/i.test(cleanMachine)) return [`Cytek ${cleanMachine}`]
  if (/^northern lights\b/i.test(cleanMachine)) return [`Cytek ${cleanMachine}`]
  if (/^id7000\b/i.test(cleanMachine)) return [`Sony ${cleanMachine}`]
  if (/^facs\s+symphony\b/i.test(cleanMachine)) {
    const suffix = cleanMachine.replace(/^facs\s+symphony\b/i, '').trim()
    return [`BD FACSymphony${suffix ? ` ${suffix}` : ''}`]
  }
  if (/^(facsymphony|facsdiscover|facsaria)\b/i.test(cleanMachine)) return [`BD ${cleanMachine}`]
  if (/^lsr\s*ii$/i.test(cleanMachine)) return ['BD LSR II']
  if (/^lsr2\b/i.test(cleanMachine)) return [`BD LSR II${cleanMachine.slice(4)}`]
  if (/^sorp\s+bd\s+lsr\s*2$/i.test(cleanMachine)) return ['BD LSR II SORP']
  if (/^lsr\s+fortessa\b/i.test(cleanMachine)) return [`BD ${cleanMachine}`]
  if (/^navios\b/i.test(cleanMachine)) return [`Beckman Coulter ${cleanMachine}`]
  if (/^cytoflex\b/i.test(cleanMachine)) return [`Beckman Coulter ${cleanMachine}`]
  if (/^bd\b/i.test(cleanMachine) || /^beckman\b/i.test(cleanMachine)) return [cleanMachine]
  return [cleanMachine]
}

async function loadPageDirectory() {
  const response = await fetch('https://admin.fluorofinder.com/omips', {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  })
  if (!response.ok) throw new Error(`FluoroFinder directory returned HTTP ${response.status}`)
  const html = await response.text()
  return new Map([...html.matchAll(
    /<option[^>]+value="(\d+)"[^>]*>\s*OMIP-(\d+)/gi,
  )].map(([, page, number]) => [Number(number), Number(page)]))
}

async function loadOmipPage(number, pageByNumber) {
  if (manualRows[number]) {
    return {
      page: pageByNumber.get(number),
      rows: manualRows[number],
      machine: 'Cytek Aurora 5L (UV-V-B-YG-R)',
      sourceUrl: number === 84
        ? 'https://onlinelibrary.wiley.com/doi/10.1002/cyto.a.24564'
        : 'https://onlinelibrary.wiley.com/doi/10.1002/cyto.a.24738',
    }
  }
  const page = pageByNumber.get(number)
  if (!page) throw new Error(`No FluoroFinder page ID found for OMIP-${String(number).padStart(3, '0')}`)
  const response = await fetch(`https://app.fluorofinder.com/omips/${page}.js`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140 Safari/537.36',
      'X-Requested-With': 'XMLHttpRequest',
      'Accept': 'text/javascript, */*; q=0.01',
    },
  })
  if (!response.ok) throw new Error(`FluoroFinder OMIP-${number} returned HTTP ${response.status}`)
  const html = decodeJavaScriptHtml(await response.text())
  const table = html.match(/<table\b[^>]*>[\s\S]*?<\/table>/i)?.[0] ?? ''
  const rows = [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map(([, row]) => [...row.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)]
      .map(([, cell]) => stripHtml(cell)))
    .filter((cells) => cells.length >= 4 && cells[0].trim() && cells[0].toLocaleLowerCase() !== 'marker')
    .map((cells) => [cells[0], cells[3]])
  if (rows.length === 0) throw new Error(`No panel table found for OMIP-${number} at page ${page}`)
  const machine = html.match(/<strong[^>]*>Machine:<\/strong>\s*([^<]*)/i)?.[1]
  return {
    page,
    rows,
    machine: stripHtml(machine ?? ''),
    sourceUrl: `https://app.fluorofinder.com/omips/${page}`,
  }
}

function quoted(value) {
  return JSON.stringify(value)
}

function patchForFile(file, lines) {
  return [
    '*** Begin Patch',
    `*** Add File: ${file}`,
    ...lines.flatMap((line) => line.split('\n').map((partLine) => `+${partLine}`)),
    '*** End Patch',
  ].join('\n')
}

async function loadSelectedRows(pageByNumber) {
  const records = flowRecords.slice(start, end)
  if (records.length === 0) throw new Error(`No flow OMIPs in slice ${start}:${end}`)
  const loaded = await Promise.all(records.map(({ number }) => loadOmipPage(number, pageByNumber)))
  return records.map(({ number }, index) => ({ number, ...loaded[index] }))
}

async function emitPart(pageByNumber) {
  const rows = await loadSelectedRows(pageByNumber)
  const lines = [
    '// Generated by tools/import-omip-flow-tables.mjs from public OMIP tables.',
    `export const FLOW_OMIP_TEMPLATE_ROWS_PART_${part} = {`,
  ]
  rows.forEach(({ number, rows: markerRows }) => {
    lines.push(`  ${number}: [`)
    markerRows.forEach(([marker, fluorophore]) => {
      const canonicalFluorophore = canonicalizeFluorophore(fluorophore)
      lines.push(`    [${quoted(marker)}${canonicalFluorophore ? `, ${quoted(canonicalFluorophore)}` : ''}],`)
    })
    lines.push('  ],')
  })
  lines.push('} as const')
  process.stdout.write(patchForFile(`src/omipFlowTemplateData.part${part}.ts`, lines))
}

async function emitMetadata(pageByNumber) {
  const loaded = await Promise.all(flowRecords.map(({ number }) => loadOmipPage(number, pageByNumber)))
  const sourcePageIds = Object.fromEntries(flowRecords.map(({ number }, index) => [number, loaded[index].page]))
  const sourceUrls = Object.fromEntries(flowRecords.map(({ number }, index) => [number, loaded[index].sourceUrl]))
  const cytometers = Object.fromEntries(flowRecords.map(({ number }, index) => [
    number,
    canonicalizeMachine(number, loaded[index].machine),
  ]))
  const markerRowCount = loaded.reduce((total, { rows }) => total + rows.length, 0)
  const lines = [
    '// Generated by tools/import-omip-flow-tables.mjs from public OMIP tables.',
    `export const FLOW_OMIP_SOURCE_PAGE_IDS = ${JSON.stringify(sourcePageIds, null, 2)} as const`,
    `export const FLOW_OMIP_TABLE_SOURCE_URLS = ${JSON.stringify(sourceUrls, null, 2)} as const`,
    `export const FLOW_OMIP_CYTOMETERS = ${JSON.stringify(cytometers, null, 2)} as const`,
    'export const FLOW_OMIP_IMPORT_MANIFEST = {',
    `  flowOmipCount: ${flowRecords.length},`,
    `  markerRowCount: ${markerRowCount},`,
    `  sourceDirectory: ${quoted('https://admin.fluorofinder.com/omips')},`,
    `  importedAt: ${quoted(new Date().toISOString().slice(0, 10))},`,
    '} as const',
  ]
  process.stdout.write(patchForFile('src/omipFlowTemplateData.meta.ts', lines))
}

const pageByNumber = await loadPageDirectory()
if (flowNumbers.length !== 113) throw new Error(`Expected 113 flow OMIPs, found ${flowNumbers.length}`)
if (mode === 'metadata') {
  await emitMetadata(pageByNumber)
} else {
  await emitPart(pageByNumber)
}
