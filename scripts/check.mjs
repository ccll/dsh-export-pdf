// 快速检查入口：构建客户端 bundle 并校验产物契约、源码语法与包声明。
// 单元与集成测试由 `node --test test/*.test.mjs` 承载（package.json 的 test）。
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildClient, clientBundle } from './build-client.mjs'

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)))

async function main() {
  const outPath = await buildClient()
  const bundle = await readFile(outPath, 'utf8')
  const generated = await clientBundle()
  assert.equal(bundle, generated, 'client bundle 与构建函数输出一致')
  assert.ok(bundle.includes('window.__ModuleLoader__.load({'), 'bundle 使用宿主模块加载器包装')
  assert.ok(bundle.includes('id: "dsh-export-pdf"'), 'bundle id 与包名一致')
  assert.ok(bundle.includes('const React = require("react");'), 'bundle 从平台模块表取 React')
  assert.ok(bundle.includes('exports.apply = apply;'), 'bundle 暴露 apply')
  assert.ok(bundle.includes('exports.inject = inject;'), 'bundle 暴露 inject')
  assert.ok(!/^import\s/m.test(bundle), 'bundle 不得保留裸 ESM import')
  assert.ok(!/^export\s/m.test(bundle), 'bundle 不得保留 ESM export')

  const sourceFiles = (await readdir(join(repositoryRoot, 'src'))).filter((name) => name.endsWith('.mjs'))
  for (const file of sourceFiles) {
    execFileSync(process.execPath, ['--check', join(repositoryRoot, 'src', file)], { stdio: 'pipe' })
  }

  const manifest = JSON.parse(await readFile(join(repositoryRoot, 'package.json'), 'utf8'))
  assert.equal(manifest.name, 'dsh-export-pdf', '包名与 bundle id 一致')
  assert.equal(manifest.dsh.client.platform, 'web', '客户端平台为 web')
  assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml', '声明 bundle patch 入口')
  assert.equal(manifest.exports['./client'], './.dsh-plugin/client.js', 'client 导出指向构建产物')

  const patch = await readFile(join(repositoryRoot, 'cordis.patch.yml'), 'utf8')
  assert.ok(patch.includes('name: dsh-export-pdf'), 'patch 插入本包')

  console.log(`check: ok（${sourceFiles.length} 个源文件、client bundle ${bundle.length} 字节）`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
