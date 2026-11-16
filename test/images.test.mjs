// 测试锚点: R-01-012/AC-03 R-01-012/AC-06
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { IMAGE_MEDIA_TYPES, imageDataUrl, resolveEmbeddedImages } from '../src/images.mjs'

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
    [entry([imagePart(), imagePart()]), entry([imagePart({ attachmentId: 'https://example.com/a.png' })])],
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
