import { execFile, execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cp, mkdir, readFile, readdir, rm, utimes, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { build } from 'vite'

const execFileAsync = promisify(execFile)
const root = process.cwd()
const outputRoot = path.join(root, 'dist-module')
const packageRoot = path.join(outputRoot, 'package')

function sourceSha() {
  const configured = process.env.VITE_GIT_COMMIT_SHA || process.env.GITHUB_SHA
  if (configured) return configured
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function canonicalJson(value) {
  return JSON.stringify(value, Object.keys(value).sort())
}

async function filesUnder(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const relative = path.join(prefix, entry.name)
    const full = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await filesUnder(full, relative))
    else if (entry.isFile()) files.push(relative.split(path.sep).join('/'))
  }
  return files
}

async function recordFile(relative) {
  const bytes = await readFile(path.join(packageRoot, relative))
  return { path: `./${relative}`, bytes: bytes.byteLength, sha256: sha256(bytes) }
}

async function writeChecksums(directory, relativeFiles, output) {
  const records = await Promise.all(relativeFiles.sort().map(async (relative) => ({
    relative,
    digest: sha256(await readFile(path.join(directory, relative))),
  })))
  await writeFile(output, `${records.map(({ relative, digest }) => `${digest}  ${relative}`).join('\n')}\n`)
}

const versionMetadata = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
const source = sourceSha()
if (!/^[0-9a-f]{40}$/.test(source)) throw new Error(`source SHA must be a 40-character Git SHA, received ${source}`)
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(versionMetadata.version)) {
  throw new Error(`package version is not a release version: ${versionMetadata.version}`)
}

await rm(outputRoot, { recursive: true, force: true })
await mkdir(packageRoot, { recursive: true })
process.env.VITE_GIT_COMMIT_SHA = source
process.env.VITE_MODULE_VERSION = versionMetadata.version
await build({ configFile: path.join(root, 'vite.module.config.ts') })
await execFileAsync(path.join(root, 'node_modules/.bin/tsc'), ['-p', 'tsconfig.module.json'], { cwd: root })
await cp(path.join(root, 'public/data'), path.join(packageRoot, 'data'), { recursive: true })
await cp(path.join(root, 'LICENSE'), path.join(packageRoot, 'LICENSE'))
await cp(path.join(root, 'THIRD_PARTY_NOTICES.md'), path.join(packageRoot, 'THIRD_PARTY_NOTICES.md'))
await cp(path.join(root, 'README.md'), path.join(packageRoot, 'README.md'))
await writeFile(path.join(packageRoot, 'index.d.ts'), "export * from './types/module/moduleEntry'\n")

const packageLock = JSON.parse(await readFile(path.join(root, 'package-lock.json'), 'utf8'))
const dependencyNames = [...new Set([
  ...Object.keys(versionMetadata.dependencies || {}),
  ...Object.keys(versionMetadata.devDependencies || {}).filter((name) => ['react', 'react-dom'].includes(name)),
])]
const dependencies = dependencyNames.sort().map((name) => {
  const lockEntry = packageLock.packages?.[`node_modules/${name}`]
  if (!lockEntry?.version) throw new Error(`package-lock.json has no resolved entry for ${name}`)
  const identity = {
    name,
    version: lockEntry.version,
    ...(lockEntry.resolved ? { resolved: lockEntry.resolved } : {}),
    ...(lockEntry.integrity ? { integrity: lockEntry.integrity } : {}),
  }
  return {
    kind: 'npm',
    name,
    version: lockEntry.version,
    sha256: sha256(canonicalJson(identity)),
    role: ['react', 'react-dom'].includes(name) ? 'peer' : 'bundled',
  }
})
await writeFile(path.join(packageRoot, 'dependencies.json'), `${JSON.stringify({
  schemaVersion: 1,
  module: 'openpanel',
  sourceSha: source,
  dependencies,
}, null, 2)}\n`)

const allFilesBeforeManifests = await filesUnder(packageRoot)
const managedFiles = allFilesBeforeManifests.filter((relative) => (
  relative === 'openpanel.js'
  || relative === 'openpanel.css'
  || relative === 'index.d.ts'
  || relative.startsWith('assets/')
  || relative.startsWith('data/')
  || relative.startsWith('types/')
))
const assetFiles = await Promise.all(managedFiles.sort().map(recordFile))
await writeFile(path.join(packageRoot, 'asset-manifest.json'), `${JSON.stringify({
  schemaVersion: 1,
  module: 'openpanel',
  sourceSha: source,
  files: assetFiles,
  data: assetFiles.filter((file) => file.path.startsWith('./data/')),
}, null, 2)}\n`)

const integrity = {}
for (const [key, relative] of Object.entries({
  application: 'openpanel.js',
  stylesheet: 'openpanel.css',
  types: 'index.d.ts',
  assetManifest: 'asset-manifest.json',
  dependenciesManifest: 'dependencies.json',
})) {
  integrity[key] = { path: `./${relative}`, sha256: sha256(await readFile(path.join(packageRoot, relative))) }
}
const manifest = {
  schemaVersion: 1,
  id: 'openpanel',
  displayName: 'OpenPanel',
  moduleVersion: versionMetadata.version,
  sourceCommit: source,
  applicationContractVersion: '0.1.0-bootstrap',
  runtimeContractVersion: '0.1.0-bootstrap',
  uiContractVersion: '0.1.0-bootstrap',
  entrypoints: { application: './openpanel.js', stylesheet: './openpanel.css' },
  types: './index.d.ts',
  assetManifest: './asset-manifest.json',
  dependenciesManifest: './dependencies.json',
  artifactIntegrity: integrity,
  peerDependencies: { react: '^19.2.0', 'react-dom': '^19.2.0' },
  capabilities: ['projects', 'files', 'storage', 'theme', 'assets', 'navigation', 'lifecycle'],
  fileExtensions: ['.openpanel.json', '.json'],
}
await writeFile(path.join(packageRoot, 'opensuite-module.json'), `${JSON.stringify(manifest, null, 2)}\n`)

const packageJson = {
  name: '@opensuite/openpanel-module',
  version: versionMetadata.version,
  private: false,
  type: 'module',
  license: versionMetadata.license,
  main: './openpanel.js',
  module: './openpanel.js',
  types: './index.d.ts',
  exports: {
    '.': { types: './index.d.ts', import: './openpanel.js' },
    './style.css': './openpanel.css',
    './manifest': './opensuite-module.json',
    './assets': './asset-manifest.json',
  },
  peerDependencies: { react: '^19.2.0', 'react-dom': '^19.2.0' },
}
await writeFile(path.join(packageRoot, 'package.json'), `${JSON.stringify(packageJson, null, 2)}\n`)

const packageFiles = await filesUnder(packageRoot)
await writeChecksums(packageRoot, packageFiles.filter((relative) => relative !== 'SHA256SUMS'), path.join(packageRoot, 'SHA256SUMS'))
const artifactPath = path.join(outputRoot, `openpanel-module-${versionMetadata.version}.tgz`)
await execFileAsync('tar', ['-czf', artifactPath, '-C', packageRoot, '.'], { cwd: root })
const artifactBytes = await readFile(artifactPath)
await writeFile(path.join(outputRoot, 'release.json'), `${JSON.stringify({
  schemaVersion: 1,
  module: 'openpanel',
  version: versionMetadata.version,
  sourceSha: source,
  manifest: 'package/opensuite-module.json',
  artifact: path.basename(artifactPath),
  artifactSha256: sha256(artifactBytes),
}, null, 2)}\n`)
const rootFiles = await filesUnder(outputRoot)
await writeChecksums(outputRoot, rootFiles.filter((relative) => relative !== 'SHA256SUMS'), path.join(outputRoot, 'SHA256SUMS'))
await utimes(outputRoot, new Date(0), new Date(0))
process.stdout.write(`Built OpenPanel module ${versionMetadata.version} from ${source}: ${path.relative(root, artifactPath)}\n`)
