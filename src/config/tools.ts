import { tool } from 'langchain'
import { z } from 'zod'

export const getCurrentTime = tool(
  ({ timeZone }) => {
    try {
      return new Intl.DateTimeFormat('zh-CN', {
        timeZone,
        dateStyle: 'full',
        timeStyle: 'long',
      }).format(new Date())
    } catch {
      return '无效的 IANA 时区，请使用 Asia/Shanghai 等有效时区。'
    }
  },
  {
    name: 'get_current_time',
    description: '查询指定 IANA 时区的当前日期与时间。用户未指定时区时使用 Asia/Shanghai。',
    schema: z.object({ timeZone: z.string().describe('IANA 时区，例如 Asia/Shanghai') }),
  },
)

// Define additional tools with tool(...) above, then add them to this registry.
// Tool execution stays on the server; browsers cannot supply tool definitions.
export const agentTools = [getCurrentTime]
