// 测试锚点: R-01-006/AC-01 R-01-006/AC-02
// 失败路径：把 browserPath 配成不存在的文件，导出必须在渲染前给出页内可读
// 提示，不产生预览/下载，也不留下空文件；重试仍显式失败而不是空白。
export const boot = { pluginConfig: { browserPath: '/definitely/missing/dsh-pdf-browser' } }

import { clickPdfTab, openApp, sendHeroMessage, until, visibleText } from '../helpers.mjs'

const USER_TEXT = 'e2e:pdf 失败路径探针'
const ASSISTANT_TEXT = '导出探针回复：中文可读，包含标点与 12345。'

export default async function pdfFailure({ page, url, assert }) {
  await openApp(page, url)
  await sendHeroMessage(page, USER_TEXT)
  await until('助手回复出现', async () => visibleText(page, ASSISTANT_TEXT), 30_000)

  const headResponse = page.waitForResponse(
    (response) => response.url().includes('/api/session.pdf') && response.request().method() === 'HEAD',
    { timeout: 60_000 },
  )
  assert.equal(await clickPdfTab(page), true, '会话视图区应有 PDF 页签')
  const response = await headResponse
  assert.equal(response.status(), 503, '浏览器缺失应返回 503')

  const error = page.locator('.dxp-error').first()
  await error.waitFor({ timeout: 30_000 })
  const message = await error.textContent()
  assert.ok(message.includes('没有可用的浏览器'), `应显示浏览器缺失原因，实际：${message}`)
  assert.ok(!message.includes('/definitely/missing'), '不得回显配置路径')
  assert.equal(await page.locator('iframe[title="PDF 预览"]').count(), 0, '失败时不显示预览')
  const download = page.getByRole('button', { name: '下载 PDF' }).first()
  assert.equal(await download.count(), 1, '保留下载入口但不允许点击')
  assert.equal(await download.isDisabled(), true, '失败时下载不可用')

  const retry = page.getByRole('button', { name: '重试' }).first()
  assert.equal(await retry.count(), 1, '失败时提供重试')
  const retryResponse = page.waitForResponse(
    (response) => response.url().includes('/api/session.pdf') && response.request().method() === 'HEAD',
    { timeout: 30_000 },
  )
  await retry.click()
  assert.equal((await retryResponse).status(), 503, '重试仍返回 503')
  await until('重试后仍显示失败原因', async () => (await error.textContent()).includes('没有可用的浏览器'), 30_000)
}
