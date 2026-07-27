import { useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Check, ChevronDown } from 'lucide-react'

export type UiSelectOption = {
  value: string
  label: string
}

type UiSelectProps = {
  label: string
  options: UiSelectOption[]
  value: string
  onChange: (value: string) => void
  className?: string
  hideLabel?: boolean
}

export function UiSelect({
  label,
  options,
  value,
  onChange,
  className = '',
  hideLabel = false,
}: UiSelectProps) {
  const id = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value))
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(selectedIndex)

  useEffect(() => {
    if (!open) return

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }

    document.addEventListener('pointerdown', closeOnOutsidePointer)
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer)
  }, [open])

  useEffect(() => {
    if (!open) return
    optionRefs.current[activeIndex]?.focus()
  }, [activeIndex, open])

  const choose = (index: number) => {
    const option = options[index]
    if (!option) return
    onChange(option.value)
    setActiveIndex(index)
    setOpen(false)
  }

  const move = (index: number) => {
    if (options.length === 0) return
    setActiveIndex((index + options.length) % options.length)
  }

  const handleTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex(event.key === 'ArrowDown'
        ? (selectedIndex + 1) % options.length
        : (selectedIndex - 1 + options.length) % options.length)
      setOpen(true)
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
      move(options.length - 1)
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      choose(index)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
      rootRef.current?.querySelector<HTMLButtonElement>('[role="combobox"]')?.focus()
    }
  }

  const selectedOption = options[selectedIndex]

  return (
    <div className={`launch-field ${className}${open ? ' is-select-open' : ''}`.trim()} ref={rootRef}>
      <span id={`${id}-label`} className={hideLabel ? 'ui-select-label-hidden' : undefined}>{label}</span>
      <div className={`ui-select${open ? ' is-open' : ''}`}>
        <button
          type="button"
          className="ui-select-trigger"
          role="combobox"
          aria-labelledby={`${id}-label`}
          aria-controls={`${id}-options`}
          aria-expanded={open}
          aria-haspopup="listbox"
          onClick={() => {
            setActiveIndex(selectedIndex)
            setOpen((current) => !current)
          }}
          onKeyDown={handleTriggerKeyDown}
        >
          <span>{selectedOption?.label}</span>
          <ChevronDown size={17} aria-hidden="true" />
        </button>

        {open && (
          <div
            className="ui-select-options"
            id={`${id}-options`}
            role="listbox"
            aria-labelledby={`${id}-label`}
          >
            {options.map((option, index) => {
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
                  onClick={() => choose(index)}
                  onKeyDown={(event) => handleOptionKeyDown(event, index)}
                >
                  <span className="ui-select-check">
                    {selected && <Check size={15} aria-hidden="true" />}
                  </span>
                  <span>{option.label}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
