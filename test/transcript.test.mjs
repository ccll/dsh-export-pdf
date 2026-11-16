// 测试锚点: R-01-004/AC-01 R-01-004/AC-02 R-01-004/AC-03
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  TOOL_ARGUMENT_SUMMARY_MAX,
  foldTranscript,
  isHumanUserMessage,
  messageText,
  summarizeToolArguments,
} from '../src/transcript.mjs'

const userEvent = (seq, text, source) => ({
  type: 'user/message',
  seq,
  time: seq,
  data: { content: [{ type: 'text', text }], ...(source === undefined ? {} : { source }) },
})
const assistantEvent = (seq, blocks) => ({
  type: 'assistant/message',
  seq,
  time: seq,
  data: { message: { role: 'assistant', content: blocks } },
})
const toolCallEvent = (seq, name, args) => ({
  type: 'tool/call',
  seq,
  time: seq,
  data: { name, arguments: args },
})

test('真人输入按 source.kind 判定，内部注入被排除', () => {
  assert.equal(isHumanUserMessage(userEvent(1, '你好', { kind: 'user' })), true)
  assert.equal(isHumanUserMessage(userEvent(1, '<系统注入>', { kind: 'runtime-context' })), false)
  assert.equal(isHumanUserMessage(userEvent(1, '<技能目录>', { kind: 'skill-catalog' })), false)
  // 旧格式日志没有 source，按真人输入处理，避免历史会话导出为空。
  assert.equal(isHumanUserMessage(userEvent(1, '旧日志用户消息')), true)
  assert.equal(isHumanUserMessage({ type: 'assistant/message', data: {} }), false)
})

test('转录按事件顺序保留用户消息、助手文本与工具调用', () => {
  const events = [
    userEvent(1, '第一个问题', { kind: 'user' }),
    userEvent(2, '内部注入不应出现', { kind: 'runtime-context' }),
    assistantEvent(3, [
      { type: 'reasoning', text: '思考块不应出现' },
      { type: 'text', text: '第一个回答' },
      { type: 'tool-call', id: 'call_1', name: 'bash', arguments: '{"command":"echo 1"}' },
    ]),
    toolCallEvent(4, 'bash', '{"command":"echo 1"}'),
    { type: 'tool/result', seq: 5, time: 5, data: { message: { content: [{ type: 'text', text: '工具结果不应出现' }] } } },
    { type: 'assistant/attempt', seq: 6, time: 6, data: { stream: [] } },
    userEvent(7, '第二个问题', { kind: 'user' }),
    assistantEvent(8, [{ type: 'text', text: '第二个回答' }]),
  ]
  const entries = foldTranscript(events)
  assert.deepEqual(
    entries.map((entry) => entry.kind),
    ['user', 'assistant', 'tool', 'user', 'assistant'],
  )
  assert.deepEqual(entries.map((entry) => entry.seq), [1, 3, 4, 7, 8])
  assert.equal(entries[0].text, '第一个问题')
  assert.equal(entries[1].text, '第一个回答')
  assert.equal(entries[2].name, 'bash')
  assert.equal(entries[2].summary, 'command=echo 1')
  const serialized = JSON.stringify(entries)
  assert.ok(!serialized.includes('思考块'))
  assert.ok(!serialized.includes('内部注入'))
  assert.ok(!serialized.includes('工具结果'))
})

test('助手消息没有 text 块时不产出条目，思考块不进入正文', () => {
  const entries = foldTranscript([
    assistantEvent(1, [{ type: 'reasoning', text: '只有思考' }]),
    assistantEvent(2, [{ type: 'text', text: '   ' }]),
    assistantEvent(3, [{ type: 'text', text: '有正文' }]),
  ])
  assert.deepEqual(entries, [{ kind: 'assistant', seq: 3, text: '有正文' }])
})

test('图片与文件块降为占位符，文本块按顺序拼接', () => {
  const text = messageText([
    { type: 'text', text: '看这个' },
    { type: 'image', attachment: { id: 'img' } },
    { type: 'file', attachment: { name: '报告.pdf' } },
    { type: 'tool-call', id: 'call', name: 'bash', arguments: '{}' },
  ])
  assert.equal(text, '看这个\n[图片]\n[附件: 报告.pdf]')
  assert.equal(messageText([{ type: 'file', attachment: {} }]), '[附件]')
})

test('工具参数摘要保留可读键值并截断超长值', () => {
  assert.equal(summarizeToolArguments('{"command":"echo hello","timeout":5}'), 'command=echo hello, timeout=5')
  assert.equal(summarizeToolArguments(''), '')
  assert.equal(summarizeToolArguments('not json'), 'not json')
  assert.equal(summarizeToolArguments('[1,2,3]'), '[1,2,3]')
  const long = summarizeToolArguments(JSON.stringify({ command: 'x'.repeat(500) }))
  assert.ok(long.length <= TOOL_ARGUMENT_SUMMARY_MAX)
  assert.ok(long.endsWith('…'))
  const many = summarizeToolArguments(Object.fromEntries(Array.from({ length: 40 }, (_, index) => [`key${index}`, index])))
  assert.ok(many.length <= TOOL_ARGUMENT_SUMMARY_MAX)
})

test('空事件列表折叠为空', () => {
  assert.deepEqual(foldTranscript([]), [])
  assert.deepEqual(foldTranscript(undefined), [])
})
