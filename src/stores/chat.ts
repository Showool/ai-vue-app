import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { ChatMessage, ChatInputMessage } from '../types/chat.ts'
import { createHistoryRepository, retainRecentMessages } from '../utils/history.ts'

function browserStorage() {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export const useChatStore = defineStore('chat', () => {
  const history = createHistoryRepository(browserStorage())
  const messages = ref<ChatMessage[]>(history.load())
  const storageError = ref('')

  function persistHistory() {
    storageError.value = history.save(messages.value)
      ? ''
      : '浏览器无法保存历史记录，请检查存储权限或剩余空间。'
  }

  function appendMessage(role: ChatInputMessage['role'], content: string) {
    messages.value = retainRecentMessages([
      ...messages.value,
      { id: crypto.randomUUID(), role, content, createdAt: new Date().toISOString() },
    ])
    persistHistory()
  }

  function resetConversation() {
    messages.value = []
    persistHistory()
  }

  return { messages, storageError, appendMessage, resetConversation }
})
