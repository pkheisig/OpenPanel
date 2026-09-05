import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

const moduleStyles = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')
const standaloneStyles = readFileSync(new URL('../src/standalone/standalone.css', import.meta.url), 'utf8')
const foundationTokens = readFileSync(new URL('../src/ui-foundation/tokens.css', import.meta.url), 'utf8')
const foundationPrimitives = readFileSync(new URL('../src/ui-foundation/primitives.css', import.meta.url), 'utf8')

describe('OpenSuite UI contract boundary', () => {
  test('keeps reusable foundation styles inside the module root', () => {
    expect(moduleStyles).toContain('@layer reset, foundation, primitives, shell;')
    expect(moduleStyles).toContain('.openpanel-module-root')
    expect(moduleStyles).toContain('.openpanel-module-root .app-loading')
    expect(moduleStyles).toContain('.launch-screen.dark')
    expect(moduleStyles).toContain('./ui-foundation/tokens.css')
    expect(moduleStyles).toContain('./ui-foundation/primitives.css')
    expect(moduleStyles).not.toMatch(/(^|\n)\s*(html|body|#root|:root)\s*[{,:]/)
    expect(moduleStyles).not.toContain('body:has(')
    expect(moduleStyles).not.toContain('#root *')
  })

  test('pins canonical foundation values and primitives without compatibility fallbacks', () => {
    expect(foundationTokens).toContain('Source digest: 6f723015c258a1b30bee5824a8735fbc01ec53c4feee006fcaa7f165b8d6b05c')
    expect(foundationTokens).toContain('--suite-color-accent: #b84f1e')
    expect(foundationTokens).toContain('--suite-header-height: 3.5rem')
    expect(foundationTokens).toContain('--suite-content-max: 92rem')
    expect(foundationTokens).not.toMatch(/var\(--suite-[^)]*,/)
    expect(foundationPrimitives).toContain('.suite-button')
    expect(foundationPrimitives).toContain('.suite-dialog')
    expect(foundationPrimitives).toContain('.suite-input')
  })

  test('keeps standalone document ownership separate from module CSS', () => {
    expect(standaloneStyles).toContain('html,')
    expect(standaloneStyles).toContain('#root')
    expect(moduleStyles).not.toContain('registerSW')
  })
})
