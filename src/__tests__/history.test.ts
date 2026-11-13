import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHistoryRepository, HISTORY_STORAGE_KEY, parseHistory } from '../utils/history.ts'
import type { ChatMessage } from '../types/chat.ts'

function message(index: number): ChatMessage {
  return {
    id: String(index),
    role: index % 2 ? 'assistant' : 'user',
    content: `消息 ${index}`,
    createdAt: new Date(2026, 0, 1, 0, index).toISOString(),
  }
}

test('history persists across repository instances and retains only the latest 10 messages', () => {
  const values = new Map<string, string>()
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value)
    },
  }
  const history = Array.from({ length: 16 }, (_, index) => message(index))
  assert.equal(createHistoryRepository(storage).save(history), true)
  const restored = createHistoryRepository(storage).load()
  assert.deepEqual(
    restored.map((item) => item.id),
    ['6', '7', '8', '9', '10', '11', '12', '13', '14', '15'],
  )
  assert.equal(JSON.parse(values.get(HISTORY_STORAGE_KEY)!).length, 10)
})

test('loading trims existing oversized history in storage and rejects invalid records', () => {
  let raw = JSON.stringify([
    ...Array.from({ length: 12 }, (_, index) => message(index)),
    { ...message(12), role: 'system' },
    { ...message(13), createdAt: 'invalid' },
  ])
  const repository = createHistoryRepository({
    getItem: () => raw,
    setItem: (_key, value) => {
      raw = value
    },
  })
  assert.deepEqual(
    repository.load().map((item) => item.id),
    ['2', '3', '4', '5', '6', '7', '8', '9', '10', '11'],
  )
  assert.equal(JSON.parse(raw).length, 10)
  assert.deepEqual(parseHistory('broken json'), [])
  assert.deepEqual(parseHistory('{"messages":[]}'), [])
})

test('unavailable or full browser storage fails safely', () => {
  const repository = createHistoryRepository({
    getItem() {
      throw new Error('blocked')
    },
    setItem() {
      throw new Error('quota')
    },
  })
  assert.deepEqual(repository.load(), [])
  assert.equal(repository.save([message(1)]), false)
  assert.equal(createHistoryRepository(null).save([message(1)]), false)
})
