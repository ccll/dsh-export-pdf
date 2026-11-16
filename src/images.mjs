/** 可嵌入 PDF 的图片媒体类型；与 DSH 附件准入的白名单一致。 */
export const IMAGE_MEDIA_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

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
    if (typeof id !== 'string' || id === '' || !IMAGE_MEDIA_TYPES.includes(ref?.mediaType) || !(ref?.bytes > 0)) {
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
      const text = parts
        .filter((part) => part?.type === 'text' && typeof part.text === 'string')
        .map((part) => part.text)
        .join('\n')
        .trim()
      return { ...entry, parts, text }
    }),
  )
}
