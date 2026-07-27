import { describe, expect, test } from 'vitest'
import {
  PROJECT_FILE_KIND,
  PROJECT_FILE_VERSION,
  parseProject,
  serializeProject,
} from '../src/projectStore'
import type { ProjectState } from '../src/projectStore'

const project: ProjectState = {
  cytometer: 'aurora',
  configuration: '5l_uv_v_b_yg_r',
  slots: ['Alexa Fluor 488', 'Alexa Fluor 647', ''],
  markers: { 0: 'CD3', 1: 'CD19' },
  tab: 'similarity',
  theme: 'dark',
  sidebarWidth: 276,
  sidebarCollapsed: false,
  plotScale: 90,
}

describe('OpenPanel project files', () => {
  test('round-trips every persisted field through the versioned format', () => {
    const serialized = serializeProject(project)
    const file = JSON.parse(serialized) as Record<string, unknown>
    expect(file.kind).toBe(PROJECT_FILE_KIND)
    expect(file.version).toBe(PROJECT_FILE_VERSION)
    expect(file.savedAt).toEqual(expect.any(String))
    expect(parseProject(serialized)).toEqual(project)
  })

  test('loads the former R gui_state config envelope', () => {
    const legacy = JSON.stringify({
      module: 'panel_builder',
      config: {
        cytometer: 'discover',
        configuration: 'discover_s8',
        slots: ['Alexa Fluor 488', '', ''],
        markers: { 0: 'CD4' },
        tab: 'panel',
        theme: 'light',
        sidebarWidth: 999,
        sidebarCollapsed: true,
      },
    })
    expect(parseProject(legacy)).toEqual({
      cytometer: 'discover',
      configuration: 'discover_s8',
      slots: ['Alexa Fluor 488', '', ''],
      markers: { 0: 'CD4' },
      tab: 'panel',
      theme: 'light',
      sidebarWidth: 440,
      sidebarCollapsed: true,
      plotScale: 80,
    })
  })

  test('rejects unrelated and future project formats', () => {
    expect(() => parseProject('{"kind":"Elsewhere","version":1}')).toThrow('different application')
    expect(() => parseProject(`{"kind":"${PROJECT_FILE_KIND}","version":99}`)).toThrow('not supported')
  })
})
