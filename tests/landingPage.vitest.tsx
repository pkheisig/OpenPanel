// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  LandingPage,
  recommendedSetupForOmip,
  resolveConfigurationLabel,
  resolveLibraryLabel,
  sortPanelProjects,
} from '../src/LandingPage'
import type { OmipCatalogEntry } from '../src/panelWizardKnowledge'
import type { StoredPanelProject } from '../src/projectStore'
import { mockBundledData } from './helpers'
import { getSpectralPanelLibraries } from '../src/spectralEngine'

beforeEach(() => {
  mockBundledData()
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn(() => ({ matches: false, addListener: vi.fn(), removeListener: vi.fn() })),
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  localStorage.clear()
})

const callbacks = () => ({
  onStart: vi.fn(async () => undefined),
  onOpen: vi.fn(),
  onImport: vi.fn(async () => undefined),
  onExport: vi.fn(async () => undefined),
  onRename: vi.fn(async () => undefined),
  onDuplicate: vi.fn(async () => undefined),
  onArchive: vi.fn(async () => undefined),
  onRestore: vi.fn(async () => undefined),
  onDelete: vi.fn(async () => undefined),
})

const panel = (overrides: Partial<StoredPanelProject> = {}): StoredPanelProject => ({
  id: 'panel-1', name: 'Panel 1', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z',
  state: {
    cytometer: 'aurora', configuration: '5l_uv_v_b_yg_r', slots: ['Alexa Fluor 488'], markers: { 0: 'CD3' },
    tab: 'panel', theme: 'light', sidebarWidth: 214, sidebarCollapsed: false,
    plotScale: 80, plotScaleMode: 'fit-width', wizard: null, cytometerPanels: {},
  },
  ...overrides,
})

describe('LandingPage workflows', () => {
  test('sorts projects deterministically and maps published OMIP instrument labels', () => {
    const a = panel({ id: 'a', name: 'Panel 2', createdAt: '2026-01-01', updatedAt: '2026-01-03' })
    const b = panel({ id: 'b', name: 'Panel 10', createdAt: '2026-01-02', updatedAt: '2026-01-02' })
    const c = panel({ id: 'c', name: 'Panel 1', createdAt: '2026-01-02', updatedAt: '2026-01-02' })
    expect(sortPanelProjects([a, b, c], 'created-asc').map((item) => item.id)).toEqual(['a', 'b', 'c'])
    expect(sortPanelProjects([a, b, c], 'updated-desc').map((item) => item.id)).toEqual(['a', 'b', 'c'])
    expect(sortPanelProjects([a, b, c], 'name-asc').map((item) => item.id)).toEqual(['c', 'a', 'b'])
    expect(sortPanelProjects([a, b, c], 'created-desc').map((item) => item.id)).toEqual(['b', 'c', 'a'])
    const ties = [
      panel({ id: 'z', name: 'Same', createdAt: '2026-01-01', updatedAt: '2026-01-01' }),
      panel({ id: 'a', name: 'Same', createdAt: '2026-01-01', updatedAt: '2026-01-01' }),
    ]
    expect(sortPanelProjects(ties, 'created-asc').map((item) => item.id)).toEqual(['a', 'z'])
    expect(sortPanelProjects(ties, 'updated-desc').map((item) => item.id)).toEqual(['a', 'z'])
    expect(sortPanelProjects(ties, 'name-asc').map((item) => item.id)).toEqual(['a', 'z'])
    expect(resolveLibraryLabel('unknown', [{ id: 'known', label: 'Known' }])).toBe('unknown')
    expect(resolveConfigurationLabel('unknown', [{ id: 'known', label: 'Known' }])).toBe('unknown')

    const makeEntry = (cytometer: string): OmipCatalogEntry => ({
      id: cytometer, name: cytometer, year: '2026', species: 'human', method: 'spectral',
      summary: '', cytometers: [cytometer], cellTypes: [], sourceUrl: '', template: null,
    })
    const cases: Array<[string, string, string]> = [
      ['Cytek Aurora 5L', 'aurora', '5l_uv_v_b_yg_r'],
      ['Cytek Aurora 4L YG', 'aurora', '4l_v_b_yg_r'],
      ['Cytek Aurora 4L', 'aurora', '4l_uv_v_b_r'],
      ['Cytek Aurora 3L', 'aurora', '3l_v_b_r'],
      ['Sony ID7000 4L', 'id7000', 'id7000_4l'],
      ['Sony ID7000 3L', 'id7000', 'id7000_3l'],
      ['Sony ID7000', 'id7000', 'id7000_5l'],
      ['BD FACSDiscover A8', 'discover', 'discover_a8'],
      ['BD FACSDiscover S8', 'discover', 'discover_s8'],
      ['Thermo Xenith', 'xenith', 'full'],
      ['BD FACSymphony A5 SE', 'symphony', 'symphony_a5se'],
      ['BD LSRFortessa 4L', 'fortessa', 'fortessa_4l'],
      ['BD LSRFortessa', 'fortessa', 'fortessa_3l'],
      ['BD FACSCelesta BVUV', 'celesta', 'celesta_bvuv'],
      ['BD FACSCelesta BVYG', 'celesta', 'celesta_bvyg'],
      ['BD FACSCelesta BVR', 'celesta', 'celesta_bvr'],
      ['BD FACSCelesta', 'celesta', 'celesta_bv'],
      ['Attune NxT', 'attune_nxt', 'attune_nxt_4l'],
      ['BD FACSCanto II 3L', 'canto', 'canto_3l_4_2_2'],
      ['BD FACSCanto II 5-3', 'canto', 'canto_2l_5_3'],
      ['BD FACSCanto II', 'canto', 'canto_2l_4_2'],
      ['BD FACSLyric 12', 'lyric', 'lyric_3l_12'],
      ['BD FACSLyric 10', 'lyric', 'lyric_3l_10'],
      ['BD FACSLyric 8', 'lyric', 'lyric_3l_8'],
      ['BD FACSLyric 6', 'lyric', 'lyric_2l_6'],
      ['BD FACSLyric', 'lyric', 'lyric_2l_4'],
      ['Bio-Rad ZE5 5L', 'ze5', 'ze5_5l_27'],
      ['Bio-Rad ZE5 4L', 'ze5', 'ze5_4l_24'],
      ['Bio-Rad ZE5 20', 'ze5', 'ze5_3l_20'],
      ['Bio-Rad ZE5 option 2', 'ze5', 'ze5_3l_17_option2'],
      ['Bio-Rad ZE5', 'ze5', 'ze5_3l_17'],
      ['Attune CytPix BYRV4', 'cytpix', 'cytpix_byrv4'],
      ['NovoCyte Quanteon', 'quanteon', 'quanteon_4025'],
      ['BD Accuri C6 Plus', 'accuri_c6_plus', 'accuri_c6_plus_standard'],
      ['BD FACSCalibur', 'facscalibur', 'facscalibur_2l_4'],
      ['Beckman DxFlex', 'dxflex', 'dxflex_b5_r3_v5'],
      ['Miltenyi MACSQuant 16', 'macsquant', 'macsquant_analyzer16'],
      ['Miltenyi MACSQuant VYB', 'macsquant', 'macsquant_vyb'],
      ['Miltenyi MACSQuant', 'macsquant', 'macsquant_analyzer10'],
      ['BD FACSVerse 3L', 'facsverse', 'facsverse_3l_8'],
      ['BD FACSVerse 2L', 'facsverse', 'facsverse_2l_6'],
      ['BD FACSVerse 6-color', 'facsverse', 'facsverse_2l_6'],
      ['BD FACSVerse', 'facsverse', 'facsverse_1l_4'],
      ['BD LSR II 6B-6V-2UV-4R', 'lsrii', 'lsrii_6b_6v_2uv_4r'],
      ['BD LSR II 6B6V2UV4R', 'lsrii', 'lsrii_6b_6v_2uv_4r'],
      ['BD LSR II 6B-6V-2UV-3R', 'lsrii', 'lsrii_6b_6v_2uv_3r'],
      ['BD LSR II 6B6V2UV3R', 'lsrii', 'lsrii_6b_6v_2uv_3r'],
      ['BD LSR II 6B-6V-0UV-4R', 'lsrii', 'lsrii_6b_6v_0uv_4r'],
      ['BD LSR II 6B6V0UV4R', 'lsrii', 'lsrii_6b_6v_0uv_4r'],
      ['BD LSR II 6B-6V-0UV-3R', 'lsrii', 'lsrii_6b_6v_0uv_3r'],
      ['BD LSR II 6B6V0UV3R', 'lsrii', 'lsrii_6b_6v_0uv_3r'],
      ['BD LSR II 6B-2V-2UV-3R', 'lsrii', 'lsrii_6b_2v_2uv_3r'],
      ['BD LSR II 6B2V2UV3R', 'lsrii', 'lsrii_6b_2v_2uv_3r'],
      ['BD LSR II 6B-2V-0UV-3R', 'lsrii', 'lsrii_6b_2v_0uv_3r'],
      ['BD LSR II 6B2V0UV3R', 'lsrii', 'lsrii_6b_2v_0uv_3r'],
      ['BD LSR II 6B-0V-2UV-3R', 'lsrii', 'lsrii_6b_0v_2uv_3r'],
      ['BD LSR II 6B0V2UV3R', 'lsrii', 'lsrii_6b_0v_2uv_3r'],
      ['BD LSR II 6B-0V-0UV-3R', 'lsrii', 'lsrii_6b_0v_0uv_3r'],
      ['BD LSR II 6B0V0UV3R', 'lsrii', 'lsrii_6b_0v_0uv_3r'],
      ['Thermo Fisher Attune CytPix', 'cytpix', 'cytpix_byrv6'],
      ['Beckman CytoFLEX LX', 'cytoflex_lx', 'cytoflex_lx_u3_v5_b3_y5_r3_i0'],
      ['Beckman Navios', 'navios', 'navios_2l_8'],
      ['BD FACSAria Fusion', 'facsaria_fusion', 'facsaria_fusion_buv'],
    ]
    for (const [reported, cytometer, configuration] of cases) {
      expect(recommendedSetupForOmip(makeEntry(reported))).toEqual({ cytometer, configuration })
    }
    expect(recommendedSetupForOmip(makeEntry('Cytek Northern Lights 4L'))).toBeNull()
    expect(recommendedSetupForOmip(makeEntry('Unknown instrument'))).toBeNull()
    expect(recommendedSetupForOmip(makeEntry('Cytek Aurora'))).toBeNull()
    expect(recommendedSetupForOmip({ ...makeEntry('Aurora 5L'), cytometers: ['Aurora 5L', 'Unknown'] })).toEqual({ cytometer: 'aurora', configuration: '5l_uv_v_b_yg_r' })
  })

  test('configures a cytometer, starts a panel, toggles theme, and opens archive disclosure', async () => {
    const props = callbacks()
    render(<LandingPage panels={[]} {...props} />)
    expect(screen.getByText('No projects yet.')).not.toBeNull()
    expect((screen.getByRole('button', { name: /Build panel/ }) as HTMLButtonElement).disabled).toBe(true)

    const cytometer = screen.getByRole('combobox', { name: 'CYTOMETER' })
    for (const library of getSpectralPanelLibraries()) {
      fireEvent.click(cytometer)
      fireEvent.click(screen.getByRole('option', { name: library.label, exact: true }))
    }

    fireEvent.click(cytometer)
    fireEvent.click(screen.getByRole('option', { name: 'Cytek Aurora' }))
    fireEvent.click(screen.getByRole('combobox', { name: 'DETECTOR CONFIGURATION' }))
    fireEvent.click(screen.getByRole('option', { name: /Aurora 5L/ }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Panel name' }), { target: { value: 'My panel' } })
    expect((screen.getByRole('button', { name: /Build panel/ }) as HTMLButtonElement).disabled).toBe(false)
    fireEvent.submit(screen.getByRole('form', { name: 'Panel configuration' }))
    await waitFor(() => expect(props.onStart).toHaveBeenCalledWith(expect.objectContaining({ name: 'My panel', cytometer: 'aurora' })))

    fireEvent.click(screen.getByRole('button', { name: 'Use dark mode' }))
    expect(screen.getByRole('main').classList.contains('dark')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Use light mode' }))
    const archiveDisclosure = document.querySelector('.archive-disclosure') as HTMLButtonElement
    fireEvent.click(archiveDisclosure)
    expect(archiveDisclosure.getAttribute('aria-expanded')).toBe('true')
  })

  test('opens project actions, supports sorting, archive restore, and project callbacks', async () => {
    const props = callbacks()
    const archived = panel({ id: 'panel-2', name: 'Archived', archivedAt: '2026-01-03T00:00:00.000Z' })
    render(<LandingPage panels={[panel(), archived]} {...props} />)
    expect(screen.getByRole('button', { name: 'Open Panel 1' })).not.toBeNull()
    fireEvent.click(screen.getByRole('combobox', { name: 'Order projects' }))
    fireEvent.click(screen.getByRole('option', { name: 'Name A–Z' }))
    fireEvent.click(screen.getByRole('button', { name: 'Project actions for Panel 1' }))
    expect(screen.getByRole('menu', { name: 'Panel 1 actions' })).not.toBeNull()
    vi.spyOn(window, 'prompt').mockReturnValue('Renamed')
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))
    await waitFor(() => expect(props.onRename).toHaveBeenCalledWith(expect.objectContaining({ id: 'panel-1' }), 'Renamed'))

    fireEvent.click(screen.getByRole('button', { name: 'Project actions for Panel 1' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Duplicate' }))
    expect(props.onDuplicate).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Project actions for Panel 1' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Archive' }))
    expect(props.onArchive).toHaveBeenCalled()

    fireEvent.click(document.querySelector('.archive-disclosure') as HTMLButtonElement)
    fireEvent.click(screen.getByRole('button', { name: 'Project actions for Archived' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Restore' }))
    expect(props.onRestore).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Project actions for Archived' }))
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    expect(props.onDelete).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Open Panel 1' }))
    expect(props.onOpen).toHaveBeenCalled()
  })
})
