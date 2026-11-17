import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/** 本模块所在目录；默认从这里读取渲染管线的源码。 */
const SOURCE_DIRECTORY = dirname(fileURLToPath(import.meta.url))

/**
 * 参与热加载的纯逻辑模块，按依赖顺序排列：后序模块可以引用前序模块的顶层声明。
 * `errors.mjs` 不在这里——错误类型必须与路由使用的类保持同一身份，否则
 * `instanceof` 映射会失效；生成模块改为从静态文件导入这些类。
 */
export const PIPELINE_MODULES = [
  'html.mjs',
  'selection.mjs',
  'naming.mjs',
  'markdown.mjs',
  'transcript.mjs',
  'images.mjs',
  'render.mjs',
  'exporter.mjs',
]

/** 管线对外的符号；宿主与路由都从这份清单取归一、命名与导出编排。 */
export const PIPELINE_EXPORTS = [
  'escapeHtml',
  'INCLUDE_TOKENS',
  'IMAGE_MODES',
  'normalizeInclude',
  'includeSuffix',
  'normalizeImageMode',
  'imageModeSuffix',
  'selectionKey',
  'pdfFilename',
  'renderMarkdown',
  'foldTranscript',
  'partsText',
  'IMAGE_MEDIA_TYPES',
  'renderTranscriptHtml',
  'createExporter',
]

/** 注入生成模块的错误类型名。 */
const ERROR_CLASSES = [
  'PdfExportError',
  'SessionUnavailableError',
  'SubagentExportError',
  'FontUnavailableError',
  'BrowserUnavailableError',
  'RenderFailedError',
]

const IMPORT_STATEMENT = /^\s*import\s/
const REEXPORT_STATEMENT = /^\s*export\s*\{[^}]*\}\s*from\s/
const EXPORT_DECLARATION = /^export\s+(?=(?:async\s+)?(?:function|const|let|var|class)\s)/gm
/** 生成模块的缓存文件保留窗口：只回收一小时前的旧版本，避免并发加载被误删。 */
const STALE_AFTER_MS = 60 * 60 * 1_000

/**
 * 去掉一个模块的 ESM 语法，把它变成可拼接的片段。只支持 import 声明、
 * export 声明与 `export { … } from` 再导出；遇到别的模块语法就报错，
 * 不让不支持的写法悄悄进入管线。
 * @param {string} name 模块文件名，用于报错定位
 * @param {string} text 模块源码
 * @returns {string}
 */
export function stripModuleSyntax(name, text) {
  const kept = []
  for (const line of text.split('\n')) {
    if (IMPORT_STATEMENT.test(line) || REEXPORT_STATEMENT.test(line)) continue
    kept.push(line)
  }
  const cleaned = kept.join('\n').replace(EXPORT_DECLARATION, '')
  const leftover = /^\s*(?:import|export)\s/m.exec(cleaned)
  if (leftover !== null) {
    throw new Error(`dsh-export-pdf: ${name} 含管线不支持的模块语法：${leftover[0].trim()}`)
  }
  return cleaned.trimEnd()
}

/**
 * 生成自包含的管线模块源码：拼接片段的函数声明共享同一作用域，
 * 错误类型从静态 errors.mjs 导入，末尾导出对外的符号清单。
 * @param {readonly (readonly [string, string])[]} sources 模块文件名与源码，按依赖顺序
 * @param {{ errorsUrl: string }} options errors.mjs 的 file URL
 * @returns {string}
 */
export function generatePipelineSource(sources, { errorsUrl }) {
  if (typeof errorsUrl !== 'string' || errorsUrl === '') {
    throw new Error('dsh-export-pdf: generatePipelineSource 需要 errorsUrl')
  }
  const fragments = sources.map(([name, text]) => stripModuleSyntax(name, text))
  const header = [
    '// 由 src/pipeline.mjs 按源码内容即时生成，请改 src/*.mjs。',
    `import { ${ERROR_CLASSES.join(', ')} } from ${JSON.stringify(errorsUrl)};`,
  ].join('\n')
  return `${header}\n\n${fragments.join('\n\n')}\n\nexport { ${PIPELINE_EXPORTS.join(', ')} };\n`
}

/**
 * 创建管线加载器。每个宿主实例持有一个，缓存与日志各自独立，互不串台。
 * 源码内容没变直接复用上次的模块；变了就生成一个新文件名的自包含模块并 import，
 * Node 的模块缓存因此不会命中旧代码。生成或加载失败时沿用上一版并记日志，
 * 只有从未成功过才把错误抛给调用方。
 * @param {{
 *   directory?: string,
 *   cacheDirectory?: string,
 *   logError?: (message: string, error: unknown) => void,
 * }} [options]
 * @returns {{ load: () => Promise<any> }}
 */
export function createPipelineLoader(options = {}) {
  const directory = options.directory ?? SOURCE_DIRECTORY
  const cacheDirectory = options.cacheDirectory ?? join(tmpdir(), 'dsh-export-pdf', `pid-${process.pid}`)
  const logError = options.logError ?? (() => {})
  let cached = null

  return {
    /**
     * 加载当前源码对应的渲染管线。
     * @returns {Promise<any>} 管线模块命名空间
     */
    async load() {
      try {
        const sources = await Promise.all(
          PIPELINE_MODULES.map(async (name) => [name, await readFile(join(directory, name), 'utf8')]),
        )
        const version = pipelineVersion(directory, sources)
        if (cached !== null && cached.version === version) return cached.api

        const source = generatePipelineSource(sources, { errorsUrl: pathToFileURL(join(directory, 'errors.mjs')).href })
        await mkdir(cacheDirectory, { recursive: true })
        const file = join(cacheDirectory, `pipeline-${version}.mjs`)
        await writeFile(file, source, 'utf8')
        const api = await import(pathToFileURL(file).href)
        cached = { version, api }
        await prunePipelineFiles(cacheDirectory, file).catch((error) => {
          logError('渲染管线旧版本清理失败', error)
        })
        return api
      } catch (error) {
        // 读源码、拼接、写临时文件与加载任一环节失败都沿用上一版；只有从未成功过才向外抛。
        if (cached !== null) {
          logError(`渲染管线加载失败，沿用上一版（${cached.version}）`, error)
          return cached.api
        }
        throw new Error('dsh-export-pdf: 渲染管线加载失败', { cause: error })
      }
    },
  }
}

/**
 * 只丢弃明显过期的生成文件：并发导出可能刚写好、还没 import 同一目录的文件，
 * 按时间窗口回收才不会把它删掉。
 * @param {string} directory 生成文件目录
 * @param {string} keep 本次要保留的文件
 */
async function prunePipelineFiles(directory, keep) {
  const keepName = basename(keep)
  const now = Date.now()
  for (const name of await readdir(directory)) {
    if (name === keepName || !/^pipeline-[0-9a-f]+\.mjs$/.test(name)) continue
    const path = join(directory, name)
    let stats
    try {
      stats = await stat(path)
    } catch (error) {
      // 并发清理把文件先删掉是正常的；其它 IO/权限错误冒泡到调用方的日志，不静默吞掉。
      if (error.code === 'ENOENT') continue
      throw error
    }
    if (now - stats.mtimeMs < STALE_AFTER_MS) continue
    await rm(path, { force: true })
  }
}

/**
 * 管线版本：源码目录、模块名与源码内容的 SHA-1 前缀。按内容取版本比按修改时间
 * 可靠，同一毫秒内保存两次等长内容也能区分；带上目录，避免不同副本互相复用。
 * @param {string} directory 源码目录
 * @param {readonly (readonly [string, string])[]} sources 模块文件名与源码
 * @returns {string}
 */
function pipelineVersion(directory, sources) {
  const hash = createHash('sha1')
  hash.update(`${directory}\u0002`)
  for (const [name, text] of sources) hash.update(`${name}\u0000${text}\u0001`)
  return hash.digest('hex').slice(0, 16)
}
