import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import test from 'node:test'

const execFileAsync = promisify(execFile)
const root = process.cwd()
const packageRoot = path.join(root, 'dist-module/package')

async function digest(relative) {
  return createHash('sha256').update(await readFile(path.join(packageRoot, relative))).digest('hex')
}

test('release package is self-consistent and externally mountable', async () => {
  const manifest = JSON.parse(await readFile(path.join(packageRoot, 'opensuite-module.json'), 'utf8'))
  const assets = JSON.parse(await readFile(path.join(packageRoot, 'asset-manifest.json'), 'utf8'))
  const dependencies = JSON.parse(await readFile(path.join(packageRoot, 'dependencies.json'), 'utf8'))
  const stylesheet = await readFile(path.join(packageRoot, 'openpanel.css'), 'utf8')
  assert.deepEqual(manifest.capabilities, ['projects', 'files', 'storage', 'theme', 'assets', 'navigation', 'lifecycle'])
  assert.match(manifest.sourceCommit, /^[0-9a-f]{40}$/)
  assert.equal(manifest.moduleVersion, '1.0.0')
  assert.equal(manifest.artifactIntegrity.application.sha256, await digest('openpanel.js'))
  assert.equal(manifest.artifactIntegrity.stylesheet.sha256, await digest('openpanel.css'))
  assert.equal(manifest.artifactIntegrity.assetManifest.sha256, await digest('asset-manifest.json'))
  assert.match(stylesheet, /\[data-openpanel-module-root\]/)
  assert.doesNotMatch(stylesheet, /(?:^|})\s*(?:html|body|:root)\b/)
  assert.doesNotMatch(stylesheet, /(?:^|})\s*#root\b/)
  assert.equal(assets.files.length, new Set(assets.files.map((file) => file.path)).size)
  assert.ok(assets.data.length > 0)
  for (const file of assets.files) assert.equal(file.sha256, await digest(file.path.slice(2)))
  assert.deepEqual(
    dependencies.dependencies.map((dependency) => `${dependency.kind}:${dependency.name}`),
    [...dependencies.dependencies].map((dependency) => `${dependency.kind}:${dependency.name}`).sort(),
  )
  const javascript = await readFile(path.join(packageRoot, 'openpanel.js'), 'utf8')
  assert.doesNotMatch(javascript, /virtual:pwa-register|staleChunkRecovery|\/src\//)
  await execFileAsync(process.execPath, ['module-consumer/consumer.mjs', packageRoot], { cwd: root })
})
