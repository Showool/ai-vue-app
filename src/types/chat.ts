export const MAX_HISTORY_MESSAGES = 10
export const MAX_USER_CONTENT_LENGTH = 4000
export const MAX_MESSAGE_CONTENT_LENGTH = 16000

export interface ChatInputMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ChatMessage extends ChatInputMessage {
  id: string
  createdAt: string
}
