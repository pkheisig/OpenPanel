import { useEffect, useRef, useState } from 'react'
import { Palette, X } from 'lucide-react'
import { UiSelect } from './UiSelect'
import { useOpenPanelTheme } from './OpenPanelTheme'
import {
  COLOR_PALETTES,
  STRUCTURAL_THEMES,
  SUPPORTED_APPEARANCES,
  type ColorPaletteId,
  type StructuralThemeId,
  type ThemeAppearance,
} from './uiThemes'

export function ThemeSelector({
  buttonClassName,
  disabled = false,
}: {
  buttonClassName: string
  disabled?: boolean
}) {
  const { selection, controlsOwned, updateSelection } = useOpenPanelTheme()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('keydown', close)
    document.addEventListener('pointerdown', closeOutside)
    return () => {
      document.removeEventListener('keydown', close)
      document.removeEventListener('pointerdown', closeOutside)
    }
  }, [open])

  if (!controlsOwned) return null
  return (
    <div ref={rootRef} className="openpanel-theme-control">
      <button
        type="button"
        className={buttonClassName}
        disabled={disabled}
        aria-label="Theme settings"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        title="Theme settings"
      >
        <Palette size={16} />
      </button>
      {open && (
        <section className="openpanel-theme-popover" role="dialog" aria-label="Theme settings">
          <header>
            <div>
              <strong>Theme</strong>
              <span>Application chrome only</span>
            </div>
            <button type="button" className="suite-button suite-button--quiet suite-button--icon" aria-label="Close theme settings" onClick={() => setOpen(false)}>
              <X size={15} />
            </button>
          </header>
          <UiSelect
            label="Style"
            value={selection.style}
            options={STRUCTURAL_THEMES.map((theme) => ({ value: theme.id, label: theme.label }))}
            onChange={(style) => updateSelection({ style: style as StructuralThemeId })}
          />
          <UiSelect
            label="Palette"
            value={selection.palette}
            options={COLOR_PALETTES.map((palette) => ({ value: palette.id, label: palette.label }))}
            onChange={(palette) => updateSelection({ palette: palette as ColorPaletteId })}
          />
          <UiSelect
            label="Appearance"
            value={selection.appearance}
            options={SUPPORTED_APPEARANCES.map((appearance) => ({
              value: appearance,
              label: appearance === 'system' ? 'System' : appearance === 'light' ? 'Light' : 'Dark',
            }))}
            onChange={(appearance) => updateSelection({ appearance: appearance as ThemeAppearance })}
          />
        </section>
      )}
    </div>
  )
}
