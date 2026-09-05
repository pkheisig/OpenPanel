import { describe, expect, test } from 'vitest'
import {
  canonicalJson,
  createOpenSuiteProvenance,
  inspectOpenPanelProjectProvenance,
  inspectOpenSuiteProvenance,
} from '../src/provenance'

describe('portable OpenSuite provenance', () => {
  test('canonicalizes object keys and validates the shared envelope', () => {
    expect(canonicalJson({ z: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"z":1}')
    const provenance = createOpenSuiteProvenance({
      artifactType: 'openpanel-project',
      artifactName: 'Test project save',
      payload: { configuration: '5l_uv_v_b_yg_r', slots: ['Alexa Fluor 488'] },
    })
    expect(inspectOpenSuiteProvenance(provenance).artifact.type).toBe('openpanel-project')
  })

  test('classifies legacy projects and detects payload tampering', () => {
    expect(inspectOpenPanelProjectProvenance({ configuration: 'legacy' }).status).toBe('legacy')
    const payload = { kind: 'openpanel-project', version: 1, savedAt: '2026-01-01T00:00:00Z', configuration: '5l_uv_v_b_yg_r' }
    const provenance = createOpenSuiteProvenance({ artifactType: 'openpanel-project', artifactName: 'Test project save', payload })
    const project = { ...payload, provenance }
    expect(inspectOpenPanelProjectProvenance(project).status).toBe('verified')
    expect(inspectOpenPanelProjectProvenance({ ...project, configuration: 'discover_s8' }).status).toBe('mismatch')
  })
})
