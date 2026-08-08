export type CytometerIdentity = {
  family: string
  label: string
  configurationTokens: ReadonlySet<string>
}

function cleanText(value: string): string {
  return value
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

function compactText(value: string): string {
  return cleanText(value).toLocaleLowerCase().replace(/[^a-z0-9]+/g, '')
}

function familyFor(value: string): string {
  const normalized = compactText(value)
  if (normalized.includes('facsariafusion') || normalized.includes('ariafusion')) return 'facsaria-fusion'
  if (normalized.includes('northernlights')) return 'northern-lights'
  if (normalized.includes('aurora')) return 'aurora'
  if (normalized.includes('id7000')) return 'id7000'
  if (normalized.includes('facsdiscover')) return 'facsdiscover'
  if (normalized.includes('facsymphony')) return 'facsymphony'
  if (normalized.includes('fortessa')) return normalized.includes('x20') ? 'fortessa-x20' : 'fortessa'
  if (normalized.includes('xenith')) return 'xenith'
  if (normalized.includes('facscelesta') || normalized.includes('celesta')) return 'celesta'
  if (normalized.includes('attunecytpix') || normalized.includes('cytpix')) return 'cytpix'
  if (normalized.includes('attunenxt') || normalized.includes('attune')) return 'attune-nxt'
  if (normalized.includes('accuri')) return 'accuri-c6-plus'
  if (normalized.includes('facscalibur') || normalized.includes('calibur')) return 'facscalibur'
  if (normalized.includes('facscanto') || normalized.includes('canto')) return 'canto'
  if (normalized.includes('facslyric') || normalized.includes('lyric')) return 'lyric'
  if (normalized.includes('ze5')) return 'ze5'
  if (normalized.includes('quanteon') || normalized.includes('novocyte')) return 'quanteon'
  if (normalized.includes('macsquant')) return 'macsquant'
  if (normalized.includes('facsverse')) return 'facsverse'
  if (normalized.includes('lsrii') || normalized.includes('lsr2')) return 'lsrii'
  if (normalized.includes('cytoflex')) {
    if (normalized.includes('cytoflexlx')) return 'cytoflex-lx'
    if (normalized.includes('cytoflexs')) return 'cytoflex-s'
    return 'cytoflex'
  }
  if (normalized.includes('navios')) return 'navios'
  if (normalized.includes('dxflex')) return 'dxflex'
  return normalized || 'unknown'
}

export function baseLabel(family: string, value: string): string {
  const labels: Record<string, string> = {
    'facsaria-fusion': 'BD FACSAria Fusion',
    'northern-lights': 'Cytek Northern Lights',
    aurora: 'Cytek Aurora',
    id7000: 'Sony ID7000',
    facsdiscover: 'BD FACSDiscover',
    facsymphony: 'BD FACSymphony',
    fortessa: 'BD LSRFortessa',
    'fortessa-x20': 'BD LSRFortessa X-20',
    xenith: 'Thermo Fisher Attune Xenith',
    celesta: 'BD FACSCelesta',
    'attune-nxt': 'Thermo Fisher Attune NxT',
    'accuri-c6-plus': 'BD Accuri C6 Plus',
    facscalibur: 'BD FACSCalibur',
    canto: 'BD FACSCanto II',
    lyric: 'BD FACSLyric',
    ze5: 'Bio-Rad ZE5',
    cytpix: 'Thermo Fisher Attune CytPix',
    quanteon: 'Agilent NovoCyte Quanteon',
    macsquant: 'Miltenyi MACSQuant',
    facsverse: 'BD FACSVerse',
    lsrii: 'BD LSR II',
    'cytoflex-lx': 'Beckman Coulter CytoFLEX LX',
    'cytoflex-s': 'Beckman Coulter CytoFLEX S',
    navios: 'Beckman Coulter Navios',
    dxflex: 'Beckman Coulter DxFLEX',
  }
  if (family === 'cytoflex') return 'Beckman Coulter CytoFLEX'
  return labels[family] ?? cleanText(value)
}

function laserCount(value: string): string | null {
  const match = cleanText(value).match(/\b([1-7])\s*(?:l|laser|lasers)\b/i)
  return match ? `${match[1]}L` : null
}

function normalizedLaserSequence(value: string): string | null {
  const normalized = cleanText(value)
    .replace(/\bultraviolet\b/gi, 'UV')
    .replace(/\bblue\b/gi, 'B')
    .replace(/\bviolet\b/gi, 'V')
    .replace(/\byellow[\s-]*green\b/gi, 'YG')
    .replace(/\binfrared\b/gi, 'IR')
    .replace(/\bred\b/gi, 'R')
  const match = normalized.match(
    /\b(?:UV|V|B|YG|Y|R|IR)(?:\s*[-/]\s*(?:UV|V|B|YG|Y|R|IR)){2,}\b/i,
  )?.[0]
  return match?.replace(/\s+/g, '').replace(/-/g, '/').toUpperCase() ?? null
}

function normalizedLayout(value: string): string | null {
  const parenthetical = cleanText(value).match(/\(([^)]+)\)/)?.[1]?.trim()
  const parentheticalLayout = parenthetical ? normalizedLaserSequence(parenthetical) : null
  if (parentheticalLayout) return parentheticalLayout
  const layout = cleanText(value).match(
    /(?:\d+\s*)?(?:UV|V|B|YG|Y|R|IR)\s*\d+(?:[-/]\s*(?:\d+\s*)?(?:UV|V|B|YG|Y|R|IR)\s*\d+){2,}/i,
  )?.[0]
  return layout?.replace(/\s+/g, '').toUpperCase() ?? normalizedLaserSequence(value)
}

export function normalizedChannelLayout(value: string): string | null {
  const clean = cleanText(value)
  const numericLayouts = [...clean.matchAll(/\b\d+(?:\s*[-/]\s*\d+)+\b/g)]
    .map(([layout]) => layout.replace(/\s+/g, ''))
  const colorPairs = [...clean.matchAll(
    /\b(\d+)\s*-\s*(?:blue|violet|yellow[\s-]*green|red|uv)\b/gi,
  )].map(([, count]) => count)
  if (colorPairs.length >= 2) numericLayouts.push(colorPairs.join('-'))
  return numericLayouts.sort((left, right) => right.length - left.length)[0] ?? null
}

function configurationSuffix(family: string, value: string): string | null {
  const clean = cleanText(value)
  const lasers = laserCount(clean)
  const colonDetail = clean.match(/:\s*(.+)$/)?.[1]?.trim() ?? null
  if (family === 'aurora' || family === 'northern-lights' || family === 'id7000') {
    const layout = normalizedLayout(clean)
    if (lasers && layout) return `${lasers}: ${layout}`
    return lasers ?? layout
  }
  if (family === 'facsdiscover') {
    const variant = clean.match(/\b([SA])\s*8\b/i)?.[1]?.toUpperCase()
    if (variant) return `${variant}8${lasers ? ` (${lasers})` : ''}`
    return lasers ?? colonDetail
  }
  if (family === 'facsymphony' && /\ba5(?:\s*se)?\b/i.test(clean)) return 'A5 SE'
  if (family === 'fortessa' || family === 'fortessa-x20') return lasers
  if (family === 'cytoflex-s' || family === 'cytoflex-lx' || family === 'cytoflex') return normalizedLayout(clean)
  if (family === 'lsrii' || family === 'dxflex') return normalizedLayout(clean)
  if (colonDetail) return colonDetail
  if (family === 'cytpix') {
    return clean.match(/\b(BYRV6|BYRV4|BRV6X|BYV4X|BYRX|BV6XX|BV4XX|BRXX|BYXX)\b/i)?.[1]?.toUpperCase() ?? null
  }
  if (family === 'macsquant') {
    const model = clean.match(/\b(analyzer\s*\d+|vyb)\b/i)?.[1]
    return model ? model.replace(/\s+/g, ' ').replace(/^./, (letter) => letter.toUpperCase()) : null
  }
  if (family === 'quanteon' && /\b4025\b/.test(clean)) return '4025'
  if (family === 'xenith' && /\bfull\b/i.test(clean)) return 'full detector set'
  return lasers
}

function configurationTokens(family: string, value: string): Set<string> {
  const clean = cleanText(value)
  const compact = compactText(clean)
  const tokens = new Set<string>()
  const lasers = laserCount(clean)
  if (lasers) tokens.add(`laser-${lasers.slice(0, -1)}`)

  const addIfPresent = (token: string, pattern: RegExp) => {
    if (pattern.test(compact)) tokens.add(token)
  }

  if (family === 'facsdiscover') {
    addIfPresent('discover-s8', /s8/)
    addIfPresent('discover-a8', /a8/)
  }
  if (family === 'facsymphony') addIfPresent('symphony-a5', /a5/)
  if (family === 'celesta') {
    addIfPresent('celesta-bvuv', /bluevioletuv|bvuv/)
    addIfPresent('celesta-bvyg', /bluevioletyellowgreen|bluevioletyg|bvyg/)
    addIfPresent('celesta-bvr', /bluevioletred|bvr/)
    if (![...tokens].some((token) => token.startsWith('celesta-bv') && token !== 'celesta-bv')) {
      addIfPresent('celesta-bv', /blueviolet|bv/)
    }
  }
  if (family === 'cytpix') {
    for (const variant of ['byrv6', 'byrv4', 'brv6x', 'byv4x', 'byrx', 'bv6xx', 'bv4xx', 'brxx', 'byxx']) {
      addIfPresent(`cytpix-${variant}`, new RegExp(variant))
    }
  }
  if (family === 'macsquant') {
    addIfPresent('macsquant-analyzer10', /analyzer10/)
    addIfPresent('macsquant-analyzer16', /analyzer16/)
    addIfPresent('macsquant-vyb', /vyb/)
  }
  if (family === 'facsaria-fusion') addIfPresent('facsaria-buv', /buv/)
  if (family === 'xenith') addIfPresent('xenith-full', /full/)

  const layout = normalizedLayout(clean)
  if (layout) tokens.add(`layout-${compactText(layout.replace(/\d+/g, ''))}`)
  const channels = normalizedChannelLayout(clean)
  if (channels) tokens.add(`channels-${compactText(channels)}`)
  return tokens
}

function identity(value: string): CytometerIdentity {
  const family = familyFor(value)
  return {
    family,
    label: (() => {
      const base = baseLabel(family, value)
      const suffix = configurationSuffix(family, value)
      if (
        (family === 'aurora' || family === 'northern-lights' || family === 'id7000'
          || family === 'facsymphony' || family === 'facsdiscover'
          || family === 'fortessa' || family === 'fortessa-x20')
        && suffix
      ) return `${base} ${suffix}`
      return suffix ? `${base}: ${suffix}` : base
    })(),
    configurationTokens: configurationTokens(family, value),
  }
}

export function canonicalizeOmipCytometerLabel(value: string): string {
  return identity(value).label
}

function familiesMatch(reported: string, active: string): boolean {
  if (reported === active) return true
  if (reported.startsWith('cytoflex') && active.startsWith('cytoflex')) {
    return reported === 'cytoflex' || active === 'cytoflex'
  }
  return false
}

export function isCytometerSetupMatch(
  reportedCytometerLabel: string,
  activeCytometerLabel: string,
  activeConfigurationLabel = '',
): boolean {
  const reported = identity(reportedCytometerLabel)
  const activeCytometer = identity(activeCytometerLabel)
  const activeConfiguration = identity(activeConfigurationLabel)
  const activeTokens = new Set([
    ...activeCytometer.configurationTokens,
    ...activeConfiguration.configurationTokens,
  ])
  if (!familiesMatch(reported.family, activeCytometer.family)) return false
  if (reported.configurationTokens.size === 0 || activeTokens.size === 0) return true

  const compatibleCategory = (prefix: string): boolean => {
    const reportedValues = [...reported.configurationTokens].filter((token) => token.startsWith(prefix))
    const activeValues = [...activeTokens].filter((token) => token.startsWith(prefix))
    return reportedValues.length === 0
      || activeValues.length === 0
      || reportedValues.some((token) => activeValues.includes(token))
  }
  if (!compatibleCategory('laser-') || !compatibleCategory('layout-') || !compatibleCategory('channels-')) return false

  const structuralPrefixes = ['laser-', 'layout-', 'channels-']
  const reportedVariants = [...reported.configurationTokens]
    .filter((token) => !structuralPrefixes.some((prefix) => token.startsWith(prefix)))
  const activeVariants = [...activeTokens]
    .filter((token) => !structuralPrefixes.some((prefix) => token.startsWith(prefix)))
  return reportedVariants.length === 0
    || activeVariants.length === 0
    || reportedVariants.some((token) => activeVariants.includes(token))
}
