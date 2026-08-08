// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  applyOmipTemplateIfAvailable,
  applyRecommendedOmipTemplate,
  OmipLibrary,
  runOmipPreviewAction,
} from '../src/OmipLibrary'
import { OMIP_CATALOG } from '../src/panelWizardKnowledge'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('OMIP library workflows', () => {
  test('guards optional OMIP actions and routes compatibility warnings', () => {
    const template = OMIP_CATALOG[0].template!
    const entry = OMIP_CATALOG[0]
    const onApply = vi.fn()
    const onRecommended = vi.fn()
    const onWarn = vi.fn()
    applyOmipTemplateIfAvailable(null, onApply)
    applyOmipTemplateIfAvailable(template)
    applyOmipTemplateIfAvailable(template, onApply)
    expect(onApply).toHaveBeenCalledWith(template)
    applyRecommendedOmipTemplate(null, onRecommended)
    applyRecommendedOmipTemplate(entry)
    applyRecommendedOmipTemplate(entry, onRecommended)
    expect(onRecommended).toHaveBeenCalledWith(template, entry)
    runOmipPreviewAction(null, false, onApply, onWarn)
    runOmipPreviewAction(entry, false, undefined, onWarn)
    runOmipPreviewAction(entry, true, onApply, onWarn)
    expect(onWarn).toHaveBeenCalledWith(entry)
    runOmipPreviewAction(entry, false, onApply, onWarn)
    expect(onApply).toHaveBeenLastCalledWith(template)
  })

  test('filters, searches, previews, returns, and closes the library', () => {
    const onClose = vi.fn()
    render(<OmipLibrary theme="light" onClose={onClose} />)
    expect(screen.getByRole('dialog', { name: 'OMIP Library' })).not.toBeNull()
    expect(screen.getByText(/of 113 panels/)).not.toBeNull()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search OMIP Library' }), { target: { value: 'OMIP-120' } })
    expect(screen.getByRole('button', { name: 'Preview OMIP-120' })).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Clear' })).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(screen.getByText(/of 113 panels/)).not.toBeNull()

    fireEvent.click(screen.getByRole('combobox', { name: 'Species' }))
    fireEvent.click(screen.getByRole('option', { name: 'Mouse' }))
    fireEvent.click(screen.getByRole('combobox', { name: 'Method' }))
    fireEvent.click(screen.getByRole('option', { name: 'Spectral' }))
    fireEvent.click(screen.getByRole('combobox', { name: 'Availability' }))
    fireEvent.click(screen.getByRole('option', { name: 'Editable templates' }))
    fireEvent.click(screen.getByRole('combobox', { name: 'Year' }))
    fireEvent.click(screen.getByRole('option', { name: '2026' }))
    fireEvent.click(screen.getByRole('button', { name: 'Preview OMIP-120' }))
    expect(screen.getByRole('dialog', { name: 'OMIP-120' })).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Back to OMIP Library' })).not.toBeNull()
    expect(screen.getByText('Marker')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Back to OMIP Library' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close OMIP Library' }))
    expect(onClose).toHaveBeenCalled()
  })

  test('warns on incompatible template use and supports current and recommended actions', () => {
    const onClose = vi.fn()
    const onApplyTemplate = vi.fn()
    const onRecommended = vi.fn()
    render(
      <OmipLibrary
        theme="dark"
        onClose={onClose}
        onApplyTemplate={onApplyTemplate}
        onUseRecommendedConfiguration={onRecommended}
        canUseRecommendedConfiguration={() => true}
        availableFluorophores={['FITC']}
        maxPanelSize={1}
        activeCytometerLabel="Other cytometer"
        activeConfigurationLabel="Other config"
        actionLabel="Apply current"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Preview OMIP-120' }))
    expect(screen.getByRole('button', { name: 'Apply current' })).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Apply current' }))
    expect(screen.getByRole('alertdialog', { name: 'Warning' })).not.toBeNull()
    fireEvent.pointerDown(screen.getByRole('alertdialog', { name: 'Warning' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('alertdialog', { name: 'Warning' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Apply current' }))
    expect(screen.getByRole('alertdialog', { name: 'Warning' })).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Use recommended config' }))
    expect(onRecommended).toHaveBeenCalled()
    expect(onApplyTemplate).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Apply current' }))
    fireEvent.click(screen.getByRole('button', { name: 'Use current config' }))
    expect(onApplyTemplate).toHaveBeenCalled()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  test('applies a compatible template and closes from the backdrop', () => {
    const onClose = vi.fn()
    const onApplyTemplate = vi.fn()
    const template = OMIP_CATALOG.find((entry) => entry.name === 'OMIP-120')?.template
    expect(template).toBeDefined()
    render(
      <OmipLibrary
        theme="light"
        onClose={onClose}
        onApplyTemplate={onApplyTemplate}
        availableFluorophores={template!.markers.map((marker) => marker.fluorophore!).filter(Boolean)}
        maxPanelSize={40}
        activeCytometerLabel="Cytek Aurora 4L UV/V/B/R"
        activeConfigurationLabel="Aurora 4L UV/V/B/R"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Preview OMIP-120' }))
    fireEvent.click(screen.getByRole('button', { name: 'Apply to panel' }))
    expect(onApplyTemplate).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Back to OMIP Library' }))
    fireEvent.pointerDown(screen.getByRole('presentation'))
    expect(onClose).toHaveBeenCalled()
  })

  test('covers paper-only previews, every filter family, empty results, and warning cancellation', () => {
    const onClose = vi.fn()
    const paperOnlyEntry = {
      id: 'paper-only-test', name: 'OMIP-PAPER', summary: 'Paper only test', year: '2020',
      cytometers: ['Test cytometer'], species: 'other' as const, cellTypes: ['Test cells'],
      method: 'conventional' as const, sourceUrl: 'https://example.test/paper', template: null,
    }
    OMIP_CATALOG.push(paperOnlyEntry)
    render(<OmipLibrary theme="light" onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Enter' })

    const species = screen.getByRole('combobox', { name: 'Species' })
    fireEvent.click(species)
    fireEvent.click(screen.getByRole('option', { name: 'Non-human primate' }))
    fireEvent.click(species)
    fireEvent.click(screen.getByRole('option', { name: 'Other species' }))
    fireEvent.click(screen.getByRole('combobox', { name: 'Method' }))
    fireEvent.click(screen.getByRole('option', { name: 'Conventional' }))
    fireEvent.click(screen.getByRole('combobox', { name: 'Cell type' }))
    const cellTypeOption = screen.getAllByRole('option').find((option) => option.textContent !== 'All cell types')
    expect(cellTypeOption).toBeDefined()
    fireEvent.click(cellTypeOption!)
    fireEvent.click(screen.getByRole('combobox', { name: 'Availability' }))
    fireEvent.click(screen.getByRole('option', { name: 'Papers only' }))
    fireEvent.click(screen.getByRole('combobox', { name: 'Year' }))
    const yearOption = screen.getAllByRole('option').find((option) => option.textContent !== 'All years')
    expect(yearOption).toBeDefined()
    fireEvent.click(yearOption!)
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search OMIP Library' }), { target: { value: 'no such panel' } })
    expect(screen.getByText('No matching OMIP panels.')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))

    fireEvent.click(screen.getByRole('button', { name: `Preview ${paperOnlyEntry.name}` }))
    expect(screen.getByText('Markers')).not.toBeNull()
    expect(screen.getByText('This publication can be inspected here, but its marker–color table is not yet bundled as an editable template.')).not.toBeNull()
    fireEvent.pointerDown(screen.getByRole('dialog'))
    fireEvent.click(screen.getByRole('button', { name: 'Back to OMIP Library' }))

    const autoSelectEntry = {
      id: 'auto-select-test', name: 'OMIP-AUTO', summary: 'Auto-select test', year: '2021',
      cytometers: ['Test cytometer'], species: 'other' as const, cellTypes: ['Test cells'],
      method: 'spectral' as const, sourceUrl: 'https://example.test/auto',
      template: {
        id: 'auto-template', name: 'OMIP-AUTO', summary: 'Auto-select test',
        sourceUrl: 'https://example.test/auto', context: {
          species: 'human' as const, tissue: 'peripheral-blood' as const,
          population: 'all' as const, condition: 'baseline' as const,
        }, markers: [{ name: 'CD3' }],
      },
    }
    OMIP_CATALOG.push(autoSelectEntry)
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search OMIP Library' }), { target: { value: autoSelectEntry.name } })
    fireEvent.click(screen.getByRole('button', { name: `Preview ${autoSelectEntry.name}` }))
    expect(screen.getByText('Auto-select')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Back to OMIP Library' }))

    cleanup()
    render(<OmipLibrary theme="light" onClose={onClose} onApplyTemplate={vi.fn()} activeCytometerLabel="Other cytometer" canUseRecommendedConfiguration={() => true} />)
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search OMIP Library' }), { target: { value: autoSelectEntry.name } })
    fireEvent.click(screen.getByRole('button', { name: `Preview ${autoSelectEntry.name}` }))
    expect(screen.getByText(/Designed for Test cytometer/)).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Apply to panel/ }))
    expect(screen.getByRole('alertdialog', { name: 'Warning' })).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Use recommended config' }))
    expect(screen.queryByRole('alertdialog', { name: 'Warning' })).toBeNull()

    const entry = OMIP_CATALOG.find((candidate) => candidate.template && candidate.template.markers.length > 0)
    expect(entry).toBeDefined()
    // An empty availability list makes the workspace-incompatibility warning explicit.
    cleanup()
    const onApply = vi.fn()
    render(<OmipLibrary theme="light" onClose={onClose} onApplyTemplate={onApply} availableFluorophores={[]} maxPanelSize={999} />)
    fireEvent.click(screen.getByRole('button', { name: `Preview ${entry!.name}` }))
    fireEvent.click(screen.getByRole('button', { name: 'Apply to panel' }))
    expect(screen.getByRole('alertdialog', { name: 'Warning' })).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('alertdialog', { name: 'Warning' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Apply to panel' }))
    expect(screen.getByRole('alertdialog', { name: 'Warning' })).not.toBeNull()
    fireEvent.pointerDown(document.querySelector('.omip-compatibility-backdrop') as HTMLElement)
    expect(screen.queryByRole('alertdialog', { name: 'Warning' })).toBeNull()
    OMIP_CATALOG.pop()
    OMIP_CATALOG.pop()
  })
})
