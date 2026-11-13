import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import type { ServerResponse } from 'node:http'
import { z } from 'zod'
import { checkOrigin, HttpError, json, readJson, sendError, type ApiRequest } from './http.ts'

const COOKIE_NAME = 'ai_workspace_session'
const SESSION_SECONDS = 8 * 60 * 60
const credentialsSchema = z.object({
  username: z.string().min(1).max(256),
  password: z.string().min(1).max(512),
})

function authConfig() {
  const username = process.env.AUTH_USERNAME?.trim()
  const password = process.env.AUTH_PASSWORD
  const secret = process.env.SESSION_SECRET
  if (!username || !password || !secret || secret.length < 32) {
    throw new HttpError(503, '登录服务尚未配置，请联系管理员')
  }
  return { username, password, secret }
}

function equalSecret(first: string, second: string) {
  return timingSafeEqual(
    createHash('sha256').update(first).digest(),
    createHash('sha256').update(second).digest(),
  )
}

function sign(payload: string) {
  const { username, password, secret } = authConfig()
  // Rotating either credential or the session secret invalidates existing sessions.
  const key = createHmac('sha256', secret)
    .update(JSON.stringify([username, password]))
    .digest()
  return createHmac('sha256', key).update(payload).digest('base64url')
}

export function sessionUser(request: ApiRequest): string | null {
  const cookie = request.headers.cookie
    ?.split(';')
    .find((part) => part.trim().startsWith(`${COOKIE_NAME}=`))
  const token = cookie?.trim().slice(COOKIE_NAME.length + 1)
  if (!token || token.length > 2048) return null
  const [payload, signature, extra] = token.split('.')
  if (
    !payload ||
    !signature ||
    extra ||
    !/^[A-Za-z0-9_-]+$/.test(payload) ||
    !/^[A-Za-z0-9_-]+$/.test(signature)
  )
    return null
  try {
    if (!equalSecret(signature, sign(payload))) return null
    const data: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (!data || typeof data !== 'object' || !('sub' in data) || !('exp' in data)) return null
    const { username } = authConfig()
    return data.sub === username &&
      typeof data.exp === 'number' &&
      Number.isFinite(data.exp) &&
      data.exp > Date.now()
      ? username
      : null
  } catch {
    return null
  }
}

function setSession(request: ApiRequest, response: ServerResponse, username: string | null) {
  let token = ''
  if (username) {
    const payload = Buffer.from(
      JSON.stringify({ sub: username, exp: Date.now() + SESSION_SECONDS * 1000 }),
    ).toString('base64url')
    token = `${payload}.${sign(payload)}`
  }
  const tls = 'encrypted' in request.socket && request.socket.encrypted === true
  const secure =
    process.env.VERCEL === '1' || request.headers['x-forwarded-proto'] === 'https' || tls
  response.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${token}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=${username ? SESSION_SECONDS : 0}${secure ? '; Secure' : ''}`,
  )
}

export async function handleAuth(request: ApiRequest, response: ServerResponse) {
  try {
    checkOrigin(request)
    if (request.method === 'GET') {
      json(response, 200, { username: sessionUser(request) })
    } else if (request.method === 'POST') {
      const input = credentialsSchema.safeParse(await readJson(request))
      if (!input.success) throw new HttpError(401, '账号或密码错误，请重新输入')
      const config = authConfig()
      const accountMatches = equalSecret(input.data.username, config.username)
      const passwordMatches = equalSecret(input.data.password, config.password)
      if (!accountMatches || !passwordMatches)
        throw new HttpError(401, '账号或密码错误，请重新输入')
      setSession(request, response, config.username)
      json(response, 200, { username: config.username })
    } else if (request.method === 'DELETE') {
      setSession(request, response, null)
      json(response, 200, { username: null })
    } else {
      response.setHeader('Allow', 'GET, POST, DELETE')
      throw new HttpError(405, '不支持此请求方法')
    }
  } catch (error) {
    sendError(response, error)
  }
}
