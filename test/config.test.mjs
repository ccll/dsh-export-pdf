import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DEFAULT_EXPORT_TIMEOUT_MS, DEFAULT_MAX_CONCURRENT_RENDERS, DEFAULT_TIMEOUT_MS, normalizeConfig } from '../src/config.mjs'

test('缺省配置与 SOLUTION 的配置表一致', () => {
  assert.deepEqual(normalizeConfig(), {
    browserPath: '',
    timeoutMs: DEFAULT_TIMEOUT_MS,
    exportTimeoutMs: DEFAULT_EXPORT_TIMEOUT_MS,
    maxConcurrentRenders: DEFAULT_MAX_CONCURRENT_RENDERS,
  })
  assert.equal(DEFAULT_TIMEOUT_MS, 30_000)
  assert.equal(DEFAULT_EXPORT_TIMEOUT_MS, 120_000)
  assert.equal(DEFAULT_MAX_CONCURRENT_RENDERS, 2)
})

test('自定义配置被接受并去除浏览器路径空白', () => {
  assert.deepEqual(normalizeConfig({ browserPath: '  /usr/bin/chromium  ', timeoutMs: 5_000, exportTimeoutMs: 90_000, maxConcurrentRenders: 1 }), {
    browserPath: '/usr/bin/chromium',
    timeoutMs: 5_000,
    exportTimeoutMs: 90_000,
    maxConcurrentRenders: 1,
  })
})

test('非法配置在装载期直接报错，不静默回退', () => {
  assert.throws(() => normalizeConfig(null), /配置必须是对象/)
  assert.throws(() => normalizeConfig([]), /配置必须是对象/)
  assert.throws(() => normalizeConfig({ browserPath: 1 }), /browserPath 必须是字符串/)
  assert.throws(() => normalizeConfig({ timeoutMs: 0 }), /timeoutMs/)
  assert.throws(() => normalizeConfig({ timeoutMs: 1.5 }), /timeoutMs/)
  assert.throws(() => normalizeConfig({ timeoutMs: Number.MAX_SAFE_INTEGER }), /timeoutMs/)
  assert.throws(() => normalizeConfig({ exportTimeoutMs: 0 }), /exportTimeoutMs/)
  assert.throws(() => normalizeConfig({ exportTimeoutMs: 'soon' }), /exportTimeoutMs/)
  assert.throws(() => normalizeConfig({ timeoutMs: 30_000, exportTimeoutMs: 5_000 }), /不能小于 timeoutMs/)
  assert.deepEqual(normalizeConfig({ timeoutMs: 300_000 }), {
    browserPath: '',
    timeoutMs: 300_000,
    exportTimeoutMs: 300_000,
    maxConcurrentRenders: DEFAULT_MAX_CONCURRENT_RENDERS,
  })
  assert.throws(() => normalizeConfig({ maxConcurrentRenders: 0 }), /maxConcurrentRenders/)
  assert.throws(() => normalizeConfig({ maxConcurrentRenders: 99 }), /maxConcurrentRenders/)
})
