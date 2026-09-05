import assert from 'node:assert/strict'
import path from 'node:path'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { JSDOM } from 'jsdom'

const packageArgument = process.argv[2]
if (!packageArgument) throw new Error('usage: node module-consumer/consumer.mjs <packed-module-directory>')
const packageRoot = path.resolve(packageArgument)
const manifest = JSON.parse(await readFile(path.join(packageRoot, 'opensuite-module.json'), 'utf8'))
assert.equal(manifest.id, 'openpanel')
assert.match(manifest.sourceCommit, /^[0-9a-f]{40}$/)
assert.equal(manifest.entrypoints.application, './openpanel.js')
assert.equal(manifest.entrypoints.stylesheet, './openpanel.css')

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://consumer.invalid/host/' })
function installGlobal(name, value) {
  Object.defineProperty(globalThis, name, { configurable: true, enumerable: true, writable: true, value })
}
for (const [name, value] of Object.entries({
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement,
  Element: dom.window.Element,
  Node: dom.window.Node,
  MutationObserver: dom.window.MutationObserver,
  getComputedStyle: dom.window.getComputedStyle,
})) installGlobal(name, value)
dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
installGlobal('matchMedia', dom.window.matchMedia)

const moduleUrl = pathToFileURL(path.join(packageRoot, 'openpanel.js')).href
const openPanel = await import(moduleUrl)
assert.equal(typeof openPanel.createOpenPanelModule, 'function')
openPanel.validateOpenPanelApplicationManifest(manifest)
const services = {
  storage: { getItem: () => null, setItem: () => true, removeItem: () => undefined },
  projects: {
    listPanelProjects: async () => [],
    loadLastPanelProject: async () => null,
    createPanelProject: async () => { throw new Error('unused') },
    savePanelProject: async () => { throw new Error('unused') },
    saveActiveProject: async () => undefined,
    renamePanelProject: async () => null,
    duplicatePanelProject: async () => null,
    archivePanelProject: async () => null,
    restorePanelProject: async () => null,
    deletePanelProject: async () => undefined,
    setActivePanelProject: () => undefined,
  },
  files: {
    openTextFile: async () => null,
    readTextFileWithinLimit: async () => '',
    saveBlob: async () => undefined,
  },
  theme: { read: () => 'light', save: () => undefined },
  assets: { resolveDataUrl: (filename) => `https://consumer.invalid/module/data/${filename}`, loadText: async () => '' },
}
const container = document.createElement('section')
document.body.appendChild(container)
const module = openPanel.createOpenPanelModule(services)
module.mount(container, { mode: 'embedded', projectId: 'external-consumer' })
await new Promise((resolve) => setTimeout(resolve, 30))
assert.ok(container.querySelector('[data-openpanel-module-root="true"]'))
module.unmount()
assert.equal(container.childElementCount, 0)
process.stdout.write('external module consumer passed\n')
