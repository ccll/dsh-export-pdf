// 测试锚点: R-01-006/AC-04
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isCjkFontFilename } from '../src/fonts.mjs'

test('常见中文字体文件名可被识别，含 Windows 与 Linux 的实际命名', () => {
  for (const name of [
    'NotoSansCJK-Regular.ttc',
    'SourceHanSansSC-Regular.otf',
    'PingFang.ttc',
    'STHeiti Light.ttc',
    'Songti.ttc',
    'simsun.ttc',
    'simhei.ttf',
    'msyh.ttc',
    'msyhbd.ttc',
    'msjh.ttc',
    'mingliu.ttc',
    'wqy-zenhei.ttc',
    'wqy-microhei.ttc',
    'DroidSansFallbackFull.ttf',
    'Hiragino Sans GB.ttc',
  ]) {
    assert.equal(isCjkFontFilename(name), true, `${name} 应识别为中文字体`)
  }
  for (const name of ['arial.ttf', 'DejaVuSans.ttf', 'msyh.txt', 'noto-sans-latin.otf']) {
    assert.equal(isCjkFontFilename(name), false, `${name} 不应识别为中文字体`)
  }
})
