import { sha256 } from './spectralEngine'

export type ProvenanceEvidence<T> =
  | { status: 'available'; value: T }
  | { status: 'unavailable'; reason: string }
  | { status: 'not-applicable'; reason?: string }

export type ProvenanceReference = {
  id: string
  type: string
  version?: string
  sha256?: string
}

export type OpenSuiteProvenance = {
  schemaName: 'opensuite-provenance'
  schemaVersion: 1
  producer: { id: string; name: string; version: string }
  artifact: {
    id: string
    type: string
    createdAt: string
    checksum: { algorithm: 'sha256'; encoding: 'hex'; digest: string; scope: 'artifact-bytes' | 'artifact-payload-bytes' }
  }
  operation: ProvenanceEvidence<{ id: string; name: string; version: string }>
  configuration: ProvenanceEvidence<ProvenanceReference>
  lineage: {
    sourceInputs: ProvenanceEvidence<ProvenanceReference[]>
    controlRun: ProvenanceEvidence<ProvenanceReference>
    sampleRun: ProvenanceEvidence<ProvenanceReference>
    referenceMatrix: ProvenanceEvidence<ProvenanceReference>
    adjustedMatrix: ProvenanceEvidence<ProvenanceReference>
    spectralLibrary: ProvenanceEvidence<ProvenanceReference>
    parents: ProvenanceEvidence<ProvenanceReference[]>
  }
  runtime: {
    platform: ProvenanceEvidence<{ os: string; architecture: string; version?: string }>
    r: ProvenanceEvidence<{ version: string }>
    packages: ProvenanceEvidence<{ items: Array<{ name: string; version: string }> }>
  }
  randomness: { status: 'not-applicable'; reason: string } | { status: 'available'; seed: number } | { status: 'unavailable'; reason: string }
  serialization: { mediaType: 'application/json'; charset: 'utf-8'; canonicalization: 'opensuite-canonical-json-v1'; maxBytes: 65536 }
  extensions: Record<string, Record<string, unknown>>
}

export function canonicalJson(value: unknown): string {
  const normalize = (candidate: unknown): unknown => {
    if (Array.isArray(candidate)) return candidate.map(normalize)
    if (candidate && typeof candidate === 'object') {
      return Object.fromEntries(Object.keys(candidate as Record<string, unknown>).sort().map((key) => [key, normalize((candidate as Record<string, unknown>)[key])]))
    }
    if (typeof candidate === 'number' && !Number.isFinite(candidate)) throw new Error('Provenance contains a non-finite number.')
    return candidate
  }
  return JSON.stringify(normalize(value))
}

const available = <T>(value: T): ProvenanceEvidence<T> => ({ status: 'available', value })
const notApplicable = (reason: string): { status: 'not-applicable'; reason: string } => ({ status: 'not-applicable', reason })
const reference = (id: string, type: string, digest?: string): ProvenanceReference => ({
  id,
  type,
  ...(digest ? { sha256: digest } : {}),
})

export function createOpenSuiteProvenance(options: {
  artifactType: string
  artifactName: string
  payload: unknown
  configurationId?: string
  parents?: ProvenanceReference[]
  responseProvenance?: unknown
  originalProvenance?: OpenSuiteProvenance
}): OpenSuiteProvenance {
  const payloadDigest = sha256(canonicalJson(options.payload))
  const createdAt = new Date().toISOString().replace(/(\.\d{3})\dZ$/, '$1Z')
  const platform = typeof navigator === 'undefined'
    ? { status: 'unavailable' as const, reason: 'Browser platform is not available.' }
    : available({
      os: navigator.platform || 'browser',
      architecture: 'browser',
    })
  return {
    schemaName: 'opensuite-provenance',
    schemaVersion: 1,
    producer: { id: 'openpanel', name: 'OpenPanel', version: '1.0.0' },
    artifact: {
      id: `openpanel-${payloadDigest.slice(0, 24)}`,
      type: options.artifactType,
      createdAt,
      checksum: { algorithm: 'sha256', encoding: 'hex', digest: payloadDigest, scope: 'artifact-payload-bytes' },
    },
    operation: available({ id: 'openpanel-save', name: options.artifactName, version: '1.0.0' }),
    configuration: options.configurationId
      ? available(reference(options.configurationId, 'openpanel-project'))
      : notApplicable('No independent configuration identity was supplied.'),
    lineage: {
      sourceInputs: notApplicable('OpenPanel panel projects do not directly own source files.'),
      controlRun: notApplicable('OpenPanel panel projects do not run control acquisition.'),
      sampleRun: notApplicable('OpenPanel panel projects do not run sample acquisition.'),
      referenceMatrix: notApplicable('OpenPanel panel projects do not own a reference matrix.'),
      adjustedMatrix: notApplicable('OpenPanel panel projects do not own an adjusted matrix.'),
      spectralLibrary: available(reference('openpanel-bundled-library', 'spectral-library')),
      parents: options.parents?.length ? available(options.parents) : notApplicable('This is the first saved project artifact.'),
    },
    runtime: {
      platform,
      r: notApplicable('OpenPanel is a TypeScript browser application.'),
      packages: available({ items: [] }),
    },
    randomness: notApplicable('Panel construction is deterministic for a saved project.'),
    serialization: { mediaType: 'application/json', charset: 'utf-8', canonicalization: 'opensuite-canonical-json-v1', maxBytes: 65536 },
    extensions: {
      openpanel: {
        projectSchemaVersion: 1,
        ...(options.responseProvenance === undefined ? {} : { responseProvenance: options.responseProvenance }),
        ...(options.originalProvenance === undefined ? {} : { originalProvenance: options.originalProvenance }),
      },
    },
  }
}

function isEvidence(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  if (record.status === 'available') return Object.prototype.hasOwnProperty.call(record, 'value')
  return record.status === 'unavailable' || record.status === 'not-applicable'
}

export function inspectOpenSuiteProvenance(value: unknown): OpenSuiteProvenance {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Project provenance must be an object.')
  const record = value as Record<string, unknown>
  const required = ['producer', 'artifact', 'operation', 'configuration', 'lineage', 'runtime', 'randomness', 'serialization', 'extensions']
  if (record.schemaName !== 'opensuite-provenance' || record.schemaVersion !== 1 || required.some((key) => !(key in record))) {
    throw new Error('Project provenance does not match OpenSuite schema version 1.')
  }
  const artifact = record.artifact as Record<string, unknown>
  const checksum = artifact?.checksum as Record<string, unknown>
  if (!artifact || typeof artifact.id !== 'string' || typeof artifact.type !== 'string' || !checksum || checksum.algorithm !== 'sha256' || checksum.encoding !== 'hex' || typeof checksum.digest !== 'string' || !/^[0-9a-f]{64}$/.test(checksum.digest) || !['artifact-bytes', 'artifact-payload-bytes'].includes(String(checksum.scope))) {
    throw new Error('Project provenance contains an invalid artifact checksum.')
  }
  if (!isEvidence(record.operation) || !isEvidence(record.configuration)) throw new Error('Project provenance contains invalid operation or configuration evidence.')
  const lineage = record.lineage as Record<string, unknown>
  const runtime = record.runtime as Record<string, unknown>
  if (!lineage || ['sourceInputs', 'controlRun', 'sampleRun', 'referenceMatrix', 'adjustedMatrix', 'spectralLibrary', 'parents'].some((key) => !isEvidence(lineage[key]))) throw new Error('Project provenance contains invalid lineage evidence.')
  if (!runtime || !isEvidence(runtime.platform) || !isEvidence(runtime.r) || !isEvidence(runtime.packages)) throw new Error('Project provenance contains invalid runtime evidence.')
  if (!record.extensions || typeof record.extensions !== 'object' || Array.isArray(record.extensions)) throw new Error('Project provenance extensions must be an object.')
  return value as OpenSuiteProvenance
}

export type OpenPanelProjectProvenanceInspection =
  | { status: 'legacy'; reason: string }
  | { status: 'verified'; provenance: OpenSuiteProvenance; expectedDigest: string; actualDigest: string }
  | { status: 'mismatch'; provenance: OpenSuiteProvenance; expectedDigest: string; actualDigest: string }

export function inspectOpenPanelProjectProvenance(value: unknown): OpenPanelProjectProvenanceInspection {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('OpenPanel project must be an object.')
  const record = value as Record<string, unknown>
  if (record.provenance === undefined) return { status: 'legacy', reason: 'Project predates embedded OpenSuite provenance.' }
  const provenance = inspectOpenSuiteProvenance(record.provenance)
  const payload = { ...record }
  delete payload.provenance
  const actualDigest = sha256(canonicalJson(payload))
  const expectedDigest = provenance.artifact.checksum.digest
  return actualDigest === expectedDigest
    ? { status: 'verified', provenance, expectedDigest, actualDigest }
    : { status: 'mismatch', provenance, expectedDigest, actualDigest }
}
