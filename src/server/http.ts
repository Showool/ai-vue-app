import type { IncomingMessage, ServerResponse } from 'node:http'

export type ApiRequest = IncomingMessage & { body?: unknown }

export class HttpError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export function json(response: ServerResponse, status: number, data: unknown) {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.end(JSON.stringify(data))
}

export async function readJson(request: ApiRequest): Promise<unknown> {
  if (!request.headers['content-type']?.startsWith('application/json')) {
    throw new HttpError(415, '请求必须使用 JSON 格式')
  }
  if (request.body !== undefined) {
    const body = typeof request.body === 'string' ? request.body : JSON.stringify(request.body)
    if (Buffer.byteLength(body) > 512 * 1024) throw new HttpError(413, '请求内容过长')
    try {
      return JSON.parse(body)
    } catch {
      throw new HttpError(400, '请求内容不是有效的 JSON')
    }
  }

  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > 512 * 1024) throw new HttpError(413, '请求内容过长')
    chunks.push(buffer)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new HttpError(400, '请求内容不是有效的 JSON')
  }
}

export function checkOrigin(request: ApiRequest) {
  const origin = request.headers.origin
  if (origin && new URL(origin).host !== request.headers.host) {
    throw new HttpError(403, '不允许跨站请求')
  }
}

export function sendError(response: ServerResponse, error: unknown) {
  if (error instanceof HttpError) {
    json(response, error.status, { error: error.message })
  } else {
    // Do not expose provider errors, request bodies or credentials to the browser.
    json(response, 500, { error: '服务暂时不可用，请稍后重试' })
  }
}
