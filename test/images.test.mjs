// 测试锚点: R-01-012/AC-03 R-01-012/AC-06 R-01-012/AC-07
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  IMAGE_MEDIA_TYPES,
  imageDataUrl,
  localImagePath,
  resolveEmbeddedImages,
  resolveMarkdownImages,
  sniffImageMediaType,
} from '../src/images.mjs'

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const REF = { attachmentId: 'sha256:img', mediaType: 'image/png', bytes: PNG.byteLength }
const imagePart = (ref = REF) => ({ type: 'image', attachment: ref })
const entry = (parts) => ({ kind: 'user', seq: 1, text: '', parts })

test('图片字节编码为白名单 data URI', () => {
  assert.deepEqual(IMAGE_MEDIA_TYPES, ['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
  assert.match(imageDataUrl(PNG, 'image/png'), /^data:image\/png;base64,[A-Za-z0-9+/=]+$/)
  assert.throws(() => imageDataUrl(new Uint8Array(), 'image/png'), /图片字节为空/)
  assert.throws(() => imageDataUrl(PNG, 'text/html'), /图片媒体类型不受支持/)
})

test('图片引用解析为 data URI，文本与图片分段顺序保持', async () => {
  let reads = 0
  const result = await resolveEmbeddedImages(
    [entry([{ type: 'text', text: '看图' }, imagePart(), { type: 'text', text: '后续' }])],
    {
      readImage: async (ref) => {
        reads += 1
        assert.equal(ref.attachmentId, REF.attachmentId)
        return { data: PNG, ref }
      },
    },
  )
  assert.equal(reads, 1)
  assert.equal(result[0].parts[0].text, '看图')
  assert.equal(result[0].parts[1].type, 'image')
  assert.match(result[0].parts[1].dataUrl, /^data:image\/png;base64,/)
  assert.equal(result[0].parts[2].text, '后续')
  assert.equal(result[0].text, '看图\n后续')
})

test('同一附件只读取一次，不读取无引用的外部地址', async () => {
  let reads = 0
  const result = await resolveEmbeddedImages(
    [entry([imagePart(), imagePart()]), entry([imagePart({ attachmentId: 'https://example.com/a.png', mediaType: 'image/png', bytes: 1 })])],
    {
      readImage: async () => {
        reads += 1
        return { data: PNG, ref: REF }
      },
    },
  )
  assert.equal(reads, 1, '相同 attachmentId 去重')
  assert.equal(result[1].parts[0].text, '[图片]', '没有 durable 引用的外部地址回退占位')
})

test('附件读取失败或形态非法时回退占位并记录日志', async () => {
  const logged = []
  const result = await resolveEmbeddedImages([entry([imagePart(), imagePart({ mediaType: 'text/html' })])], {
    readImage: async () => {
      throw new Error('附件不存在')
    },
    logError: (message) => logged.push(message),
  })
  assert.deepEqual(result[0].parts.map((part) => part.text), ['[图片]', '[图片]'])
  assert.equal(result[0].text, '[图片]\n[图片]')
  assert.ok(logged.length >= 1)
  assert.ok(!JSON.stringify(logged).includes('/home/'))
})

test('没有图片分段时原样返回，不调用附件服务', async () => {
  const source = { kind: 'assistant', seq: 1, text: '纯文本' }
  let reads = 0
  const result = await resolveEmbeddedImages([source], { readImage: async () => { reads += 1; return { data: PNG, ref: REF } } })
  assert.deepEqual(result, [source])
  assert.equal(reads, 0)
})

const PNG_HEADER = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00])
const JPEG_HEADER = new Uint8Array([0xff, 0xd8, 0xff, 0xe0])
const GIF_HEADER = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x00])
const WEBP_HEADER = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50])

test('图片媒体类型按字节嗅探，扩展名只做读取前筛选', () => {
  assert.equal(sniffImageMediaType(PNG_HEADER), 'image/png')
  assert.equal(sniffImageMediaType(JPEG_HEADER), 'image/jpeg')
  assert.equal(sniffImageMediaType(GIF_HEADER), 'image/gif')
  assert.equal(sniffImageMediaType(WEBP_HEADER), 'image/webp')
  assert.equal(sniffImageMediaType(new TextEncoder().encode('<html>')), undefined)
  assert.equal(sniffImageMediaType(new Uint8Array()), undefined)
  assert.equal(sniffImageMediaType('data'), undefined)

  assert.equal(localImagePath('/tmp/图.PNG'), '/tmp/图.PNG')
  assert.equal(localImagePath('/tmp/a.jpeg?x=1#frag'), '/tmp/a.jpeg')
  assert.equal(localImagePath('/tmp/%E5%9B%BE.webp'), '/tmp/图.webp')
  assert.equal(localImagePath('</tmp/a.png>'), '/tmp/a.png')
  assert.equal(localImagePath('C:\\shots\\a.gif'), 'C:\\shots\\a.gif')
  assert.equal(localImagePath('./rel/a.png'), './rel/a.png')
  assert.equal(localImagePath('https://evil.invalid/a.png'), undefined)
  assert.equal(localImagePath('//host/a.png'), undefined)
  assert.equal(localImagePath('file:///tmp/a.png'), undefined)
  assert.equal(localImagePath('data:image/png;base64,AAAA'), undefined)
  assert.equal(localImagePath('/tmp/notes.txt'), undefined)
  assert.equal(localImagePath(''), undefined)
})

test('Markdown 本地图片解析为 data URI，按地址去重且不读远程地址', async () => {
  const reads = []
  const images = await resolveMarkdownImages(
    [
      entry([{ type: 'text', text: '前 ![一](/tmp/a.png) 中 ![一](/tmp/a.png)' }]),
      { kind: 'assistant', seq: 2, text: '后 ![远程](https://evil.invalid/b.png) ![二](/tmp/b.png)' },
    ],
    {
      readLocalImage: async (path, options) => {
        reads.push({ path, options })
        return PNG_HEADER
      },
    },
  )
  assert.deepEqual(reads.map((read) => read.path), ['/tmp/a.png', '/tmp/b.png'])
  assert.deepEqual([...images.keys()], ['/tmp/a.png', '/tmp/b.png'])
  assert.match(images.get('/tmp/a.png'), /^data:image\/png;base64,/)
})

test('本地图片读取失败、非图片字节或相对路径无工作区时跳过并记录日志', async () => {
  const logs = []
  const reads = []
  const images = await resolveMarkdownImages([entry([{ type: 'text', text: '![坏](/tmp/bad.png) ![文本](/tmp/a.txt) ![相对](a.png)' }])], {
    readLocalImage: async (path) => {
      reads.push(path)
      if (path === '/tmp/bad.png') throw new Error('ENOENT')
      return new TextEncoder().encode('<html>')
    },
    logError: (message, error) => logs.push({ message, error: String(error) }),
  })
  assert.deepEqual(reads, ['/tmp/bad.png'], '非图片扩展名与无工作区的相对路径不读取')
  assert.equal(images.size, 0)
  assert.ok(logs.length >= 1)
  assert.ok(logs.every((log) => !log.message.includes('/tmp/')), '日志只带文件名，不带路径')
})

test('相对路径按会话工作区读取', async () => {
  const reads = []
  const images = await resolveMarkdownImages([{ kind: 'assistant', seq: 1, text: '![图](shots/a.png)' }], {
    readLocalImage: async (path, options) => {
      reads.push({ path, options })
      return PNG_HEADER
    },
    cwd: '/home/cailei/work',
  })
  assert.deepEqual(reads, [{ path: 'shots/a.png', options: { cwd: '/home/cailei/work' } }])
  assert.equal(images.size, 1)
})

test('没有本地图片读取器时返回空索引，不报错', async () => {
  const images = await resolveMarkdownImages([{ kind: 'assistant', seq: 1, text: '![图](/tmp/a.png)' }], {})
  assert.equal(images.size, 0)
})
