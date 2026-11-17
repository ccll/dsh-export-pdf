import { markdownImageSources } from './markdown.mjs'
import { partsText } from './transcript.mjs'

/** 可嵌入 PDF 的图片媒体类型；与 DSH 附件准入的白名单一致。 */
export const IMAGE_MEDIA_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

/** 消息正文里可直接读取的本地图片扩展名；只做读取前的廉价筛选，权威判定看字节嗅探。 */
export const LOCAL_IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif']

/**
 * 把已校验的图片字节编码为 data URI。只接受白名单媒体类型与非空字节，
 * 避免把任意附件当成可渲染图片塞进 HTML。
 * @param {unknown} data 图片字节
 * @param {unknown} mediaType 媒体类型
 * @returns {string}
 */
export function imageDataUrl(data, mediaType) {
  if (!(data instanceof Uint8Array) || data.byteLength === 0) throw new Error('图片字节为空')
  if (typeof mediaType !== 'string' || !IMAGE_MEDIA_TYPES.includes(mediaType)) throw new Error('图片媒体类型不受支持')
  return `data:${mediaType};base64,${Buffer.from(data).toString('base64')}`
}

/**
 * 把转录条目里的图片引用解析成内联 data URI；单张失败时回退 `[图片]`，
 * 不中断其它图片或整份导出。只读取条目中的 durable 引用，不按 URL 抓取。
 * @param {readonly any[]} entries 转录条目
 * @param {{ readImage?: (ref: any) => Promise<{ data: Uint8Array, ref?: any } | any>, logError?: (message: string, error: unknown) => void }} deps
 * @returns {Promise<any[]>}
 */
export async function resolveEmbeddedImages(entries, deps = {}) {
  const readImage = deps.readImage
  const logError = deps.logError ?? (() => {})
  const cache = new Map()

  const read = async (ref) => {
    const id = ref?.attachmentId
    // durable 引用不是路径或 URL；显式拒绝带协议、绝对路径与反斜杠的值，
    // 保证插件不会把日志里的任意字符串交给附件服务或外部读取。
    const validId = typeof id === 'string' && id !== '' && !id.includes('://') && !id.startsWith('/') && !id.includes('\\')
    if (!validId || !IMAGE_MEDIA_TYPES.includes(ref?.mediaType) || !(ref?.bytes > 0)) {
      throw new Error('图片附件引用非法')
    }
    if (!(typeof readImage === 'function')) throw new Error('附件读取服务不可用')
    if (cache.has(id)) return cache.get(id)
    const promise = Promise.resolve(readImage(ref)).then((stored) => {
      const mediaType = stored?.ref?.mediaType ?? ref.mediaType
      return imageDataUrl(stored?.data, mediaType)
    })
    cache.set(id, promise)
    return promise
  }

  return Promise.all(
    entries.map(async (entry) => {
      if (!Array.isArray(entry.parts) || !entry.parts.some((part) => part?.type === 'image')) return entry
      const parts = []
      for (const part of entry.parts) {
        if (part?.type !== 'image') {
          parts.push(part)
          continue
        }
        try {
          parts.push({ type: 'image', attachment: part.attachment, dataUrl: await read(part.attachment) })
        } catch (error) {
          logError('读取图片附件失败，回退占位', error)
          parts.push({ type: 'text', text: '[图片]' })
        }
      }
      return { ...entry, parts, text: partsText(parts) }
    }),
  )
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff]
const GIF_SIGNATURES = [
  [0x47, 0x49, 0x46, 0x38, 0x37, 0x61],
  [0x47, 0x49, 0x46, 0x38, 0x39, 0x61],
]
const RIFF_SIGNATURE = [0x52, 0x49, 0x46, 0x46]
const WEBP_SIGNATURE = [0x57, 0x45, 0x42, 0x50]

/**
 * 按字节头嗅探真实图片媒体类型。扩展名只做读取前的筛选，权威判定看字节，
 * 避免把非图片内容声明成图片塞进 HTML。
 * @param {unknown} data 图片字节
 * @returns {'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif' | undefined}
 */
export function sniffImageMediaType(data) {
  if (!(data instanceof Uint8Array) || data.byteLength === 0) return undefined
  if (startsWithBytes(data, PNG_SIGNATURE)) return 'image/png'
  if (startsWithBytes(data, JPEG_SIGNATURE)) return 'image/jpeg'
  if (GIF_SIGNATURES.some((signature) => startsWithBytes(data, signature))) return 'image/gif'
  if (startsWithBytes(data, RIFF_SIGNATURE) && startsWithBytes(data, WEBP_SIGNATURE, 8)) return 'image/webp'
  return undefined
}

/**
 * Markdown 图片地址对应的可读取本地路径；协议地址、远程地址与非图片扩展名返回
 * undefined，让调用方回退占位。查询串与片段按浏览器语义剥离，URL 转义解码一次。
 * @param {unknown} href Markdown 图片地址
 * @returns {string | undefined}
 */
export function localImagePath(href) {
  let value = String(href ?? '').trim()
  // CommonMark 允许用尖括号包住目标地址（含空格时常用这种写法），先去掉包裹。
  if (value.startsWith('<') && value.endsWith('>')) value = value.slice(1, -1).trim()
  if (value === '') return undefined
  // Windows 盘符形如 `C:\…`，不能按协议前缀拒掉；其余形如 `scheme:` 与 `//host` 的地址一律不读。
  if (!/^[A-Za-z]:[\\/]/.test(value) && (/^\/\//.test(value) || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(value))) return undefined
  value = value.split(/[?#]/)[0] ?? ''
  if (value === '') return undefined
  let decoded
  try {
    decoded = decodeURIComponent(value)
  } catch {
    decoded = value
  }
  const name = decoded.split(/[\\/]/).pop() ?? ''
  const extension = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : ''
  return LOCAL_IMAGE_EXTENSIONS.includes(extension) ? decoded : undefined
}

/**
 * 把消息正文里 Markdown 引用的本地图片解析成内联 data URI，按原始地址建索引，
 * 交给渲染层替换占位文字。单张失败时记录日志并跳过，不中断整份导出；
 * http、https 等远程地址不读取。相对路径只在知道会话工作区时读取。
 * @param {readonly any[]} entries 转录条目
 * @param {{
 *   readLocalImage?: (path: string, options: { cwd?: string }) => Promise<Uint8Array>,
 *   cwd?: string,
 *   logError?: (message: string, error: unknown) => void,
 * }} deps
 * @returns {Promise<Map<string, string>>}
 */
export async function resolveMarkdownImages(entries, deps = {}) {
  const readLocalImage = deps.readLocalImage
  const logError = deps.logError ?? (() => {})
  const cwd = typeof deps.cwd === 'string' && deps.cwd !== '' ? deps.cwd : undefined
  const images = new Map()
  if (typeof readLocalImage !== 'function') return images

  const pending = new Map()
  for (const text of markdownTexts(entries)) {
    for (const href of markdownImageSources(text)) {
      if (pending.has(href)) continue
      const path = localImagePath(href)
      if (path === undefined) continue
      if (!isAbsoluteLocalPath(path) && cwd === undefined) continue
      pending.set(href, readLocalImageDataUrl(path, { readLocalImage, cwd, logError }))
    }
  }
  for (const [href, promise] of pending) {
    const dataUrl = await promise
    if (dataUrl !== undefined) images.set(href, dataUrl)
  }
  return images
}

async function readLocalImageDataUrl(path, { readLocalImage, cwd, logError }) {
  try {
    const data = await readLocalImage(path, { cwd })
    const mediaType = sniffImageMediaType(data)
    if (mediaType === undefined) throw new Error('图片字节不受支持')
    return imageDataUrl(data, mediaType)
  } catch (error) {
    logError(`读取本地图片失败，回退占位（${localImageLabel(path)}）`, error)
    return undefined
  }
}

function markdownTexts(entries) {
  const texts = []
  for (const entry of entries ?? []) {
    if (Array.isArray(entry?.parts)) {
      for (const part of entry.parts) {
        if (part?.type === 'text' && typeof part.text === 'string') texts.push(part.text)
      }
    } else if (typeof entry?.text === 'string') {
      texts.push(entry.text)
    }
  }
  return texts
}

function isAbsoluteLocalPath(path) {
  return /^(?:\/|[A-Za-z]:[\\/])/.test(path)
}

function localImageLabel(path) {
  return String(path).split(/[\\/]/).pop() || '(未命名)'
}

function startsWithBytes(data, expected, offset = 0) {
  if (data.byteLength < offset + expected.length) return false
  for (let index = 0; index < expected.length; index += 1) {
    if (data[offset + index] !== expected[index]) return false
  }
  return true
}
