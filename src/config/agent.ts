import { createAgent } from 'langchain'
import { ChatOpenAI } from '@langchain/openai'
import { AIMessage, HumanMessage } from '@langchain/core/messages'
import { awaitAllCallbacks } from '@langchain/core/callbacks/promises'
import type { ChatInputMessage } from '../types/chat.ts'
import { MAX_MESSAGE_CONTENT_LENGTH } from '../types/chat.ts'
import { HttpError } from '../server/http.ts'
import { agentTools } from './tools.ts'

export async function runChatAgent(
  messages: ChatInputMessage[],
  signal: AbortSignal,
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) throw new HttpError(503, '请先在服务端环境文件中配置 OPENAI_API_KEY')

  const model = new ChatOpenAI({
    apiKey,
    model: process.env.OPENAI_MODEL?.trim() || 'gpt-5-mini',
    maxTokens: 4096,
    timeout: 45000,
    maxRetries: 0,
    configuration: process.env.OPENAI_BASE_URL?.trim()
      ? { baseURL: process.env.OPENAI_BASE_URL.trim() }
      : undefined,
  })
  const agent = createAgent({
    model,
    tools: agentTools,
    systemPrompt:
      '你是 AI Workspace 的对话助手。默认使用简体中文，回答清晰、准确、简洁。需要当前日期或时间时调用 get_current_time 工具，默认时区为 Asia/Shanghai。不编造工具结果。',
  })

  const inputMessages = messages.map((message) =>
    message.role === 'user' ? new HumanMessage(message.content) : new AIMessage(message.content),
  )
  try {
    const result = await agent.invoke(
      { messages: inputMessages },
      { signal, recursionLimit: 12, runName: 'ai-workspace-chat' },
    )
    const reply = result.messages.at(-1)
    if (!reply || !AIMessage.isInstance(reply))
      throw new HttpError(502, 'AI 未返回有效回答，请重试')
    const content =
      typeof reply.content === 'string'
        ? reply.content
        : reply.content
            .flatMap((block) =>
              block.type === 'text' && typeof block.text === 'string' ? [block.text] : [],
            )
            .join('\n')
    if (!content.trim()) throw new HttpError(502, 'AI 返回了空回答，请重试')
    return content.trim().slice(0, MAX_MESSAGE_CONTENT_LENGTH)
  } finally {
    // Flush queued traces before Vercel ends the function, including failed or aborted runs.
    if (process.env.LANGSMITH_TRACING === 'true') await awaitAllCallbacks()
  }
}
