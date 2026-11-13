import { normalizePath, type Plugin } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { handleChat } from './chat.ts'
import { handleAuth } from './auth.ts'

export function localApi(privateValues: string | (string | undefined)[] = []): Plugin {
  const secrets = (typeof privateValues === 'string' ? [privateValues] : privateValues).filter(
    (value): value is string => Boolean(value),
  )
  const middleware = (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    const pathname = request.url?.split('?')[0]
    if (pathname === '/api/auth') void handleAuth(request, response)
    else if (pathname === '/api/chat') void handleChat(request, response)
    else next()
  }
  return {
    name: 'private-model-proxy',
    enforce: 'pre',
    load(id, options) {
      if (options?.ssr) return
      const file = normalizePath(id.split('?')[0] ?? id)
      if (/\/src\/(?:server\/|config\/(?:agent|tools)\.ts$)/.test(file)) {
        this.error('Agent、工具和模型代理只能在服务端运行，不能导入浏览器代码。')
      }
    },
    generateBundle(_options, bundle) {
      for (const output of Object.values(bundle)) {
        const contents = output.type === 'chunk' ? output.code : output.source.toString()
        if (
          secrets.some(
            (secret) =>
              contents.includes(secret) || contents.includes(JSON.stringify(secret).slice(1, -1)),
          )
        ) {
          this.error('检测到服务端私密配置出现在浏览器构建产物中，已阻止构建。')
        }
      }
    },
    configureServer(server) {
      server.middlewares.use(middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    },
  }
}
