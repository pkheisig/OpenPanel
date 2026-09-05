import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

const moduleStyles = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')
const standaloneStyles = readFileSync(new URL('../src/standalone/standalone.css', import.meta.url), 'utf8')

describe('OpenSuite UI contract boundary', () => {
  test('keeps reusable foundation styles inside the module root', () => {
    expect(moduleStyles).toContain('@layer reset, foundation, primitives, shell;')
    expect(moduleStyles).toContain('.openpanel-module-root')
    expect(moduleStyles).not.toMatch(/(^|\n)\s*(html|body|#root|:root)\s*[{,:]/)
    expect(moduleStyles).not.toContain('body:has(')
    expect(moduleStyles).not.toContain('#root *')
  })

  test('keeps standalone document ownership separate from module CSS', () => {
    expect(standaloneStyles).toContain('html,')
    expect(standaloneStyles).toContain('#root')
    expect(moduleStyles).not.toContain('registerSW')
  })
})
