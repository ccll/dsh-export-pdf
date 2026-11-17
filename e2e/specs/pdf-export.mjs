import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { request as playwrightRequest } from 'playwright-core'
import { clickPdfTab, expectedPdfPrefix, newestSessionLog, openApp, sendHeroMessage, sessionLogDigest, until, visibleText } from '../helpers.mjs'

// 测试锚点: R-01-001/AC-01 R-01-001/AC-02 R-01-001/AC-03
//           R-01-002/AC-01 R-01-002/AC-02 R-01-002/AC-03
//           R-01-003/AC-01 R-01-003/AC-02 R-01-003/AC-03
//           R-01-004/AC-01 R-01-005/AC-01 R-01-005/AC-02
//           R-01-006/AC-03 R-01-007/AC-01 R-01-007/AC-02
//           R-01-008/AC-01 R-01-008/AC-02 R-01-011/AC-04 R-01-011/AC-06
//           R-01-012/AC-01 R-01-012/AC-05
//           R-01-013/AC-01 R-01-013/AC-02 R-01-013/AC-03 R-01-013/AC-04 R-01-013/AC-05
// 一次真实会话的 PDF 页：页签、生成中、预览、下载、A4/中文、只读、
// 无凭据拒绝与同源栅栏。
const PAGINATION_MARKER = '末段标记Z'
const USER_TEXT = `e2e:pdf 中文导出探针 ${'中文分页探针，用于验证页内预览与下载覆盖全部页面。'.repeat(120)} ${PAGINATION_MARKER}`
const ASSISTANT_TEXT = '导出探针回复：中文可读，包含标点与 12345。'
const FOREIGN_ORIGIN = 'http://evil.invalid'

function hasCommand(command) {
  try {
    execFileSync('which', [command], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function pdfInfo(path) {
  return execFileSync('pdfinfo', [path], { encoding: 'utf8' })
}

function pdfText(path) {
  return execFileSync('pdftotext', [path, '-'], { encoding: 'utf8' })
}

export default async function pdfExport({ page, url, home, assert: specAssert }) {
  const assertEqual = specAssert?.equal ?? assert.equal
  const assertOk = specAssert?.ok ?? assert.ok
  const consoleErrors = []
  page.on('console', (message) => {
    // 浏览器对 ≥400 资源响应的通用文案是宿主环境噪声（如 favicon 404）。
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => consoleErrors.push(String(error)))

  const pdfRequests = []
  page.on('request', (request) => {
    if (request.url().includes('/api/session.pdf')) pdfRequests.push({ method: request.method(), url: request.url() })
  })

  await openApp(page, url)
  await sendHeroMessage(page, USER_TEXT)
  await until('助手回复出现', async () => visibleText(page, ASSISTANT_TEXT), 30_000)

  // 等宿主自身（标题生成等）把日志写完，再取稳定哈希；导出前后必须一致。
  const stableLog = await until(
    '会话日志稳定',
    async () => {
      const path = await newestSessionLog(home)
      if (path === undefined) return null
      const before = await sessionLogDigest(path)
      await page.waitForTimeout(400)
      const after = await sessionLogDigest(path)
      return before === after ? { path, digest: after } : null
    },
    30_000,
  )

  // 观察生成中状态：视图挂载时同步显示，直到 HEAD 完成或失败。
  await page.evaluate(() => {
    window.__dxpStatuses = []
    const collect = () => {
      for (const node of document.querySelectorAll('.dxp-status')) {
        const text = node.textContent ?? ''
        if (text !== '' && !window.__dxpStatuses.includes(text)) window.__dxpStatuses.push(text)
      }
    }
    collect()
    new MutationObserver(collect).observe(document.documentElement, { subtree: true, childList: true, characterData: true })
  })

  const pdfResponse = page.waitForResponse(
    (response) => response.url().includes('/api/session.pdf') && response.request().method() === 'GET',
    { timeout: 60_000 },
  )
  const downloadButton = page.getByRole('button', { name: '下载 PDF' }).first()
  assertEqual(await clickPdfTab(page), true, '会话视图区应有 PDF 页签')
  await page.locator('.dxp-status').filter({ hasText: '正在生成 PDF…' }).first().waitFor({ timeout: 5_000 })
  assertEqual(await downloadButton.isDisabled(), true, '生成中下载动作不可用')
  const response = await pdfResponse
  assertEqual(response.status(), 200)
  assertOk((response.headers()['content-type'] ?? '').includes('application/pdf'), '预览请求返回 application/pdf')
  await page.getByText('预览已就绪', { exact: false }).first().waitFor({ timeout: 30_000 })

  const statuses = await page.evaluate(() => window.__dxpStatuses)
  assertOk(statuses.includes('正在生成 PDF…'), `生成中状态应出现，实际 ${JSON.stringify(statuses)}`)
  assertOk(statuses.includes('预览已就绪'), `就绪状态应出现，实际 ${JSON.stringify(statuses)}`)

  const iframe = page.locator('iframe[title="PDF 预览"]')
  assertEqual(await iframe.count(), 1, '预览使用页内 iframe')
  const source = await iframe.getAttribute('src')
  assertOk(source.includes('api/session.pdf?'), '预览地址是导出路由')
  assertOk(source.includes('disposition=inline'), '预览使用 inline disposition')
  const iframeUrl = new URL(source)
  const sessionId = iframeUrl.searchParams.get('sessionId')
  assertOk(sessionId !== null && sessionId !== '', '预览地址带会话标识')
  // 预览 iframe 的请求可能被 PDF 查看器取消重试，网络事件里的 body 不完整；
  // 用同一路由单独取一次完整字节，作为“预览所交付内容”的判据。
  const preview = await page.request.get(iframeUrl.href)
  assertEqual(preview.status(), 200, '预览地址可取到 PDF')
  const previewBytes = await preview.body()

  await until('下载按钮可用', async () => downloadButton.isEnabled().catch(() => false), 20_000)
  const [download] = await Promise.all([page.waitForEvent('download'), downloadButton.click()])
  assertEqual(download.suggestedFilename(), expectedPdfPrefix(sessionId))

  const directory = await mkdtemp(join(tmpdir(), 'dsh-pdf-e2e-download-'))
  const savedPath = join(directory, download.suggestedFilename())
  try {
    await download.saveAs(savedPath)
    const bytes = await readFile(savedPath)
    assertOk(bytes.byteLength > 1_000, '下载文件非空')
    assertEqual(bytes.subarray(0, 5).toString('ascii'), '%PDF-')
    assertEqual(Buffer.compare(previewBytes, bytes), 0, '下载与预览交付同一份字节')

    const requireCommand = (command) => {
      if (hasCommand(command)) return true
      // CI 已安装 poppler；静默跳过会让 A4/分页/中文断言零覆盖。
      if (process.env.CI) assert.fail(`CI 缺少 ${command}`)
      console.error(`e2e: SKIP ${command} 断言（宿主缺少 ${command}）`)
      return false
    }
    if (requireCommand('pdfinfo')) {
      const info = pdfInfo(savedPath)
      assertOk(/Page size:\s+59[45](?:\.\d+)? x 84[12](?:\.\d+)? pts/.test(info), '下载的 PDF 为 A4')
      const pages = Number(/^Pages:\s+(\d+)$/m.exec(info)?.[1] ?? '0')
      assertOk(pages >= 2, '长中文消息应分页，预览可浏览全部页面')
      if (requireCommand('pdftotext')) {
        // 标记可能因换行被拆开，逐页查找；再断言末页含助手回复，
        // 保证断言没有因为放宽“末页含标记”而丢掉内容覆盖末页的守卫。
        let markerPage = 0
        for (let pageNumber = 1; pageNumber <= pages; pageNumber += 1) {
          const pageText = execFileSync('pdftotext', ['-f', String(pageNumber), '-l', String(pageNumber), savedPath, '-'], { encoding: 'utf8' })
          if (pageText.includes(PAGINATION_MARKER)) {
            markerPage = pageNumber
            break
          }
        }
        assertOk(markerPage > 1, `末段标记应跨页出现，实际在第 ${markerPage} 页`)
        const lastPage = execFileSync('pdftotext', ['-f', String(pages), '-l', String(pages), savedPath, '-'], { encoding: 'utf8' })
        assertOk(lastPage.includes('导出探针回复'), '助手回复应覆盖末页')
      }
    }
    if (requireCommand('pdftotext')) {
      const text = pdfText(savedPath)
      assertOk(text.includes('中文导出探针'), 'PDF 文本层含用户中文消息')
      assertOk(text.includes(PAGINATION_MARKER), 'PDF 文本层含末段标记')
      assertOk(text.includes('导出探针回复'), 'PDF 文本层含助手回复')
      assertOk(!text.includes('file://'), 'PDF 不含临时文件路径')
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }

  // R-01-011/AC-04、AC-06 与 R-01-012/AC-05：选择驱动预览地址与下载文件名。
  const toolsBox = page.getByRole('checkbox', { name: '工具调用摘要' })
  const filesBox = page.getByRole('checkbox', { name: '文件附件' })
  const imagesSelect = page.getByLabel('图片模式')
  assertEqual(await toolsBox.isChecked(), false, '默认不勾选工具调用摘要')
  assertEqual(await filesBox.isChecked(), false, '默认不勾选文件附件')
  assertEqual(await imagesSelect.inputValue(), 'placeholder', '默认图片模式为占位')

  const setSelection = async (box, checked, includeToken, filenameSuffix) => {
    const responsePromise = page.waitForResponse(
      (response) => {
        if (!response.url().includes('/api/session.pdf') || response.request().method() !== 'GET') return false
        return includeToken === null ? !response.url().includes('include=') : response.url().includes(`include=${includeToken}`)
      },
      { timeout: 60_000 },
    )
    if (checked) await box.check()
    else await box.uncheck()
    if (includeToken !== null) {
      await page.waitForFunction(() => document.querySelector('.dxp-download')?.disabled === true, null, { timeout: 5_000 })
      assertEqual(await downloadButton.isDisabled(), true, `${includeToken} 生成中下载按钮不可用`)
    }
    assertEqual((await responsePromise).status(), 200, `${includeToken ?? 'default'} 预览请求成功`)
    await page.getByText('预览已就绪', { exact: false }).first().waitFor({ timeout: 30_000 })
    const selectedSource = await iframe.getAttribute('src')
    if (includeToken === null) assertOk(!selectedSource.includes('include='), '默认最简预览不携带 include')
    else assertOk(selectedSource.includes(`include=${includeToken}`), `${includeToken} 选择进入预览地址`)
    await until('下载按钮可用', async () => downloadButton.isEnabled().catch(() => false), 20_000)
    const [selectedDownload] = await Promise.all([page.waitForEvent('download'), downloadButton.click()])
    assertEqual(selectedDownload.suggestedFilename(), expectedPdfPrefix(sessionId, filenameSuffix))
    const selectedDirectory = await mkdtemp(join(tmpdir(), 'dsh-pdf-e2e-selection-'))
    try {
      const selectedPath = join(selectedDirectory, selectedDownload.suggestedFilename())
      await selectedDownload.saveAs(selectedPath)
      const previewBytes = await (await page.request.get(selectedSource)).body()
      const downloadBytes = await readFile(selectedPath)
      assertEqual(Buffer.compare(previewBytes, downloadBytes), 0, `${includeToken ?? 'default'} 预览与下载同字节`)
    } finally {
      await rm(selectedDirectory, { recursive: true, force: true })
    }
  }

  const setImageSelection = async (value, suffix) => {
    const responsePromise = page.waitForResponse(
      (response) => {
        if (!response.url().includes('/api/session.pdf') || response.request().method() !== 'GET') return false
        return value === 'placeholder' ? !response.url().includes('image=') : response.url().includes(`image=${value}`)
      },
      { timeout: 60_000 },
    )
    await imagesSelect.selectOption(value)
    // 回到占位可能命中缓存，状态来不及在轮询窗口内保持 disabled；其它模式要求可见生成态。
    if (value !== 'placeholder') {
      await page.waitForFunction(() => document.querySelector('.dxp-download')?.disabled === true, null, { timeout: 5_000 })
      assertEqual(await downloadButton.isDisabled(), true, `${value} 生成中下载按钮不可用`)
    }
    assertEqual((await responsePromise).status(), 200, `${value} 预览请求成功`)
    await page.getByText('预览已就绪', { exact: false }).first().waitFor({ timeout: 30_000 })
    const selectedSource = await iframe.getAttribute('src')
    if (value === 'placeholder') assertOk(!selectedSource.includes('image='), '占位模式不携带 image 参数')
    else assertOk(selectedSource.includes(`image=${value}`), `${value} 模式进入预览地址`)
    await until('下载按钮可用', async () => downloadButton.isEnabled().catch(() => false), 20_000)
    const [selectedDownload] = await Promise.all([page.waitForEvent('download'), downloadButton.click()])
    assertEqual(selectedDownload.suggestedFilename(), expectedPdfPrefix(sessionId, suffix))
    const selectedDirectory = await mkdtemp(join(tmpdir(), 'dsh-pdf-e2e-image-'))
    try {
      const selectedPath = join(selectedDirectory, selectedDownload.suggestedFilename())
      await selectedDownload.saveAs(selectedPath)
      const previewBytes = await (await page.request.get(selectedSource)).body()
      const downloadBytes = await readFile(selectedPath)
      assertEqual(Buffer.compare(previewBytes, downloadBytes), 0, `${value} 预览与下载同字节`)
    } finally {
      await rm(selectedDirectory, { recursive: true, force: true })
    }
  }

  await setSelection(toolsBox, true, 'tools', '-tools')
  await setSelection(toolsBox, false, null, '')
  await setSelection(filesBox, true, 'attachments', '-attachments')
  await setSelection(filesBox, false, null, '')
  await setImageSelection('embed', '-images')
  await setImageSelection('none', '-no-images')
  await setImageSelection('placeholder', '')

  // R-01-007/AC-01：导出不得改变会话日志字节。
  assertEqual(await sessionLogDigest(stableLog.path), stableLog.digest, '导出前后会话日志字节一致')

  // R-01-008/AC-01：不带浏览器会话 cookie 的请求由宿主 Connection 拒绝。
  const anonymous = await playwrightRequest.newContext()
  try {
    const denied = await anonymous.get(iframeUrl.href)
    assertEqual(denied.status(), 401, '无凭据请求应被拒绝')
  } finally {
    await anonymous.dispose()
  }

  // R-01-008/AC-02：异源请求被宿主的 /api 栅栏拒绝，且响应不带 CORS 放行头。
  const foreign = await page.request.get(iframeUrl.href, { headers: { Origin: FOREIGN_ORIGIN } })
  assertEqual(foreign.status(), 403, '异源请求应被拒绝')
  assertEqual(foreign.headers()['access-control-allow-origin'], undefined, '响应不得放行跨源读取')

  // 契约参数守卫（真实服务器）：
  const origin = new URL(url).origin
  assertEqual((await page.request.get(`${origin}/api/session.pdf`)).status(), 400, '缺少 sessionId 返回 400')
  assertEqual((await page.request.get(`${origin}/api/session.pdf?sessionId=does-not-exist`)).status(), 404, '不存在会话返回 404')
  assertEqual(
    (await page.request.get(`${origin}/api/session.pdf?sessionId=${encodeURIComponent(sessionId)}&disposition=zip`)).status(),
    400,
    '非法 disposition 返回 400',
  )

  // R-01-013/AC-01..05：断点边界、窄视口隐藏 iframe、同源链接在新标签页打开同一份 PDF；
  // 生成中/失败分支由失败 e2e 覆盖。
  const narrowPreview = page.locator('.dxp-narrow-preview')
  await page.setViewportSize({ width: 721, height: 844 })
  await page.locator('iframe[title="PDF 预览"]').waitFor({ timeout: 10_000 })
  assertEqual(await narrowPreview.count(), 0, '断点以上保留页内 iframe')
  await page.setViewportSize({ width: 720, height: 844 })
  await narrowPreview.waitFor({ timeout: 10_000 })
  assertEqual(await page.locator('iframe[title="PDF 预览"]').count(), 0, '断点及以下不渲染 PDF iframe')
  const mobileLink = page.getByRole('link', { name: '打开完整 PDF' })
  assertEqual(await mobileLink.isVisible(), true, '窄视口显示打开完整 PDF 链接')
  assertEqual(await mobileLink.getAttribute('href'), iframeUrl.href, '窄视口链接与预览使用同一份 PDF')
  assertEqual(await mobileLink.getAttribute('target'), '_blank', '链接在新标签页打开')
  assertEqual(await mobileLink.getAttribute('rel'), 'noopener noreferrer', '新标签页断开 opener')
  assertOk((await narrowPreview.innerText()).includes(expectedPdfPrefix(sessionId, '')), '窄视口显示当前文件名')

  // AC-05：非默认图片模式仍使用同一份 PDF，文件名带对应后缀。
  await page.getByLabel('图片模式').selectOption('embed')
  await page.waitForFunction(() => document.querySelector('.dxp-open')?.getAttribute('href')?.includes('image=embed'), null, { timeout: 60_000 })
  assertOk((await narrowPreview.innerText()).includes('-images.pdf'), '窄视口链接文件名包含图片模式后缀')
  await page.getByLabel('图片模式').selectOption('placeholder')
  await page.waitForFunction(() => !document.querySelector('.dxp-open')?.getAttribute('href')?.includes('image='), null, { timeout: 60_000 })

  const [opened] = await Promise.all([page.waitForEvent('popup'), mobileLink.click()])
  assertOk(opened.url().includes('/api/session.pdf'), '新标签页打开导出路由')
  assertOk(opened.url().includes(`sessionId=${sessionId}`), '新标签页使用同一会话')
  await opened.close()
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.locator('iframe[title="PDF 预览"]').waitFor({ timeout: 10_000 })
  assertEqual(await narrowPreview.count(), 0, '恢复桌面宽度后回到 iframe 预览')

  // R-01-001/AC-03：空会话不发起 PDF 生成请求。宿主在 blank 阶段隐藏视图区，
  // 因此这里断言“无请求”；空态渲染分支由 test/view-state.test.mjs 覆盖。
  // 只统计发给新空会话的请求，避免误捕上一会话 iframe 的迟到请求。
  await page.waitForTimeout(500)
  const requestsBeforeBlank = pdfRequests.length
  await page.getByRole('button', { name: 'New Session' }).first().click()
  await page.waitForTimeout(1_500)
  const newSessionId = await page.evaluate(() => {
    try {
      return JSON.parse(localStorage.getItem('dsh.sessions.current') ?? '{}').sessionId
    } catch {
      return undefined
    }
  })
  const blankRequests = pdfRequests
    .slice(requestsBeforeBlank)
    .filter((request) => newSessionId === undefined || request.url.includes(`sessionId=${newSessionId}`))
  assertEqual(blankRequests.length, 0, '空会话不发起导出请求')

  assertEqual(consoleErrors.join('\n'), '', '插件不产生控制台错误或未捕获异常')
}
