// 隔离 e2e 环境：mock LLM + 独立 $DSH_HOME + dsh web 随机端口。
//
// 流程：构建客户端 bundle → 启动 mock LLM → 创建临时 $DSH_HOME 与
// settings.yaml → 预置工作区 → `dsh plugin --profile web add` 以 link:
// 装入本仓库 → `dsh web --port 0 --no-open`。cleanup 终止 dsh web 进程组、
// 关闭 mock 并删除临时目录。所有写入都在临时目录内，不触碰用户的 web profile。
import { execFile as execFileCallback, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { startMockLlm } from './mock-llm.mjs'

const execFile = promisify(execFileCallback)
const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
// 优先用 devDependency 锁定的 DSH，避免落到用户全局安装（可能是被本地改过的构建）。
const localDsh = join(repositoryRoot, 'node_modules', '.bin', 'dsh')
const dsh = existsSync(localDsh) ? localDsh : 'dsh'
const BOOT_TIMEOUT_MS = 120_000
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** 环境性缺席（如 Chrome 不存在）的信号，由 runner 记为显式 SKIP。 */
export const E2E_SKIP = 'E2E_SKIP'

function settingsYaml(mockUrl) {
  return [
    'llm-deepseek:',
    `  baseURL: ${mockUrl}`,
    '  apiKeyEnv: DEEPSEEK_API_KEY',
    'agent-default-model:',
    '  provider: deepseek-official',
    '  model: deepseek-flash',
    'ui-onboarding:',
    '  welcomeNoticeVersion: "2026-08-13.1"',
    '',
  ].join('\n')
}

/** 预置工作区：隔离环境内建一个目录并登记为唯一工作区，免去 UI 选工作区步骤。 */
async function seedWorkspace(home) {
  const id = 'e2e-workspace'
  const path = join(home, 'workspace')
  await mkdir(path, { recursive: true })
  const now = new Date().toISOString()
  const storage = {
    unit: { name: 'workspace', version: 2 },
    global: { initialized: true, workspaceIds: [id], archivedSessionIds: [] },
    tables: { workspaces: { [id]: { path, title: 'e2e', sessionIds: [], createdAt: now, updatedAt: now } } },
  }
  await mkdir(join(home, 'storages'), { recursive: true })
  await writeFile(join(home, 'storages', 'workspace.json'), JSON.stringify(storage))
}

async function waitForUrl(web, webStderr) {
  return new Promise((resolve, reject) => {
    let buffer = ''
    const timer = setTimeout(() => reject(new Error(`dsh web 启动超时（${BOOT_TIMEOUT_MS}ms）：${buffer.slice(-500)}`)), BOOT_TIMEOUT_MS)
    web.stdout.on('data', (data) => {
      buffer += data
      const match = buffer.match(/dsh web: (http:\/\/\S+)/)
      if (match !== null) {
        clearTimeout(timer)
        resolve(match[1])
      }
    })
    web.once('exit', (code) => {
      clearTimeout(timer)
      reject(new Error(`dsh web 提前退出（code=${code}）：${buffer.slice(-500)}\n${webStderr.join('').slice(-1000)}`))
    })
  })
}

async function waitUntilServing(url) {  const deadline = Date.now() + BOOT_TIMEOUT_MS
  let lastStatus
  for (;;) {
    try {
      const probe = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(5_000) })
      lastStatus = probe.status
      if (probe.ok) return
      if (probe.status === 303) {
        const cookies = typeof probe.headers.getSetCookie === 'function' ? probe.headers.getSetCookie() : [probe.headers.get('set-cookie')].filter(Boolean)
        const pair = cookies[0]?.split(';')[0] ?? ''
        if (pair.includes('=')) {
          const withCookie = await fetch(new URL('./', url), { headers: { cookie: pair }, signal: AbortSignal.timeout(5_000) })
          lastStatus = withCookie.status
          if (withCookie.ok) return
        }
      }
    } catch {
      // 尚未就绪；继续轮询。
    }
    if (Date.now() > deadline) throw new Error(`dsh web 就绪轮询超时：${url}（最后 status=${lastStatus ?? '无响应'}）`)
    await sleep(250)
  }
}

/**
 * 启动一套隔离测试环境。
 * @param {{ pluginConfig?: Record<string, unknown> }} [options] pluginConfig 以
 * 用户 patch 覆盖 `export-pdf` 行，用于制造浏览器缺失等失败路径。
 * @returns {Promise<{ home: string, url: string, mock: Awaited<ReturnType<typeof startMockLlm>>, cleanup: () => Promise<void>, webStderr: string[] }>}
 */
export async function bootE2e({ pluginConfig } = {}) {
  await execFile(process.execPath, [join(repositoryRoot, 'scripts', 'build-client.mjs')], { cwd: repositoryRoot })
  const mock = await startMockLlm()
  const home = await mkdtemp(join(tmpdir(), 'dsh-export-pdf-e2e-'))
  await writeFile(join(home, 'settings.yaml'), settingsYaml(mock.url))
  await seedWorkspace(home)
  const env = { ...process.env, DSH_HOME: home, DEEPSEEK_API_KEY: 'e2e-mock-key' }

  let web
  const webStderr = []
  const cleanup = async () => {
    if (web !== undefined && web.exitCode === null) {
      try {
        process.kill(-web.pid, 'SIGTERM')
      } catch {
        web.kill('SIGTERM')
      }
      await Promise.race([
        new Promise((resolve) => web.once('exit', resolve)),
        new Promise((resolve) => setTimeout(resolve, 5_000)),
      ])
      if (web.exitCode === null) {
        try {
          process.kill(-web.pid, 'SIGKILL')
        } catch {
          web.kill('SIGKILL')
        }
      }
    }
    await mock.close()
    await rm(home, { recursive: true, force: true })
  }

  try {
    await execFile(dsh, ['plugin', '--profile', 'web', 'add', repositoryRoot], { env })
    if (pluginConfig !== undefined) {
      const patchPath = join(home, 'profiles', 'web', 'cordis.patch.yml')
      const existing = await readFile(patchPath, 'utf8')
      const rows = Object.entries(pluginConfig).map(([key, value]) => `    ${key}: ${JSON.stringify(value)}`)
      // 新 profile 的 patch 层是空数组 `[]`，不能直接在其后追加列表项。
      const base = existing.replace(/^\[\]\s*$/m, '').trimEnd()
      await writeFile(patchPath, `${base}\n- id: export-pdf\n  config:\n${rows.join('\n')}\n`)
    }
    web = spawn(dsh, ['web', '--port', '0', '--no-open'], { env, stdio: ['ignore', 'pipe', 'pipe'], detached: true })
    web.stderr.on('data', (data) => {
      webStderr.push(String(data))
      if (webStderr.length > 200) webStderr.shift()
    })
    const url = await waitForUrl(web, webStderr)
    await waitUntilServing(url)
    return { home, url, mock, cleanup, webStderr }
  } catch (error) {
    await cleanup()
    throw error
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const environment = await bootE2e()
  console.log(JSON.stringify({ url: environment.url, home: environment.home }, null, 2))
  const shutdown = async () => {
    await environment.cleanup()
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}
