// 浏览器半区的 bundle 片段：由 scripts/build-client.mjs 拼在 view-state.mjs
// 与 naming.mjs 之后，因此这里不写 import；React 由构建包装器注入。

/** 视图页样式；宿主模块系统不提供 CSS 构建，自注入一条 scoped 规则。 */
export const VIEW_STYLE = `
.dxp-root { box-sizing: border-box; display: flex; flex-direction: column; gap: 10px; height: 100%; min-height: 420px; padding: 12px 16px 16px; color: var(--dsw-alias-label-primary, #161616); }
.dxp-head { align-items: center; display: flex; gap: 12px; justify-content: space-between; }
.dxp-title { align-items: baseline; display: flex; gap: 8px; min-width: 0; }
.dxp-title strong { font-size: 14px; font-weight: 600; }
.dxp-status { color: var(--dsw-alias-label-caption, #6b6b6b); font-size: 12px; }
.dxp-download { background: var(--dsw-alias-state-business-primary, #2f6fed); border: 0; border-radius: 8px; color: #ffffff; cursor: pointer; font: inherit; font-size: 13px; padding: 7px 14px; white-space: nowrap; }
.dxp-download:hover:not(:disabled) { filter: brightness(0.94); }
.dxp-download:disabled { cursor: default; opacity: 0.5; }
.dxp-body { display: flex; flex: 1; flex-direction: column; min-height: 0; }
.dxp-frame { background: var(--dsw-alias-bg-layer-1, #ffffff); border: 1px solid var(--dsw-alias-border-l2, #e3e3e3); border-radius: 10px; flex: 1; min-height: 420px; width: 100%; }
.dxp-notice { align-items: center; display: flex; flex: 1; flex-direction: column; gap: 10px; justify-content: center; min-height: 260px; text-align: center; }
.dxp-notice p { color: var(--dsw-alias-label-caption, #6b6b6b); font-size: 13px; margin: 0; max-width: 560px; white-space: pre-wrap; }
.dxp-spinner { animation: dxp-spin 0.9s linear infinite; border: 2px solid var(--dsw-alias-border-l3, #d0d0d0); border-radius: 50%; border-top-color: var(--dsw-alias-state-business-primary, #2f6fed); height: 22px; width: 22px; }
.dxp-error { color: var(--dsw-alias-state-error-primary, #c0392b); font-size: 13px; margin: 0; max-width: 560px; white-space: pre-wrap; }
.dxp-retry { background: transparent; border: 1px solid var(--dsw-alias-border-l3, #d0d0d0); border-radius: 8px; color: inherit; cursor: pointer; font: inherit; font-size: 13px; padding: 6px 14px; }
.dxp-download-error { color: var(--dsw-alias-state-error-primary, #c0392b); font-size: 12px; margin: 0; }
@keyframes dxp-spin { to { transform: rotate(360deg); } }
`

/**
 * PDF 视图页。会话为空时显示空态且不发请求；否则 HEAD 同源路由，
 * 生成中显示等待状态，成功后用浏览器原生查看器预览，下载复用同一份结果。
 * @param {any} props conversation.view 的组合 props（含 sessionId 与 useSession）
 */
export function PdfView(props) {
  const sessionId = props.sessionId
  const blank = props.useSession((session) => session.blank)
  const [state, setState] = React.useState(() => initialViewState(blank))
  const [download, setDownload] = React.useState({ kind: 'idle' })
  const [attempt, setAttempt] = React.useState(0)

  React.useEffect(() => {
    if (blank === true) {
      setState({ kind: 'empty' })
      setDownload({ kind: 'idle' })
      return undefined
    }
    const controller = new AbortController()
    let disposed = false
    setState({ kind: 'loading' })
    setDownload({ kind: 'idle' })
    const url = pdfRouteUrl(sessionId)
    fetch(url, { method: 'HEAD', credentials: 'same-origin', signal: controller.signal })
      .then(async (response) => {
        const code = response.headers.get('x-dsh-export-error')
        const classified = classifyExportResponse(response.status, response.ok ? '' : await response.text().catch(() => ''), code)
        if (disposed || controller.signal.aborted) return
        setState(classified.kind === 'ready' ? { kind: 'ready', url, filename: pdfFilename(sessionId) } : classified)
      })
      .catch(() => {
        if (disposed || controller.signal.aborted) return
        setState({ kind: 'error', message: NETWORK_ERROR_TEXT })
      })
    return () => {
      disposed = true
      controller.abort()
    }
  }, [sessionId, blank, attempt])

  const downloadPdf = React.useCallback(async () => {
    if (state.kind !== 'ready') return
    setDownload({ kind: 'loading' })
    try {
      const response = await fetch(pdfRouteUrl(sessionId, { disposition: 'attachment' }), { credentials: 'same-origin' })
      if (response.status === 204) {
        setDownload({ kind: 'error', message: EMPTY_TEXT })
        return
      }
      if (!response.ok) {
        const text = await response.text().catch(() => '')
        setDownload({ kind: 'error', message: messageForStatus(response.status, text) })
        return
      }
      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = objectUrl
      anchor.download = state.filename
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000)
      setDownload({ kind: 'idle' })
    } catch {
      setDownload({ kind: 'error', message: NETWORK_ERROR_TEXT })
    }
  }, [state, sessionId])

  const ready = state.kind === 'ready'
  const statusText =
    state.kind === 'loading' ? GENERATING_TEXT : state.kind === 'ready' ? READY_TEXT : state.kind === 'empty' ? '' : '导出失败'
  const buttonText = state.kind !== 'ready' ? DOWNLOAD_TEXT : download.kind === 'loading' ? DOWNLOADING_TEXT : DOWNLOAD_TEXT

  return React.createElement(
    'section',
    { className: 'dxp-root', 'data-dsh-export-pdf': '' },
    React.createElement(
      'div',
      { className: 'dxp-head' },
      React.createElement('div', { className: 'dxp-title' }, React.createElement('strong', null, 'PDF'), statusText === '' ? null : React.createElement('span', { className: 'dxp-status' }, statusText)),
      React.createElement('button', { type: 'button', className: 'dxp-download', disabled: !ready || download.kind === 'loading', onClick: downloadPdf }, buttonText),
    ),
    React.createElement(
      'div',
      { className: 'dxp-body' },
      renderBody(state, () => setAttempt((value) => value + 1)),
      download.kind === 'error' ? React.createElement('p', { className: 'dxp-download-error' }, download.message) : null,
    ),
  )
}

function renderBody(state, retry) {
  if (state.kind === 'ready') {
    return React.createElement('iframe', { className: 'dxp-frame', src: state.url, title: 'PDF 预览' })
  }
  if (state.kind === 'loading') {
    return React.createElement(
      'div',
      { className: 'dxp-notice' },
      React.createElement('div', { className: 'dxp-spinner', 'aria-hidden': 'true' }),
      React.createElement('p', null, viewNoticeText(state)),
    )
  }
  if (state.kind === 'empty') {
    return React.createElement('div', { className: 'dxp-notice' }, React.createElement('p', null, viewNoticeText(state)))
  }
  return React.createElement(
    'div',
    { className: 'dxp-notice' },
    React.createElement('p', { className: 'dxp-error' }, state.message),
    React.createElement('button', { type: 'button', className: 'dxp-retry', onClick: retry }, RETRY_TEXT),
  )
}
