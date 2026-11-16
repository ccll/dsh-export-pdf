// 测试锚点: R-01-003/AC-01 R-01-011/AC-06
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { pdfFilename } from '../src/naming.mjs'

test('文件名取会话标识前 8 位，并去掉 session- 公共前缀', () => {
  assert.equal(pdfFilename('1b9b2ef9-13be-47a9-ac78-17248553017f'), 'dsh-session-1b9b2ef9.pdf')
  assert.equal(pdfFilename('session-1b9b2ef9-13be-47a9-ac78-17248553017f'), 'dsh-session-1b9b2ef9.pdf')
  assert.equal(pdfFilename('abc'), 'dsh-session-abc.pdf')
  assert.equal(pdfFilename('session-'), 'dsh-session-session-.pdf')
  assert.equal(pdfFilename('session-1b9b2ef9-13be-47a9-ac78-17248553017f', ['tools']), 'dsh-session-1b9b2ef9-tools.pdf')
  assert.equal(pdfFilename('session-1b9b2ef9-13be-47a9-ac78-17248553017f', ['attachments']), 'dsh-session-1b9b2ef9-attachments.pdf')
  assert.equal(pdfFilename('session-1b9b2ef9-13be-47a9-ac78-17248553017f', ['attachments', 'tools']), 'dsh-session-1b9b2ef9-tools-attachments.pdf')
  assert.equal(pdfFilename('abc', []), 'dsh-session-abc.pdf')
})
