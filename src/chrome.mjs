import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { delimiter, join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { BrowserUnavailableError, RenderFailedError } from './errors.mjs'
import { minimalBrowserEnv, runProcess } from './process.mjs'

/** PATH 探测顺序（SOLUTION#配置与可变点）。 */
export const BROWSER_PROBE_NAMES = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge']

const STDERR_DETAIL_MAX = 1_000

/**
 * 解析浏览器可执行文件。配置了路径却不可执行时明确失败；未配置时按
 * {@link BROWSER_PROBE_NAMES} 扫描 PATH。找不到返回 undefined，由调用方
 * 映射成 503。
 * @param {string} configured 配置的浏览器路径，空表示自动探测
 * @returns {Promise<string | undefined>}
 */
export async function resolveBrowserPath(configured) {
  if (configured !== '') {
    if (await isExecutable(configured)) return configured
    throw new BrowserUnavailableError(`配置的浏览器不可执行: ${configured}`)
  }
  const directories = (process.env.PATH ?? '').split(delimiter).filter((directory) => directory !== '')
  const names = process.platform === 'win32' ? BROWSER_PROBE_NAMES.flatMap((name) => [name, `${name}.exe`]) : BROWSER_PROBE_NAMES
  for (const name of names) {
    for (const directory of directories) {
      const candidate = join(directory, name)
      if (await isExecutable(candidate)) return candidate
    }
  }
  return undefined
}

async function isExecutable(candidate) {
  try {
    await access(candidate, process.platform === 'win32' ? constants.F_OK : constants.X_OK)
    return true
  } catch {
    return false
  }
}

/**
 * 调本机浏览器把一份 HTML 打印成 PDF。临时目录在成功、失败与超时三路
 * 都递归删除；产物必须是非零字节且以 `%PDF-` 开头。
 * @param {{ html: string, browserPath: string | undefined, timeoutMs: number }} options
 * @returns {Promise<Uint8Array>}
 */
export async function renderPdfWithBrowser({ html, browserPath, timeoutMs }) {
  if (browserPath === undefined || browserPath === '') throw new BrowserUnavailableError()
  const workDirectory = await mkdtemp(join(tmpdir(), 'dsh-export-pdf-'))
  try {
    const htmlPath = join(workDirectory, 'session.html')
    const pdfPath = join(workDirectory, 'session.pdf')
    const profileDirectory = join(workDirectory, 'browser-profile')
    await writeFile(htmlPath, html, 'utf8')

    const args = [
      '--headless',
      '--disable-gpu',
      '--disable-extensions',
      '--no-first-run',
      '--no-default-browser-check',
      '--no-pdf-header-footer',
      `--user-data-dir=${profileDirectory}`,
      `--print-to-pdf=${pdfPath}`,
      pathToFileURL(htmlPath).href,
    ]
    // root 运行的无头 Chrome 需要关闭沙箱；非 root 保持浏览器默认。
    if (process.getuid?.() === 0) args.push('--no-sandbox')

    const result = await runProcess(browserPath, args, {
      timeoutMs,
      env: minimalBrowserEnv(),
      cwd: workDirectory,
    })
    const detail = stderrDetail(result.stderr)
    if (result.spawnError !== undefined) {
      if (result.spawnError.code === 'ENOENT' || result.spawnError.code === 'EACCES') {
        throw new BrowserUnavailableError('浏览器无法启动')
      }
      throw new RenderFailedError('PDF 渲染失败', { detail: String(result.spawnError) })
    }
    if (result.timedOut) throw new RenderFailedError('PDF 渲染超时', { detail })
    if (result.code !== 0) throw new RenderFailedError('浏览器打印失败', { detail })

    let bytes
    try {
      bytes = await readFile(pdfPath)
    } catch (error) {
      throw new RenderFailedError('浏览器未产出 PDF', { detail: `${detail} ${String(error)}`.trim() })
    }
    if (bytes.byteLength === 0) throw new RenderFailedError('浏览器产出了空 PDF', { detail })
    if (!bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
      throw new RenderFailedError('浏览器产出的文件不是 PDF', { detail })
    }
    return new Uint8Array(bytes)
  } finally {
    await rm(workDirectory, { recursive: true, force: true }).catch(() => {
      // 清理失败不改变本次导出的结论；临时目录位于系统临时区，由 OS 兜底。
    })
  }
}

function stderrDetail(stderr) {
  const text = String(stderr ?? '').trim()
  if (text === '') return ''
  return text.split('\n').slice(0, 4).join(' | ').slice(0, STDERR_DETAIL_MAX)
}
