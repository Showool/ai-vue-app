import type { ServerResponse } from 'node:http'
import { z } from 'zod'
import {
  MAX_HISTORY_MESSAGES,
  MAX_MESSAGE_CONTENT_LENGTH,
  MAX_USER_CONTENT_LENGTH,
} from '../types/chat.ts'
import { runChatAgent } from '../config/agent.ts'
import { checkOrigin, HttpError, json, readJson, sendError, type ApiRequest } from './http.ts'
import { sessionUser } from './auth.ts'

export const chatRequestSchema = z
  .object({
    messages: z
      .array(
        z.object({
          role: z.enum(['user', 'assistant']),
          content: z.string().trim().min(1).max(MAX_MESSAGE_CONTENT_LENGTH),
        }),
      )
      .min(1)
      .max(MAX_HISTORY_MESSAGES),
  })
  .refine(
    (input) => {
      const last = input.messages.at(-1)
      return last?.role === 'user' && last.content.length <= MAX_USER_CONTENT_LENGTH
    },
    { message: '最后一条必须是有效的用户消息' },
  )

export async function handleChat(request: ApiRequest, response: ServerResponse) {
  try {
    checkOrigin(request)
    if (request.method !== 'POST') {
      response.setHeader('Allow', 'POST')
      throw new HttpError(405, '不支持此请求方法')
    }
    if (!sessionUser(request)) throw new HttpError(401, '登录已过期，请重新登录')
    const input = chatRequestSchema.safeParse(await readJson(request))
    if (!input.success) throw new HttpError(400, '对话格式无效，最多允许最近 10 条消息')

    const abort = new AbortController()
    const timer = setTimeout(() => abort.abort(), 50000)
    const disconnect = () => {
      if (!response.writableEnded) abort.abort()
    }
    response.on('close', disconnect)
    try {
      const content = await runChatAgent(input.data.messages, abort.signal)
      if (!response.destroyed) json(response, 200, { content })
    } catch (error) {
      if (abort.signal.aborted) throw new HttpError(504, 'AI 回复超时，请重试')
      if (error instanceof HttpError) throw error
      const status = error && typeof error === 'object' && 'status' in error ? error.status : null
      if (status === 429) throw new HttpError(429, 'AI 服务额度不足或请求过于频繁，请稍后重试')
      throw new HttpError(502, 'AI 服务请求失败，请检查服务端配置后重试')
    } finally {
      clearTimeout(timer)
      response.off('close', disconnect)
    }
  } catch (error) {
    if (!response.destroyed) sendError(response, error)
  }
}
