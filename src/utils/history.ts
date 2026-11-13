import {
  MAX_HISTORY_MESSAGES,
  MAX_MESSAGE_CONTENT_LENGTH,
  type ChatMessage,
} from '../types/chat.ts'

export const HISTORY_STORAGE_KEY = 'ai-workspace-chat:admin:v1'

export interface HistoryStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export function retainRecentMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.slice(-MAX_HISTORY_MESSAGES)
}

export function parseHistory(raw: string | null): ChatMessage[] {
  try {
    const data: unknown = JSON.parse(raw ?? '[]')
    if (!Array.isArray(data)) return []
    const messages: ChatMessage[] = []
    for (const item of data) {
      if (!item || typeof item !== 'object') continue
      const message = item as Record<string, unknown>
      if (typeof message.id !== 'string' || !message.id || message.id.length > 128) continue
      if (message.role !== 'user' && message.role !== 'assistant') continue
      if (
        typeof message.content !== 'string' ||
        !message.content.trim() ||
        message.content.length > MAX_MESSAGE_CONTENT_LENGTH
      )
        continue
      if (typeof message.createdAt !== 'string' || !Number.isFinite(Date.parse(message.createdAt)))
        continue
      messages.push({
        id: message.id,
        role: message.role,
        content: message.content,
        createdAt: message.createdAt,
      })
    }
    return retainRecentMessages(messages)
  } catch {
    return []
  }
}

export function createHistoryRepository(storage: HistoryStorage | null) {
  function save(messages: ChatMessage[]): boolean {
    try {
      if (!storage) return false
      storage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(retainRecentMessages(messages)))
      return true
    } catch {
      return false
    }
  }

  function load(): ChatMessage[] {
    let messages: ChatMessage[] = []
    try {
      messages = parseHistory(storage?.getItem(HISTORY_STORAGE_KEY) ?? null)
    } catch {
      return []
    }
    save(messages)
    return messages
  }

  return { load, save }
}
