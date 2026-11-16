// 隔离 e2e 环境的 mock LLM：DeepSeek provider 在 dsh 0.2.x 走 Anthropic 风格
// Messages SSE。这里只描绘一条确定性中文回复，供 PDF 页断言转录内容。
import http from 'node:http'

const REPLY = '导出探针回复：中文可读，包含标点与 12345。'

function textOf(content) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n')
}

function userTexts(body) {
  const texts = []
  for (const message of body.messages ?? []) {
    if (message?.role !== 'user') continue
    const text = textOf(message.content)
    if (text !== '') texts.push(text)
  }
  return texts
}

function sendEvent(response, payload) {
  response.write(`data: ${JSON.stringify(payload)}\n\n`)
}

function playReply(response, text = REPLY) {
  sendEvent(response, { type: 'message_start', message: { usage: { input_tokens: 64, output_tokens: 1 } } })
  sendEvent(response, { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } })
  sendEvent(response, { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } })
  sendEvent(response, { type: 'content_block_stop', index: 0 })
  sendEvent(response, { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 12 } })
  sendEvent(response, { type: 'message_stop' })
  response.end()
}

/**
 * 启动 mock LLM。
 * @returns {Promise<{ url: string, requests: Array<{ texts: string[] }>, close: () => Promise<void> }>}
 */
export async function startMockLlm() {
  const requests = []
  const server = http.createServer((request, response) => {
    if (request.method !== 'POST' || request.url === undefined || !request.url.endsWith('/messages')) {
      response.writeHead(404, { 'content-type': 'text/plain' }).end('not found')
      return
    }
    let raw = ''
    request.on('data', (chunk) => {
      raw += chunk
    })
    request.on('end', () => {
      let body
      try {
        body = JSON.parse(raw)
      } catch {
        response.writeHead(400, { 'content-type': 'text/plain' }).end('bad json')
        return
      }
      requests.push({ texts: userTexts(body) })
      response.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      })
      playReply(response, REPLY)
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const port = typeof address === 'object' && address !== null ? address.port : 0
  return {
    url: `http://127.0.0.1:${port}/v1`,
    requests,
    close: () => new Promise((resolve) => server.close(resolve)),
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const mock = await startMockLlm()
  console.log(JSON.stringify({ url: mock.url }))
}
