import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

const pagesWorkflow = readFileSync(new URL('../.github/workflows/pages.yml', import.meta.url), 'utf8')
const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8')

// These are the repository's maintained branches; gh-pages is generated output.
const supportedReleaseBranches = new Set(['dev', 'main'])

describe('GitHub Pages release policy', () => {
  test('uses a supported branch consistently and rejects the retired main2 trigger', () => {
    const releaseBranch = pagesWorkflow.match(
      /^\s*if: github\.ref == 'refs\/heads\/([^']+)'\s*$/m,
    )?.[1]

    expect(releaseBranch).toBeDefined()
    expect(supportedReleaseBranches.has(releaseBranch ?? '')).toBe(true)
    expect(releaseBranch).toBe('dev')
    expect(pagesWorkflow).toMatch(/deploy:\n\s+if: github\.ref == 'refs\/heads\/dev'\n\s+needs: build/)
    expect(pagesWorkflow).toMatch(/push:\n\s+branches-ignore:\n\s+- gh-pages/)
    expect(`${pagesWorkflow}\n${readme}`).not.toMatch(/main2/i)
    expect(readme).toContain('then deploys only `dist/` from `dev`')
  })

  test('preserves the static site handoff and public Pages URL', () => {
    expect(pagesWorkflow).toContain('path: dist')
    expect(pagesWorkflow).toContain('path: site')
    expect(pagesWorkflow).toContain('https://pkheisig.github.io/OpenPanel/')
    expect(readme).toContain('`/OpenPanel/` production base')
  })
})
