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
.dxp-select { background: var(--dsw-alias-bg-layer-1, #ffffff); border: 1px solid var(--dsw-alias-border-l2, #e3e3e3); border-radius: 6px; color: inherit; font: inherit; font-size: 12px; padding: 2px 4px; }
.dxp-download { background: var(--dsw-alias-state-business-primary, #2f6fed); border: 0; border-radius: 8px; color: #ffffff; cursor: pointer; font: inherit; font-size: 13px; margin-left: auto; padding: 7px 14px; white-space: nowrap; }
.dxp-download:hover:not(:disabled) { filter: brightness(0.94); }
.dxp-download:disabled { cursor: default; opacity: 0.5; }
.dxp-body { display: flex; flex: 1; flex-direction: column; min-height: 0; }
.dxp-frame { background: var(--dsw-alias-bg-layer-1, #ffffff); border: 1px solid var(--dsw-alias-border-l2, #e3e3e3); border-radius: 10px; flex: 1; min-height: 420px; width: 100%; }
.dxp-notice { align-items: center; display: flex; flex: 1; flex-direction: column; gap: 10px; justify-content: center; min-height: 260px; text-align: center; }
.dxp-notice p { color: var(--dsw-alias-label-caption, #6b6b6b); font-size: 13px; margin: 0; max-width: 560px; white-space: pre-wrap; }
.dxp-spinner { animation: dxp-spin 0.9s linear infinite; border: 2px solid var(--dsw-alias-border-l3, #d0d0d0); border-radius: 50%; border-top-color: var(--dsw-alias-state-business-primary, #2f6fed); height: 22px; width: 22px; }
.dxp-error { color: var(--dsw-alias-state-error-primary, #c0392b); font-size: 13px; margin: 0; max-width: 560px; white-space: pre-wrap; }
.dxp-narrow-preview { align-items: center; background: var(--dsw-alias-bg-layer-1, #ffffff); border: 1px solid var(--dsw-alias-border-l2, #e3e3e3); border-radius: 10px; display: flex; flex: 1; flex-direction: column; gap: 14px; justify-content: center; min-height: 420px; padding: 24px; text-align: center; }
.dxp-narrow-hint { color: var(--dsw-alias-label-caption, #6b6b6b); font-size: 13px; line-height: 1.7; margin: 0; max-width: 420px; }
.dxp-open { background: var(--dsw-alias-state-business-primary, #2f6fed); border-radius: 8px; color: #ffffff; font-size: 14px; padding: 10px 18px; text-decoration: none; }
.dxp-narrow-file { color: var(--dsw-alias-label-caption, #6b6b6b); font-size: 12px; margin: 0; overflow-wrap: anywhere; }
.dxp-retry { background: transparent; border: 1px solid var(--dsw-alias-border-l3, #d0d0d0); border-radius: 8px; color: inherit; cursor: pointer; font: inherit; font-size: 13px; padding: 6px 14px; }
.dxp-download-error { color: var(--dsw-alias-state-error-primary, #c0392b); font-size: 12px; margin: 0; }
@keyframes dxp-spin { to { transform: rotate(360deg); } }
`

/** 新会话与首次挂载的回显选择：图片占位，文件与工具不加入。 */
const DEFAULT_OPTIONS = { files: false, images: 'placeholder', tools: false }

function includeFromOptions(options) {
  return INCLUDE_TOKENS.filter((token) => (token === 'attachments' ? options.files === true : options[token] === true))
}

/** 订阅窄视口断点；服务端或缺少 matchMedia 时按桌面处理。 */
function useNarrowViewport() {
  const [narrow, setNarrow] = React.useState(
    () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(NARROW_VIEWPORT_QUERY).matches,
  )
  React.useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined
    const media = window.matchMedia(NARROW_VIEWPORT_QUERY)
    const onChange = (event) => setNarrow(event.matches)
    setNarrow(media.matches)
    if (typeof media.addEventListener === 'function') media.addEventListener('change', onChange)
    else if (typeof media.addListener === 'function') media.addListener(onChange)
    return () => {
      if (typeof media.removeEventListener === 'function') media.removeEventListener('change', onChange)
      else if (typeof media.removeListener === 'function') media.removeListener(onChange)
    }
  }, [])
  return narrow
}

/**
 * PDF 视图页。默认图片占位、文件与工具不加入；选择变化时取消旧请求并按新选择重取。
 * 会话为空时显示空态且不发请求；否则 HEAD 同源路由，再用 GET 校验预览可交付，
 * 成功后用浏览器原生查看器预览，下载复用同一份结果与同一组选择。
 * @param {any} props conversation.view 的组合 props（含 sessionId 与 useSession）
 */
export function PdfView(props) {
  const sessionId = props.sessionId
  const blank = props.useSession((session) => session.blank)
  const [state, setState] = React.useState(() => initialViewState(blank))
  const [download, setDownload] = React.useState({ kind: 'idle' })
  const [attempt, setAttempt] = React.useState(0)
  const narrow = useNarrowViewport()
  const [selection, setSelection] = React.useState(() => ({ sessionId, options: DEFAULT_OPTIONS }))
  const downloadAbort = React.useRef(null)
  const options = selection.sessionId === sessionId ? selection.options : DEFAULT_OPTIONS
  const include = includeFromOptions(options)
  const includeKey = include.join(',')
  const imageMode = options.images
  const viewSelectionKey = selectionKey(include, imageMode)

  React.useEffect(() => {
    if (blank === true) {
      setState({ kind: 'empty', sessionId })
      setDownload({ kind: 'idle' })
      return undefined
    }
    const controller = new AbortController()
    let disposed = false
    setState({ kind: 'loading' })
    setDownload({ kind: 'idle' })
    const url = pdfRouteUrl(sessionId, { include, imageMode })
    const scoped = (next) => ({ ...next, sessionId, selectionKey: viewSelectionKey })
    fetch(url, { method: 'HEAD', credentials: 'same-origin', signal: controller.signal })
      .then(async (response) => {
        const code = response.headers.get('x-dsh-export-error')
        if (response.status !== 200) {
          const body = response.status === 204 ? '' : await response.text().catch(() => '')
          if (disposed || controller.signal.aborted) return
          setState(scoped(classifyExportResponse(response.status, body, code)))
          return
        }
        // HEAD 只证明路由可达；预览 iframe 用的是 GET，必须再验证一次 GET 成功，
        // 否则日志增长、缓存淘汰或会话删除会让页面停留在“预览已就绪”。
        const preview = await fetch(url, { credentials: 'same-origin', signal: controller.signal })
        if (disposed || controller.signal.aborted) return
        if (preview.status !== 200) {
          const body = preview.status === 204 ? '' : await preview.text().catch(() => '')
          if (disposed || controller.signal.aborted) return
          setState(scoped(classifyExportResponse(preview.status, body, preview.headers.get('x-dsh-export-error'))))
          return
        }
        const contentType = preview.headers.get('content-type') ?? ''
        // 校验只需要状态与响应头；不把整份 PDF 驻留浏览器内存，iframe 仍走同源路由。
        preview.body?.cancel().catch(() => {})
        if (!contentType.includes('application/pdf')) {
          setState(scoped({ kind: 'error', message: `${FALLBACK_ERROR_TEXT}（HTTP ${preview.status}）` }))
          return
        }
        if (disposed || controller.signal.aborted) return
        setState({ kind: 'ready', sessionId, url, filename: pdfFilename(sessionId, include, imageMode), selectionKey: viewSelectionKey })
      })
      .catch(() => {
        if (disposed || controller.signal.aborted) return
        setState(scoped({ kind: 'error', message: NETWORK_ERROR_TEXT }))
      })
    return () => {
      disposed = true
      controller.abort()
    }
  }, [sessionId, blank, attempt, viewSelectionKey])

  // 选择或会话变化时取消在途下载，避免旧选择的文件在切换后落盘（R-01-011/AC-04）。
  React.useEffect(() => () => {
    if (downloadAbort.current !== null) {
      downloadAbort.current.abort()
      downloadAbort.current = null
    }
  }, [sessionId, viewSelectionKey])

  const downloadPdf = React.useCallback(async () => {
    if (state.kind !== 'ready' || state.sessionId !== sessionId || state.selectionKey !== viewSelectionKey) return
    if (downloadAbort.current !== null) downloadAbort.current.abort()
    const controller = new AbortController()
    downloadAbort.current = controller
    setDownload({ kind: 'loading' })
    try {
      const selectedInclude = includeKey === '' ? [] : includeKey.split(',')
      const response = await fetch(pdfRouteUrl(sessionId, { disposition: 'attachment', include: selectedInclude, imageMode }), {
        credentials: 'same-origin',
        signal: controller.signal,
      })
      if (controller.signal.aborted) return
      if (response.status === 204) {
        setDownload({ kind: 'error', message: FILTERED_EMPTY_TEXT, sessionId, selectionKey: viewSelectionKey })
        return
      }
      if (!response.ok) {
        const text = await response.text().catch(() => '')
        setDownload({ kind: 'error', message: messageForStatus(response.status, text), sessionId, selectionKey: viewSelectionKey })
        return
      }
      const blob = await response.blob()
      if (controller.signal.aborted) return
      const objectUrl = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = objectUrl
      anchor.download = state.filename
      anchor.click()
      setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000)
      setDownload({ kind: 'idle' })
    } catch (error) {
      if (controller.signal.aborted || error?.name === 'AbortError') return
      setDownload({ kind: 'error', message: NETWORK_ERROR_TEXT, sessionId, selectionKey: viewSelectionKey })
    } finally {
      if (downloadAbort.current === controller) downloadAbort.current = null
    }
  }, [state, sessionId, viewSelectionKey, imageMode])

  const ready = state.kind === 'ready' && state.sessionId === sessionId && state.selectionKey === viewSelectionKey
  const inScope = isViewStateInScope(state, sessionId, viewSelectionKey)
  const displayState = ready || ((state.kind === 'empty' || state.kind === 'error') && inScope) ? state : { kind: 'loading' }
  const displayDownload = download.kind === 'error' && !isViewStateInScope(download, sessionId, viewSelectionKey) ? { kind: 'idle' } : download
  const statusText = displayState.kind === 'error' ? '导出失败' : displayState.kind === 'empty' ? '' : ready ? READY_TEXT : GENERATING_TEXT
  const buttonText = !ready ? DOWNLOAD_TEXT : displayDownload.kind === 'loading' ? DOWNLOADING_TEXT : DOWNLOAD_TEXT

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
  const imageOption = React.createElement(
    'label',
    { className: 'dxp-check' },
    '图片',
    React.createElement(
      'select',
      {
        className: 'dxp-select',
        value: options.images,
        'aria-label': '图片模式',
        onChange: (event) => setOption('images', event.target.value),
      },
      React.createElement('option', { value: 'placeholder' }, '占位'),
      React.createElement('option', { value: 'embed' }, '嵌入原图'),
      React.createElement('option', { value: 'none' }, '不导出'),
    ),
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
        imageOption,
        option('files', '文件附件'),
        option('tools', '工具调用摘要'),
      ),
      React.createElement('button', { type: 'button', className: 'dxp-download', disabled: !ready || displayDownload.kind === 'loading', onClick: downloadPdf }, buttonText),
    ),
    React.createElement(
      'div',
      { className: 'dxp-body' },
      renderBody(displayState, () => setAttempt((value) => value + 1), narrow),
      displayDownload.kind === 'error' ? React.createElement('p', { className: 'dxp-download-error' }, displayDownload.message) : null,
    ),
  )
}

function renderBody(state, retry, narrow) {
  if (state.kind === 'ready') {
    if (narrow) {
      return React.createElement(
        'div',
        { className: 'dxp-narrow-preview', role: 'region', 'aria-label': 'PDF 预览' },
        React.createElement('p', { className: 'dxp-narrow-hint' }, NARROW_PREVIEW_HINT),
        React.createElement('a', { className: 'dxp-open', href: state.url, target: '_blank', rel: 'noopener noreferrer' }, OPEN_PDF_TEXT),
        React.createElement('p', { className: 'dxp-narrow-file' }, state.filename),
      )
    }
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
