export type SearchableSelectOption = {
  value: string
  label: string
}

export function normalizeSearchValue(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/near[\s/-]*ir/g, 'nir')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function rankUiSelectOptions<T extends SearchableSelectOption>(
  options: T[],
  query: string,
): T[] {
  const normalizedQuery = normalizeSearchValue(query)
  if (!normalizedQuery) return options

  const queryTokens = normalizedQuery.split(/\s+/).filter(Boolean)

  return options
    .map((option, originalIndex) => {
      const label = normalizeSearchValue(option.label)
      if (!queryTokens.every((token) => label.includes(token))) return null

      const words = label.split(/\s+/)
      const priority = label === normalizedQuery
        ? 0
        : label.startsWith(normalizedQuery)
          ? 1
          : queryTokens.every((token) => words.some((word) => word.startsWith(token)))
            ? 2
            : 3

      return {
        option,
        originalIndex,
        priority: option.value ? priority : priority + 4,
      }
    })
    .filter((match): match is {
      option: T
      originalIndex: number
      priority: number
    } => match !== null)
    .sort((left, right) => (
      left.priority - right.priority
      || left.originalIndex - right.originalIndex
    ))
    .map(({ option }) => option)
}
