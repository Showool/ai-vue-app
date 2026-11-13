<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { ElButton, ElIcon, ElInput, ElTooltip } from 'element-plus'
import type { InputInstance } from 'element-plus'
import {
  ArrowUp,
  EditPen,
  Loading,
  MagicStick,
  Reading,
  RefreshLeft,
  Right,
} from '@element-plus/icons-vue'
import { MAX_USER_CONTENT_LENGTH } from '../types/chat.ts'
import { useChatStore } from '../stores/chat'
import { useAuthStore } from '../stores/auth'
import { ApiError, requestJson } from '../services/api'

const chat = useChatStore()
const auth = useAuthStore()
const { messages, storageError } = storeToRefs(chat)
const draft = ref('')
const sending = ref(false)
const error = ref('')
const messageList = ref<HTMLElement>()
const inputRef = ref<InputInstance>()
let controller: AbortController | undefined

async function scrollToLatest(behavior: ScrollBehavior = 'smooth') {
  await nextTick()
  messageList.value?.scrollTo({ top: messageList.value.scrollHeight, behavior })
}

onMounted(() => {
  void scrollToLatest('instant')
})
onBeforeUnmount(() => controller?.abort())

function formatTime(createdAt: string) {
  return new Date(createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}
const suggestions = [
  {
    title: '梳理一个新想法',
    description: '把零散的灵感，变成清晰的思路',
    prompt: '我有一个新想法，请帮我梳理思路：',
    icon: MagicStick,
    color: 'violet',
  },
  {
    title: '让表达更清晰',
    description: '一起打磨文字，让表达恰到好处',
    prompt: '请帮我润色下面这段文字：',
    icon: EditPen,
    color: 'blue',
  },
  {
    title: '探索一个新问题',
    description: '换个角度，发现更多可能性',
    prompt: '我想了解一个新问题：',
    icon: Reading,
    color: 'amber',
  },
]

async function useSuggestion(prompt: string) {
  draft.value = prompt
  await nextTick()
  inputRef.value?.focus()
}

async function sendMessage() {
  const content = draft.value.trim()
  if (!content || sending.value) return
  chat.appendMessage('user', content)
  draft.value = ''
  await requestReply()
}

async function requestReply() {
  if (sending.value) return
  sending.value = true
  error.value = ''
  const requestController = new AbortController()
  controller = requestController
  const timeout = setTimeout(() => requestController.abort(new Error('timeout')), 60000)
  void scrollToLatest()
  try {
    const reply = await requestJson<{ content: string }>('/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        messages: messages.value.map(({ role, content }) => ({ role, content })),
      }),
      signal: requestController.signal,
    })
    if (requestController.signal.aborted) return
    if (typeof reply.content !== 'string' || !reply.content.trim()) throw new Error('empty reply')
    chat.appendMessage('assistant', reply.content)
    await scrollToLatest()
  } catch (cause) {
    if (requestController.signal.aborted && requestController.signal.reason?.message !== 'timeout')
      return
    if (cause instanceof ApiError && cause.status === 401) await auth.restoreSession()
    error.value = cause instanceof ApiError ? cause.message : '请求失败或超时，请检查网络后重试'
  } finally {
    clearTimeout(timeout)
    if (controller === requestController) {
      controller = undefined
      sending.value = false
      inputRef.value?.focus()
    }
  }
}

async function resetConversation() {
  controller?.abort()
  controller = undefined
  sending.value = false
  draft.value = ''
  error.value = ''
  chat.resetConversation()
  await nextTick()
  messageList.value?.scrollTo({ top: 0, behavior: 'instant' })
  inputRef.value?.focus()
}

function handleKeydown(event: Event | KeyboardEvent) {
  if (!(event instanceof KeyboardEvent)) return
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229) {
    event.preventDefault()
    void sendMessage()
  }
}
</script>

<template>
  <main class="chat-page">
    <div class="chat-actions">
      <el-tooltip content="重置对话" placement="bottom" :trigger-keys="[]">
        <el-button
          class="reset-chat-button"
          text
          circle
          :icon="RefreshLeft"
          aria-label="重置对话"
          @click="resetConversation"
        />
      </el-tooltip>
    </div>
    <div
      ref="messageList"
      class="chat-scroll-area"
      role="log"
      aria-label="对话记录"
      aria-live="polite"
      aria-relevant="additions"
    >
      <section v-if="!messages.length" class="chat-welcome">
        <h1 class="welcome-title">今天，有什么新想法？</h1>
        <div class="suggestion-grid">
          <button
            v-for="suggestion in suggestions"
            :key="suggestion.title"
            type="button"
            class="suggestion-card"
            @click="useSuggestion(suggestion.prompt)"
          >
            <span class="suggestion-icon" :class="suggestion.color"
              ><el-icon><component :is="suggestion.icon" /></el-icon
            ></span>
            <strong>{{ suggestion.title }}</strong
            ><span class="suggestion-description">{{ suggestion.description }}</span
            ><el-icon class="suggestion-arrow"><Right /></el-icon>
          </button>
        </div>
      </section>
      <div v-else class="message-list">
        <article
          v-for="message in messages"
          :key="message.id"
          class="message"
          :class="`message-${message.role}`"
        >
          <span class="message-avatar"
            ><el-icon v-if="message.role === 'assistant'"><MagicStick /></el-icon
            ><span v-else>A</span></span
          >
          <div class="message-body">
            <div class="message-meta">
              <strong>{{ message.role === 'user' ? '你' : 'AI' }}</strong
              ><time :datetime="message.createdAt">{{ formatTime(message.createdAt) }}</time>
            </div>
            <div class="message-bubble">{{ message.content }}</div>
          </div>
        </article>
        <article v-if="sending" class="message message-assistant" role="status">
          <span class="message-avatar" aria-hidden="true"
            ><el-icon><MagicStick /></el-icon
          ></span>
          <div class="message-body">
            <div class="message-meta"><strong>AI</strong></div>
            <div class="message-bubble message-loading">
              <el-icon class="is-loading" aria-hidden="true"><Loading /></el-icon>
              <span>正在回复…</span>
            </div>
          </div>
        </article>
      </div>
    </div>
    <div class="composer-area">
      <form class="composer" @submit.prevent="sendMessage">
        <label for="chat-input" class="sr-only">输入消息</label>
        <el-input
          id="chat-input"
          ref="inputRef"
          v-model="draft"
          type="textarea"
          :autosize="{ minRows: 1, maxRows: 6 }"
          :maxlength="MAX_USER_CONTENT_LENGTH"
          resize="none"
          placeholder="请输入消息…"
          @keydown="handleKeydown"
        />
        <el-tooltip content="发送消息" placement="top"
          ><el-button
            class="send-button"
            type="primary"
            :icon="ArrowUp"
            native-type="submit"
            :disabled="sending || !draft.trim()"
            :loading="sending"
            aria-label="发送消息"
        /></el-tooltip>
      </form>
      <p v-if="error" class="chat-error" role="alert">
        {{ error }}
        <el-button
          v-if="messages.at(-1)?.role === 'user'"
          link
          type="primary"
          :disabled="sending"
          @click="requestReply"
          >重试</el-button
        >
      </p>
      <p v-if="storageError" class="chat-error" role="alert">{{ storageError }}</p>
    </div>
  </main>
</template>
