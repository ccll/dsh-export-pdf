import { spawn } from 'node:child_process'

/**
 * 运行一次子进程并收集结果。超时按进程组终止；不向调用方抛出，
 * 由调用方按 `spawnError` / `timedOut` / `code` 判定失败语义。
 * @param {string} file 可执行文件
 * @param {readonly string[]} args 参数
 * @param {{ timeoutMs?: number, env?: NodeJS.ProcessEnv, cwd?: string, stdoutLimit?: number, stderrLimit?: number }} [options]
 * @returns {Promise<{ code: number | null, signal: string | null, stdout: string, stderr: string, timedOut: boolean, spawnError?: NodeJS.ErrnoException }>}
 */
export function runProcess(file, args, options = {}) {
  const stdoutLimit = options.stdoutLimit ?? 64 * 1024
  const stderrLimit = options.stderrLimit ?? 16 * 1024
  return new Promise((resolve) => {
    let child
    try {
      child = spawn(file, args, {
        cwd: options.cwd,
        env: options.env,
        stdio: ['ignore', 'pipe', 'pipe'],
        // 独立进程组让超时可以连同 Chrome 的子进程一起终止。
        detached: process.platform !== 'win32',
      })
    } catch (error) {
      resolve({ code: null, signal: null, stdout: '', stderr: '', timedOut: false, spawnError: error })
      return
    }

    let stdout = ''
    let stderr = ''
    let timedOut = false
    let spawnError
    let settled = false
    let timer
    child.stdout?.on('data', (chunk) => {
      if (stdout.length < stdoutLimit) stdout += String(chunk)
    })
    child.stderr?.on('data', (chunk) => {
      if (stderr.length < stderrLimit) stderr += String(chunk)
    })
    child.on('error', (error) => {
      spawnError = error
      finish()
    })
    child.on('close', (code, signal) => {
      finish(code, signal)
    })

    function finish(code = null, signal = null) {
      if (settled) return
      settled = true
      if (timer !== undefined) clearTimeout(timer)
      if (child.pid !== undefined) {
        // 关闭后回收残留的进程组，避免 Chrome 的渲染子进程挂在宿主上。
        try {
          process.kill(-child.pid, 'SIGKILL')
        } catch {
          // 进程组已经退出或不是组长；忽略。
        }
      }
      resolve({ code, signal, stdout, stderr, timedOut, ...(spawnError === undefined ? {} : { spawnError }) })
    }

    if (options.timeoutMs !== undefined && options.timeoutMs > 0) {
      timer = setTimeout(() => {
        timedOut = true
        try {
          if (child.pid !== undefined) process.kill(-child.pid, 'SIGKILL')
        } catch {
          try {
            child.kill('SIGKILL')
          } catch {
            // 进程已退出。
          }
        }
      }, options.timeoutMs)
    }
  })
}

/**
 * Chrome 只需要字体、临时目录与 PATH；显式构造最小环境，避免把宿主的
 * API Key、令牌、Cookie 等变量暴露给浏览器子进程。
 * @returns {NodeJS.ProcessEnv}
 */
export function minimalBrowserEnv() {
  const kept = new Set([
    'PATH',
    'HOME',
    'LANG',
    'LC_ALL',
    'LC_CTYPE',
    'TZ',
    'TMPDIR',
    'TEMP',
    'TMP',
    'USER',
    'LOGNAME',
    'SystemRoot',
    'USERPROFILE',
    'windir',
  ])
  const env = {}
  for (const key of kept) {
    const value = process.env[key]
    if (value !== undefined) env[key] = value
  }
  return env
}
