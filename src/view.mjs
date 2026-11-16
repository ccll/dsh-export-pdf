// 浏览器半区的 bundle 片段：由 scripts/build-client.mjs 拼在 view-state.mjs
// 与 naming.mjs 之后，因此这里不写 import；React 由构建包装器注入。

/** 视图页样式；宿主模块系统不提供 CSS 构建，自注入一条 scoped 规则。 */
export const VIEW_STYLE = `
.dxp-root { box-sizing: border-box; display: flex; flex-direction: column; gap: 10px; height: 100%; min-height: 420px; padding: 12px 16px 16px; color: var(--dsw-alias-label-primary, #161616); }
.dxp-head { align-items: center; display: flex; flex-wrap: wrap; gap: 10px 12px; justify-content: space-between; /* 宿主分栏把手覆盖页头命中区，抬高页头让复选框可点。 */ position: relative; z-index: 1; }
.dxp-title { align-items: baseline; display: flex; gap: 8px; min-width: 0; }
.dxp-title strong { font-size: 14px; font-weight: 600; }
.dxp-status { color: var(--dsw-alias-label-caption, #6b6b6b); font-size: 12px; }
.dxp-options { align-items: center; display: flex; flex-wrap: wrap; gap: 10px; }
.dxp-check { align-items: center; color: var(--dsw-alias-label-caption, #6b6b6b); display: inline-flex; font-size: 12px; gap: 4px; user-select: none; }
.dxp-check input { accent-color: var(--dsw-alias-state-business-primary, #2f6fed); margin: 0; }
.dxp-download { background: var(--dsw-alias-state-business-primary, #2f6fed); border: 0; border-radius: 8px; color: #ffffff; cursor: pointer; font: inherit; font-size: 13px; margin-left: auto; padding: 7px 14px; white-space: nowrap; }
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

/** 新会话与首次挂载的回显选择：默认只导出消息文本。 */
const DEFAULT_OPTIONS = { attachments: false, tools: false }

function includeFromOptions(options) {
  return INCLUDE_TOKENS.filter((token) => options[token] === true)
}

/**
 * PDF 视图页。默认请求最简内容；复选框选择变化时取消旧请求并按新选择重取。
 * 会话为空时显示空态且不发请求；否则 HEAD 同源路由，成功后用浏览器原生
 * 查看器预览，下载复用同一份结果与同一组选择。
 * @param {any} props conversation.view 的组合 props（含 sessionId 与 useSession）
 */
export function PdfView(props) {
  const sessionId = props.sessionId
  const blank = props.useSession((session) => session.blank)
  const [state, setState] = React.useState(() => initialViewState(blank))
  const [download, setDownload] = React.useState({ kind: 'idle' })
  const [attempt, setAttempt] = React.useState(0)
  const [selection, setSelection] = React.useState(() => ({ sessionId, options: DEFAULT_OPTIONS }))
  const options = selection.sessionId === sessionId ? selection.options : DEFAULT_OPTIONS
  const include = includeFromOptions(options)
  const includeKey = include.join(',')

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
    const url = pdfRouteUrl(sessionId, { include })
    fetch(url, { method: 'HEAD', credentials: 'same-origin', signal: controller.signal })
      .then(async (response) => {
        const code = response.headers.get('x-dsh-export-error')
        const classified = classifyExportResponse(response.status, response.ok ? '' : await response.text().catch(() => ''), code)
        if (disposed || controller.signal.aborted) return
        setState(classified.kind === 'ready' ? { kind: 'ready', sessionId, url, filename: pdfFilename(sessionId, include), includeKey } : classified)
      })
      .catch(() => {
        if (disposed || controller.signal.aborted) return
        setState({ kind: 'error', message: NETWORK_ERROR_TEXT })
      })
    return () => {
      disposed = true
      controller.abort()
    }
  }, [sessionId, blank, attempt, includeKey])

  const downloadPdf = React.useCallback(async () => {
    if (state.kind !== 'ready' || state.sessionId !== sessionId || state.includeKey !== includeKey) return
    setDownload({ kind: 'loading' })
    try {
      const selectedInclude = includeKey === '' ? [] : includeKey.split(',')
      const response = await fetch(pdfRouteUrl(sessionId, { disposition: 'attachment', include: selectedInclude }), { credentials: 'same-origin' })
      if (response.status === 204) {
        setDownload({ kind: 'error', message: FILTERED_EMPTY_TEXT })
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
  }, [state, sessionId, includeKey])

  const ready = state.kind === 'ready' && state.sessionId === sessionId && state.includeKey === includeKey
  const statusText = state.kind === 'error' ? '导出失败' : state.kind === 'empty' ? '' : ready ? READY_TEXT : GENERATING_TEXT
  const buttonText = !ready ? DOWNLOAD_TEXT : download.kind === 'loading' ? DOWNLOADING_TEXT : DOWNLOAD_TEXT
  const displayState = ready || state.kind === 'empty' || state.kind === 'error' ? state : { kind: 'loading' }

  const setOption = (key, checked) => {
    setSelection({ sessionId, options: { ...options, [key]: checked } })
  }
  const option = (key, label) =>
    React.createElement(
      'label',
      { className: 'dxp-check', key },
      React.createElement('input', {
        type: 'checkbox',
        checked: options[key],
        onChange: (event) => setOption(key, event.target.checked),
      }),
      label,
    )

  return React.createElement(
    'section',
    { className: 'dxp-root', 'data-dsh-export-pdf': '' },
    React.createElement(
      'div',
      { className: 'dxp-head' },
      React.createElement('div', { className: 'dxp-title' }, React.createElement('strong', null, 'PDF'), statusText === '' ? null : React.createElement('span', { className: 'dxp-status' }, statusText)),
      React.createElement(
        'div',
        { className: 'dxp-options', role: 'group', 'aria-label': '导出内容' },
        option('tools', '工具调用摘要'),
        option('attachments', '附件占位'),
      ),
      React.createElement('button', { type: 'button', className: 'dxp-download', disabled: !ready || download.kind === 'loading', onClick: downloadPdf }, buttonText),
    ),
    React.createElement(
      'div',
      { className: 'dxp-body' },
      renderBody(displayState, () => setAttempt((value) => value + 1)),
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
