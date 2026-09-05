import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import postcss, { type Rule } from 'postcss'

const packageMetadata = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string
}
const moduleRoot = '[data-openpanel-module-root]'
const moduleRootClass = '.openpanel-module-root'

function sourceCommit(): string {
  const configured = process.env.VITE_GIT_COMMIT_SHA || process.env.GITHUB_SHA
  if (configured) return configured
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  } catch {
    return 'dev'
  }
}

function scopeSelector(selector: string): string {
  const trimmed = selector.trim()
  if (!trimmed || trimmed.startsWith(`${moduleRoot}`)) return trimmed
  if (trimmed.startsWith(moduleRootClass)) return `${moduleRoot}${trimmed.slice(moduleRootClass.length)}`
  if (trimmed === '#root' || trimmed === 'html' || trimmed === 'body' || trimmed === ':root' || trimmed === ':host') return moduleRoot
  if (trimmed.startsWith('#root')) return `${moduleRoot}${trimmed.slice('#root'.length)}`
  if (/^(html|body|:root|:host)(?=$|[.#:[\s>+~])/.test(trimmed)) {
    return `${moduleRoot}${trimmed.replace(/^(html|body|:root|:host)/, '')}`
  }
  return `${moduleRoot} ${trimmed}`
}

function isKeyframesRule(rule: Rule): boolean {
  let parent = rule.parent
  while (parent) {
    if (parent.type === 'atrule' && parent.name && /keyframes$/i.test(parent.name)) return true
    parent = parent.parent
  }
  return false
}

function scopeModuleStyles(): Plugin {
  return {
    name: 'openpanel-scope-module-styles',
    async writeBundle(options) {
      const directory = options.dir ?? path.dirname(options.file ?? '')
      const stylesheetPath = path.join(directory, 'openpanel.css')
      const root = postcss.parse(await readFile(stylesheetPath, 'utf8'))
      root.walkRules((rule) => {
        if (isKeyframesRule(rule)) return
        rule.selectors = rule.selectors.map(scopeSelector)
      })
      await writeFile(stylesheetPath, root.toString())
    },
  }
}

const sourceSha = sourceCommit()

export default defineConfig({
  base: './',
  define: {
    'import.meta.env.VITE_GIT_COMMIT_SHA': JSON.stringify(sourceSha),
    'import.meta.env.VITE_MODULE_VERSION': JSON.stringify(packageMetadata.version),
  },
  plugins: [react(), tailwindcss(), scopeModuleStyles()],
  build: {
    outDir: 'dist-module/package',
    emptyOutDir: true,
    copyPublicDir: false,
    sourcemap: false,
    cssCodeSplit: false,
    lib: {
      entry: 'src/module/moduleEntry.ts',
      formats: ['es'],
      fileName: 'openpanel',
      cssFileName: 'openpanel',
    },
    rollupOptions: {
      external: (id) => (
        id === 'react'
        || id.startsWith('react/')
        || id === 'react-dom'
        || id.startsWith('react-dom/')
      ),
      output: {
        entryFileNames: 'openpanel.js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: (assetInfo) => assetInfo.name?.endsWith('.css')
          ? 'openpanel.css'
          : 'assets/[name]-[hash][extname]',
      },
    },
  },
})
