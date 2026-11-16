import { access, readdir } from 'node:fs/promises'
import { constants } from 'node:fs'
import { homedir, platform } from 'node:os'
import { join } from 'node:path'
import { runProcess } from './process.mjs'

/** CJK 字体文件名特征：覆盖 Linux 常见发行版、macOS 与 Windows 的内置字体。 */
const CJK_FONT_FILENAME = /(cjk|sourcehan|source-han|noto[-_ ]?(sans|serif)?[-_ ]?(sc|tc|jp|kr|hans|hant)|sarasa|fandol|yahei|pingfang|simsun|simhei|songti|heiti|kaiti|wenquanyi|droid[-_ ]?sans[-_ ]?fallback|arphic)/i
const FONT_EXTENSION = /\.(ttf|otf|ttc|otc)$/i
const FONT_SCAN_DEPTH = 3

let cachedProbe

/**
 * 探测宿主是否有可用的中文字体。Linux 先问 fontconfig（`fc-list :lang=zh`），
 * 没有 fontconfig 时扫描系统字体目录。结果缓存在进程内。
 * @returns {Promise<boolean>}
 */
export function detectCjkFont() {
  cachedProbe ??= probeOnce()
  return cachedProbe
}

/** 测试用：清掉进程内字体探测缓存。 */
export function resetCjkFontProbe() {
  cachedProbe = undefined
}

/**
 * 判断文件名是否像一个 CJK 字体。
 * @param {string} filename 字体文件名
 * @returns {boolean}
 */
export function isCjkFontFilename(filename) {
  return FONT_EXTENSION.test(filename) && CJK_FONT_FILENAME.test(filename)
}

async function probeOnce() {
  const listed = await probeFontconfig()
  if (listed !== undefined) return listed
  return scanFontDirectories()
}

async function probeFontconfig() {
  const result = await runProcess('fc-list', [':lang=zh', 'family'], { timeoutMs: 5_000, stdoutLimit: 16 * 1024 })
  if (result.spawnError !== undefined) return undefined
  if (result.timedOut || result.code !== 0) return undefined
  return result.stdout.trim() !== ''
}

function fontDirectories() {
  if (platform() === 'darwin') {
    return ['/System/Library/Fonts', '/Library/Fonts', join(homedir(), 'Library/Fonts')]
  }
  if (platform() === 'win32') {
    return [join(process.env.SystemRoot ?? 'C:\\Windows', 'Fonts'), join(process.env.LOCALAPPDATA ?? '', 'Microsoft', 'Windows', 'Fonts')]
  }
  return [
    '/usr/share/fonts',
    '/usr/local/share/fonts',
    join(homedir(), '.local', 'share', 'fonts'),
    join(homedir(), '.fonts'),
  ]
}

async function scanFontDirectories() {
  for (const directory of fontDirectories()) {
    if (directory === '' || (await isReadableDirectory(directory)) === false) continue
    if (await containsCjkFont(directory, FONT_SCAN_DEPTH)) return true
  }
  return false
}

async function isReadableDirectory(directory) {
  try {
    await access(directory, constants.R_OK)
    return true
  } catch {
    return false
  }
}

async function containsCjkFont(directory, depth) {
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch {
    return false
  }
  for (const entry of entries) {
    if (entry.isFile() && isCjkFontFilename(entry.name)) return true
  }
  if (depth <= 1) return false
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (await containsCjkFont(join(directory, entry.name), depth - 1)) return true
  }
  return false
}
