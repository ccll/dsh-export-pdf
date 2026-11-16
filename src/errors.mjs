/** 导出失败的类型化原因：路由据类型映射状态码，响应只给简要说明。 */
export class PdfExportError extends Error {
  /**
   * @param {string} message 面向日志与路由映射的简要原因
   * @param {string} code 稳定错误码
   */
  constructor(message, code) {
    super(message)
    this.name = new.target.name
    this.code = code
  }
}

/** 会话不存在，或日志读取/校验失败。 */
export class SessionUnavailableError extends PdfExportError {
  constructor(message = '会话不存在或日志不可读') {
    super(message, 'SESSION_UNAVAILABLE')
  }
}

/** 请求指向子会话；对应 PRD 非目标 NG-6。 */
export class SubagentExportError extends PdfExportError {
  constructor(message = '不支持导出子会话') {
    super(message, 'SUBAGENT_EXPORT_UNSUPPORTED')
  }
}

/** 宿主缺少可用的中文字体。 */
export class FontUnavailableError extends PdfExportError {
  constructor(message = '缺少可用的中文字体') {
    super(message, 'FONT_UNAVAILABLE')
  }
}

/** 宿主没有可用的浏览器可执行文件。 */
export class BrowserUnavailableError extends PdfExportError {
  constructor(message = '没有可用的浏览器') {
    super(message, 'BROWSER_UNAVAILABLE')
  }
}

/** 浏览器打印失败、超时或产物无效。 */
export class RenderFailedError extends PdfExportError {
  /**
   * @param {string} message 简要原因
   * @param {{ detail?: string }} [options] 只写入宿主日志的细节，永不回给浏览器
   */
  constructor(message = 'PDF 渲染失败', options = {}) {
    super(message, 'RENDER_FAILED')
    if (options.detail !== undefined) this.detail = options.detail
  }
}
