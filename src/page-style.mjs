import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** 页面样式表路径；与本模块同目录，随包的 `src/` 一起发布。 */
export const PAGE_STYLE_PATH = join(dirname(fileURLToPath(import.meta.url)), 'page-style.css')

/**
 * 读取页面样式表，返回样式文本与内容版本。导出时调用，所以改 CSS 不需要重启宿主：
 * 每次导出都读文件、按内容取版本，版本进 PDF 缓存键，改样式后旧结果失效（T-013）。
 * 用内容哈希而不是修改时间与文件长度，同长度替换落在同一时间戳上也不会误判未变。
 * @param {string} [path] 样式表路径；测试可指向临时文件
 * @returns {{ text: string, version: string }}
 */
export function readPageStyle(path = PAGE_STYLE_PATH) {
  let text
  try {
    text = readFileSync(path, 'utf8')
  } catch (error) {
    throw new Error(`dsh-export-pdf: 无法读取页面样式表 ${path}`, { cause: error })
  }
  if (text.trim() === '') throw new Error(`dsh-export-pdf: 页面样式表 ${path} 为空`)
  const version = createHash('sha1').update(text).digest('hex').slice(0, 12)
  return { text, version }
}
