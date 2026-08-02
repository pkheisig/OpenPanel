import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Search } from 'lucide-react'
import { normalizeSearchValue, rankUiSelectOptions } from './uiSelectSearch'

export type UiSelectOption = {
  value: string
  label: string
  searchText?: string
}

type UiSelectProps = {
  label: string
  options: UiSelectOption[] | (() => UiSelectOption[])
  value: string
  onChange: (value: string) => void
  className?: string
  hideLabel?: boolean
  searchable?: boolean
  searchPlaceholder?: string
  placeholder?: string
  portalMenu?: boolean
  menuClassName?: string
  allowCustomValue?: boolean
}

export function UiSelect({
  label,
  options,
  value,
  onChange,
  className = '',
  hideLabel = false,
  searchable = false,
  searchPlaceholder = 'Search options',
  placeholder = '',
  portalMenu = false,
  menuClassName = '',
  allowCustomValue = false,
}: UiSelectProps) {
  const id = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const [open, setOpen] = useState(false)
  const resolvedOptions = useMemo(
    () => typeof options === 'function' ? (open ? options() : []) : options,
    [open, options],
  )
  const matchedIndex = resolvedOptions.findIndex((option) => option.value === value)
  const selectedIndex = Math.max(0, matchedIndex)
  const [activeIndex, setActiveIndex] = useState(selectedIndex)
  const [query, setQuery] = useState('')
  const [menuStyle, setMenuStyle] = useState<CSSProperties>()
  const [portalTarget, setPortalTarget] = useState<Element | null>(null)
  const displayedOptions = useMemo(() => {
    if (!open) return []
    const rankedOptions = rankUiSelectOptions(resolvedOptions, query)
    let visibleOptions = searchable && rankedOptions.length > 120
      ? rankedOptions.slice(0, 120)
      : rankedOptions
    const selectedOption = resolvedOptions[matchedIndex]
    if (selectedOption && !visibleOptions.some((option) => option.value === selectedOption.value)) {
      visibleOptions = [selectedOption, ...visibleOptions.slice(0, 119)]
    }
    const customValue = query.trim()
    const customOption = allowCustomValue
      && customValue
      && !resolvedOptions.some((option) => normalizeSearchValue(option.value) === normalizeSearchValue(customValue))
      ? { value: customValue, label: `Use “${customValue}”` }
      : null
    return customOption ? [...visibleOptions, customOption] : visibleOptions
  }, [allowCustomValue, matchedIndex, open, query, resolvedOptions, searchable])

  useEffect(() => {
    if (!open) return

    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false)
    }

    document.addEventListener('pointerdown', closeOnOutsidePointer)
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer)
  }, [open])

  useLayoutEffect(() => {
    if (!open || !portalMenu) return

    const positionMenu = () => {
      const trigger = rootRef.current?.querySelector<HTMLElement>('.ui-select-trigger')
      if (!trigger) return
      const rect = trigger.getBoundingClientRect()
      const estimatedHeight = Math.min(menuRef.current?.offsetHeight ?? 260, 260)
      const roomBelow = window.innerHeight - rect.bottom
      const openUpward = roomBelow < estimatedHeight + 12 && rect.top > roomBelow
      const width = rect.width
      setMenuStyle({
        left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
        width,
        ...(openUpward
          ? { top: 'auto', bottom: window.innerHeight - rect.top + 5 }
          : { top: rect.bottom + 5, bottom: 'auto' }),
      })
    }

    positionMenu()
    window.addEventListener('resize', positionMenu)
    window.addEventListener('scroll', positionMenu, true)
    return () => {
      window.removeEventListener('resize', positionMenu)
      window.removeEventListener('scroll', positionMenu, true)
    }
  }, [open, portalMenu, query])

  useEffect(() => {
    if (open && searchable) searchRef.current?.focus({ preventScroll: true })
  }, [open, searchable])

  useEffect(() => {
    if (open && !searchable) optionRefs.current[activeIndex]?.focus({ preventScroll: true })
  }, [activeIndex, open, searchable])

  const choose = (option: UiSelectOption) => {
    onChange(option.value)
    setOpen(false)
    setQuery('')
  }

  const move = (index: number) => {
    if (displayedOptions.length === 0) return
    const nextIndex = (index + displayedOptions.length) % displayedOptions.length
    setActiveIndex(nextIndex)
    window.requestAnimationFrame(() => optionRefs.current[nextIndex]?.focus({ preventScroll: true }))
  }

  const handleTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const triggerOptions = typeof options === 'function' ? options() : options
      const triggerSelectedIndex = Math.max(0, triggerOptions.findIndex((option) => option.value === value))
      setQuery('')
      setActiveIndex(searchable
        ? 0
        : event.key === 'ArrowDown'
          ? (triggerSelectedIndex + 1) % Math.max(1, triggerOptions.length)
          : (triggerSelectedIndex - 1 + triggerOptions.length) % Math.max(1, triggerOptions.length))
      if (portalMenu) {
        setPortalTarget(event.currentTarget.closest('.panel-builder, .launch-screen') ?? document.body)
      }
      setOpen(true)
    }
  }

  const closeAndRestoreFocus = () => {
    setOpen(false)
    setQuery('')
    rootRef.current?.querySelector<HTMLButtonElement>('[role="combobox"]')?.focus({ preventScroll: true })
  }

  const handleSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      move(0)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      move(displayedOptions.length - 1)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      closeAndRestoreFocus()
    }
  }

  const handleOptionKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      move(index + 1)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      move(index - 1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      move(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      move(displayedOptions.length - 1)
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      const option = displayedOptions[index]
      if (option) choose(option)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      closeAndRestoreFocus()
    }
  }

  const selectedOption = matchedIndex >= 0 ? resolvedOptions[matchedIndex] : null
  const menu = open && (
    <div
      ref={menuRef}
      className={`ui-select-options${portalMenu ? ' is-portal' : ''}${menuClassName ? ` ${menuClassName}` : ''}`}
      style={portalMenu ? menuStyle : undefined}
    >
      {searchable && (
        <div className="ui-select-search">
          <Search size={15} aria-hidden="true" />
          <input
            ref={searchRef}
            type="search"
            value={query}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            onChange={(event) => {
              setQuery(event.target.value)
              setActiveIndex(0)
            }}
            onKeyDown={handleSearchKeyDown}
          />
        </div>
      )}
      <div
        className="ui-select-listbox"
        id={`${id}-listbox`}
        role="listbox"
        aria-labelledby={`${id}-label`}
      >
        {displayedOptions.map((option, index) => {
          const selected = option.value === value
          return (
            <button
              key={option.value}
              ref={(node) => {
                optionRefs.current[index] = node
              }}
              type="button"
              className={`ui-select-option${selected ? ' is-selected' : ''}`}
              role="option"
              aria-selected={selected}
              tabIndex={index === activeIndex ? 0 : -1}
              onClick={() => choose(option)}
              onKeyDown={(event) => handleOptionKeyDown(event, index)}
            >
              <span className="ui-select-check">
                {selected && <Check size={15} aria-hidden="true" />}
              </span>
              <span>{option.label}</span>
            </button>
          )
        })}
        {displayedOptions.length === 0 && (
          <p className="ui-select-empty">No matching options</p>
        )}
      </div>
    </div>
  )

  return (
    <div className={`launch-field ${className}${open ? ' is-select-open' : ''}`.trim()} ref={rootRef}>
      <span id={`${id}-label`} className={hideLabel ? 'ui-select-label-hidden' : undefined}>{label}</span>
      <div className={`ui-select${open ? ' is-open' : ''}`}>
        <button
          type="button"
          className="ui-select-trigger"
          role="combobox"
          aria-labelledby={`${id}-label`}
          aria-controls={`${id}-listbox`}
          aria-expanded={open}
          aria-haspopup="listbox"
          onClick={(event) => {
            if (!open) {
              setQuery('')
              setActiveIndex(searchable ? 0 : selectedIndex)
              if (portalMenu) {
                setPortalTarget(event.currentTarget.closest('.panel-builder, .launch-screen') ?? document.body)
              }
            }
            setOpen((current) => !current)
          }}
          onKeyDown={handleTriggerKeyDown}
        >
          <span>{selectedOption?.label ?? (value || placeholder)}</span>
          <ChevronDown size={17} aria-hidden="true" />
        </button>

        {portalMenu
          ? menu && portalTarget && createPortal(menu, portalTarget)
          : menu}
      </div>
    </div>
  )
}
