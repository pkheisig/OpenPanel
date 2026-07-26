import assert from 'node:assert/strict'
import test from 'node:test'
import {
  appletCacheKey,
  clearAppletDataCache,
  loadCachedAppletData,
  setCachedAppletData,
} from './appletDataCache.ts'

test('deduplicates applet loads for the same project revision', async () => {
  clearAppletDataCache()
  const key = appletCacheKey('matrix', '/project', 'revision-1', 'matrix.csv')
  let calls = 0
  const loader = async () => {
    calls += 1
    return { rows: 4 }
  }
  const [first, second] = await Promise.all([
    loadCachedAppletData(key, loader),
    loadCachedAppletData(key, loader),
  ])
  assert.equal(calls, 1)
  assert.equal(first, second)
})

test('replaces stale entries within a project data group', async () => {
  clearAppletDataCache()
  const oldKey = appletCacheKey('gating', '/project', 'revision-1', 10000)
  const newKey = appletCacheKey('gating', '/project', 'revision-2', 10000)
  const group = appletCacheKey('gating', '/project')
  await loadCachedAppletData(oldKey, async () => 'old', group)
  await loadCachedAppletData(newKey, async () => 'new', group)
  let reloaded = false
  await loadCachedAppletData(oldKey, async () => {
    reloaded = true
    return 'old-again'
  }, group)
  assert.equal(reloaded, true)
})

test('allows a saved payload to replace a cached response', async () => {
  clearAppletDataCache()
  const key = appletCacheKey('matrix', '/project', 'matrix.csv')
  setCachedAppletData(key, ['saved'])
  assert.deepEqual(await loadCachedAppletData(key, async () => ['stale']), ['saved'])
})

test('an aborted cached load is retried with the next consumer loader', async () => {
  clearAppletDataCache()
  const key = appletCacheKey('gating', '/project', 'revision-1', 50000)
  const firstController = new AbortController()
  let firstCalls = 0
  let retryCalls = 0
  const first = loadCachedAppletData(key, () => {
    firstCalls += 1
    return new Promise((resolve, reject) => {
      firstController.signal.addEventListener(
        'abort',
        () => reject(new DOMException('Aborted', 'AbortError')),
        { once: true },
      )
      setTimeout(() => resolve('stale'), 25)
    })
  })
  firstController.abort()
  const second = loadCachedAppletData(key, async () => {
    retryCalls += 1
    return 'ready'
  })

  const settled = await Promise.allSettled([first, second])
  assert.equal(firstCalls, 1)
  assert.equal(retryCalls, 1)
  assert.equal(settled[0]?.status, 'rejected')
  assert.deepEqual(settled[1], { status: 'fulfilled', value: 'ready' })
})

test('failed loads are evicted and ordinary cached errors propagate', async () => {
  clearAppletDataCache()
  const key = appletCacheKey('failed')
  let calls = 0
  await assert.rejects(loadCachedAppletData(key, async () => {
    calls += 1
    throw new Error('failed')
  }), /failed/)
  await assert.rejects(loadCachedAppletData(key, async () => {
    calls += 1
    throw new Error('failed again')
  }), /failed again/)
  assert.equal(calls, 2)

  const cachedErrorKey = appletCacheKey('cached-error')
  let rejectShared
  const shared = loadCachedAppletData(cachedErrorKey, () => new Promise((_resolve, reject) => {
    rejectShared = reject
  }))
  const consumer = loadCachedAppletData(cachedErrorKey, async () => 'unused')
  rejectShared(new Error('shared failure'))
  await assert.rejects(shared, /shared failure/)
  await assert.rejects(consumer, /shared failure/)
})

test('a displaced aborted entry does not delete its replacement', async () => {
  clearAppletDataCache()
  const key = appletCacheKey('displaced-abort')
  let rejectShared
  const first = loadCachedAppletData(key, () => new Promise((_resolve, reject) => {
    rejectShared = reject
  }))
  clearAppletDataCache()
  setCachedAppletData(key, 'replacement')
  rejectShared(new DOMException('Aborted', 'AbortError'))
  await assert.rejects(first, { name: 'AbortError' })
  assert.equal(await loadCachedAppletData(key, async () => 'unused'), 'replacement')
})

test('cache groups replace saved siblings and evict the least-recent entry', async () => {
  clearAppletDataCache()
  const group = appletCacheKey('group')
  setCachedAppletData(appletCacheKey('group', 1), 1, group)
  setCachedAppletData(appletCacheKey('group', 2), 2, group)
  let siblingReloaded = false
  await loadCachedAppletData(appletCacheKey('group', 1), async () => {
    siblingReloaded = true
    return 1
  }, group)
  assert.equal(siblingReloaded, true)

  clearAppletDataCache()
  const oldest = appletCacheKey('entry', 0)
  for (let index = 0; index < 13; index += 1) {
    await loadCachedAppletData(appletCacheKey('entry', index), async () => index)
  }
  let oldestReloaded = false
  await loadCachedAppletData(oldest, async () => {
    oldestReloaded = true
    return 0
  })
  assert.equal(oldestReloaded, true)

  clearAppletDataCache()
  for (let index = 0; index < 13; index += 1) {
    await loadCachedAppletData(index, async () => index)
  }
})
