// 客户端插件入口，由 scripts/build-client.mjs 拼在 view.mjs 之后；
// 因此这里不写 import，VIEW_STYLE 与 PdfView 来自同一 bundle 的前序片段。

/** 客户端插件名。 */
export const name = 'dsh-export-pdf'
/** 只依赖槽位服务；会话标识与 useSession 由 conversation.view 的 session scope 提供。 */
export const inject = ['slots']

const STYLE_ID = 'dsh-export-pdf-view-style'

/**
 * 注册 PDF 视图页。槽位服务的 inject 包装把注册挂成插件 effect，
 * 插件卸载时页签与样式一起移除。
 * @param {any} ctx 客户端根上下文
 */
export function apply(ctx) {
  ctx.effect(() => {
    if (typeof document === 'undefined') return () => {}
    if (document.getElementById(STYLE_ID) !== null) return () => {}
    const style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = VIEW_STYLE
    document.head.appendChild(style)
    return () => {
      style.remove()
    }
  }, 'dsh-export-pdf: view style')

  ctx.slots.inject('conversation.view', () =>
    ctx.slots.register(
      {
        name: 'conversation.view',
        id: 'pdf',
        order: 20,
        label: () => 'PDF',
      },
      PdfView,
    ),
  )
}
